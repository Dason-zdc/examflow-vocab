#!/usr/bin/env python
"""P1：词根表 / 同源词群 / 记忆公式 / 派生词。

在数据包重建之后运行，就地 enrich 每个 chunk：
  - 词根（roots.json = wordroot.txt + 手工校订高频词根），词素边界匹配，不做裸子串匹配；
  - 同源词群：以词根为键从 ECDICT 召回，按常用度排序、过滤专名与生僻词；
  - 记忆公式：只用词根表 / 词缀表里查得到的成分拼接，不编造联想；
  - 派生词：ECDICT exchange + 后缀派生（产物必须在 ECDICT 中存在）。

用法：
  python scripts/build_word_families.py [--dry]
"""
import bisect
import csv
import glob
import hashlib
import json
import os
import re
import sys
import unicodedata

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PACK_DIR = os.path.join(SCRIPT_DIR, "..", "public", "packs", "IELTS")
ECDICT_CSV = os.path.join(SCRIPT_DIR, ".cache", "ecdict.csv")
WORDROOT_JSON = os.path.join(SCRIPT_DIR, ".cache", "wordroot.txt")
ROOTS_JSON = os.path.join(SCRIPT_DIR, "roots.json")
ETYM_RAW_JSON = os.path.join(SCRIPT_DIR, "build", "etymology-raw.json")

# 词源分组时信任的来源语言（拉丁/希腊/古法语等，能反映真实同源关系）
ETYM_PREFER_LANGS = {"la", "grc", "fro", "enm", "ang", "frm", "non", "xno", "la-med", "gem-pro", "ine-pro", "it"}
ETYM_ROOT_GROUP_MAX = 12   # 原始词根（PIE）分组的规模上限，超过则视为过宽、不用于同源判定
# 展示用标签的语言优先级：越靠前越优先（拉丁/希腊最能反映词根本义）
ETYM_LABEL_LANGS = ("la", "grc", "la-med", "it", "frm", "fro", "xno", "enm", "ang", "non", "gem-pro", "ine-pro")
# 语言代码 -> 中文名（界面不暴露 ISO 代码）
LANG_NAMES = {
    "la": "拉丁语", "grc": "古希腊语", "la-med": "中世纪拉丁语", "it": "意大利语",
    "frm": "中古法语", "fro": "古法语", "xno": "盎格鲁-诺曼语", "enm": "中古英语",
    "ang": "古英语", "non": "古诺尔斯语", "gem-pro": "原始日耳曼语",
    "ine-pro": "原始印欧语", "fr": "法语", "en": "英语",
}

NEXT_VERSION = "1.5.0"
MAX_FAMILY = 8
MAX_DERIV = 6
MAX_FREQ = 30000           # 生僻词上限：frq 序号大于此值不召回
MIN_FREQ = 1               # frq = 0 表示无词频数据，不召回
WORD_RE = re.compile(r"^[a-z]{3,18}$")

# ---------------------------------------------------------------------------
# 手工校订的高频词根：wordroot.txt 未收录，但雅思高频词里反复出现。
# 每条都给出明确语源与示例词，示例词必须能在 ECDICT 里查到。
# ---------------------------------------------------------------------------
CURATED_ROOTS = {
    "cit": ("唤起、刺激", "Latin", ["excite", "incite", "recite", "citation", "solicit"]),
    "spect": ("看、观察", "Latin", ["inspect", "prospect", "respect", "spectator", "retrospect"]),
    "act": ("做、驱动", "Latin", ["action", "active", "react", "interact", "transaction"]),
    "duct": ("引导、带领", "Latin", ["conduct", "induce", "product", "educate", "introduction"]),
    "fer": ("带来、运送", "Latin", ["transfer", "refer", "conference", "offer", "infer"]),
    "mit": ("送、放", "Latin", ["commit", "submit", "permit", "transmit", "emit"]),
    "miss": ("送、放", "Latin", ["mission", "dismiss", "emission", "submission", "permissive"]),
    "pos": ("放置", "Latin", ["position", "compose", "expose", "propose", "deposit"]),
    "scrib": ("写", "Latin", ["describe", "subscribe", "prescribe", "manuscript", "describe"]),
    "script": ("写", "Latin", ["description", "prescription", "transcript", "scripture"]),
    "struct": ("建造", "Latin", ["structure", "construct", "instruct", "obstruct", "infrastructure"]),
    "tract": ("拉、拖", "Latin", ["attract", "contract", "extract", "abstract", "subtract"]),
    "vert": ("转", "Latin", ["convert", "reverse", "divert", "invert", "controversy"]),
    "vers": ("转", "Latin", ["universe", "diverse", "conversation", "adverse", "versatile"]),
    "vis": ("看", "Latin", ["vision", "revise", "supervise", "visible", "evident"]),
    "vid": ("看", "Latin", ["video", "provide", "evidence", "divide", "individual"]),
    "cred": ("信任", "Latin", ["credit", "incredible", "credible", "credential"]),
    "cur": ("关心、跑", "Latin", ["current", "occur", "secure", "curriculum", "concurrent"]),
    "dict": ("说", "Latin", ["predict", "dictionary", "contradict", "indicate", "verdict"]),
    "fac": ("做", "Latin", ["factory", "manufacture", "facilitate", "facility", "beneficial"]),
    "fect": ("做", "Latin", ["effect", "affect", "perfect", "infect", "defect"]),
    "ject": ("投、抛", "Latin", ["project", "reject", "inject", "object", "subject"]),
    "lect": ("选、读", "Latin", ["select", "collect", "lecture", "elect", "intellectual"]),
    "log": ("说、学问", "Greek", ["logic", "dialogue", "biology", "technology", "catalogue"]),
    "mot": ("动", "Latin", ["motion", "promote", "emotion", "motor", "motive"]),
    "pend": ("挂、称量、花费", "Latin", ["depend", "expend", "suspend", "independent", "compensate"]),
    "plic": ("折叠", "Latin", ["apply", "complicate", "implicit", "explicit", "imply"]),
    "rupt": ("断裂", "Latin", ["interrupt", "corrupt", "erupt", "bankrupt", "disrupt"]),
    "sci": ("知道", "Latin", ["science", "conscious", "scientific", "conscience"]),
    "sect": ("切", "Latin", ["section", "insect", "sector", "intersection", "dissect"]),
    "sens": ("感觉", "Latin", ["sense", "sensitive", "consensus", "sensible", "sensation"]),
    "sent": ("感觉", "Latin", ["sentence", "consent", "resent", "sentiment", "assent"]),
    "sequ": ("跟随", "Latin", ["consequence", "sequence", "subsequent", "consequent"]),
    "sist": ("站", "Latin", ["insist", "resist", "consist", "persist", "assist"]),
    "spir": ("呼吸", "Latin", ["inspire", "expire", "respire", "conspire", "aspiration"]),
    "sta": ("站", "Latin", ["stable", "station", "constant", "distance", "instant"]),
    "stit": ("站、设立", "Latin", ["institute", "constitute", "substitute", "statute"]),
    "tain": ("握、持", "Latin", ["maintain", "retain", "obtain", "sustain", "contain"]),
    "tend": ("伸展", "Latin", ["intend", "extend", "attend", "tendency", "pretend"]),
    "test": ("见证", "Latin", ["testify", "protest", "contest", "testimony", "attest"]),
    "ven": ("来", "Latin", ["prevent", "event", "invent", "convention", "intervene"]),
    "voc": ("叫、声音", "Latin", ["vocal", "advocate", "vocabulary", "evoke", "provoke"]),
    "volv": ("滚、转", "Latin", ["involve", "evolve", "revolve", "revolution", "evolution"]),
    "gen": ("生、种类", "Greek", ["generate", "generation", "general", "genetic", "oxygen"]),
    "graph": ("写、记录", "Greek", ["paragraph", "photograph", "geography", "biography"]),
    "meter": ("测量", "Greek", ["meter", "diameter", "parameter", "thermometer"]),
    "path": ("感情、痛苦", "Greek", ["sympathy", "empathy", "pathetic", "pathology"]),
    "ped": ("脚", "Latin", ["pedestrian", "pedal", "expedite", "impede"]),
    "plet": ("满", "Latin", ["complete", "deplete", "complement", "supplement"]),
    "press": ("压", "Latin", ["pressure", "express", "impress", "compress", "suppress"]),
    "quir": ("寻求", "Latin", ["require", "acquire", "inquire", "conquer", "request"]),
    "reg": ("统治、直", "Latin", ["regulate", "region", "regular", "regime", "regent"]),
    "serv": ("保持、服务", "Latin", ["preserve", "reserve", "observe", "deserve", "conservative"]),
    "son": ("声音", "Latin", ["sound", "resonant", "sonic", "consonant", "supersonic"]),
    "speci": ("种类、外观", "Latin", ["special", "species", "specific", "specify", "specimen"]),
    "sum": ("拿、取", "Latin", ["assume", "consume", "presume", "resume", "summary"]),
    "tang": ("触", "Latin", ["tangible", "contact", "intact", "contaminate"]),
    "temp": ("时间", "Latin", ["temporary", "contemporary", "temperate", "temple"]),
    "terr": ("地", "Latin", ["territory", "terrain", "terrestrial", "mediterranean"]),
    "val": ("强、价值", "Latin", ["value", "valid", "evaluate", "equivalent", "prevail"]),
    "ver": ("真", "Latin", ["verify", "very", "verdict", "severe", "persevere"]),
    "viv": ("活", "Latin", ["survive", "vivid", "revive", "vital", "victual"]),
    "volve": ("滚、转", "Latin", ["involve", "evolve", "revolve", "volume"]),
    # ---- 第二批：常用拉丁 / 希腊词根（按词频与构词力挑选） ----
    "aud": ("听", "Latin", ["audience", "audio", "audible", "audit"]),
    "bene": ("好、善", "Latin", ["benefit", "beneficial", "benevolent"]),
    "cap": ("拿、取", "Latin", ["capture", "capacity", "capable", "capital"]),
    "cept": ("拿、取", "Latin", ["accept", "concept", "except", "perception"]),
    "ceive": ("拿、取", "Latin", ["receive", "perceive", "conceive", "deceive"]),
    "cid": ("切、落下", "Latin", ["decide", "incident", "accident", "suicide"]),
    "cis": ("切", "Latin", ["decision", "incision", "scissors", "excise"]),
    "clam": ("呼喊", "Latin", ["claim", "exclaim", "proclaim", "clamor"]),
    "clud": ("关闭", "Latin", ["include", "conclude", "exclude", "seclude"]),
    "clus": ("关闭", "Latin", ["conclusion", "inclusive", "exclusive"]),
    "corp": ("身体", "Latin", ["corporate", "corporation", "incorporate"]),
    "cycl": ("圆、环", "Greek", ["cycle", "bicycle", "recycle", "cyclone"]),
    "dem": ("人民", "Greek", ["democracy", "epidemic", "demography"]),
    "dent": ("牙齿", "Latin", ["dental", "dentist", "indent"]),
    "equ": ("相等", "Latin", ["equal", "equator", "equivalent", "adequate"]),
    "fid": ("信任", "Latin", ["confidence", "confident", "fidelity", "confide"]),
    "fin": ("结束、界限", "Latin", ["final", "finish", "define", "infinite"]),
    "firm": ("坚固", "Latin", ["firm", "confirm", "affirm", "infirm"]),
    "flex": ("弯曲", "Latin", ["flexible", "flexibility", "inflexible"]),
    "flect": ("弯曲", "Latin", ["reflect", "deflect", "inflect"]),
    "flu": ("流", "Latin", ["fluent", "influence", "fluid", "flush"]),
    "fort": ("强", "Latin", ["fortune", "effort", "comfort", "fortify"]),
    "frag": ("破碎", "Latin", ["fragment", "fragile", "fragmentary"]),
    "fract": ("破碎", "Latin", ["fraction", "fracture", "infraction"]),
    "fug": ("逃", "Latin", ["refuge", "fugitive", "centrifugal"]),
    "grad": ("步、级", "Latin", ["grade", "gradual", "graduate", "ingredient"]),
    "gress": ("走", "Latin", ["progress", "congress", "aggressive", "digress"]),
    "grav": ("重", "Latin", ["gravity", "grave", "aggravate", "gravity"]),
    "greg": ("群", "Latin", ["aggregate", "congregate", "segregate"]),
    "hab": ("拥有、居住", "Latin", ["habit", "inhabit", "habitat"]),
    "hibit": ("持有", "Latin", ["exhibit", "prohibit", "inhibit"]),
    "hydr": ("水", "Greek", ["hydrogen", "hydrate", "dehydrate"]),
    "jud": ("判断", "Latin", ["judge", "judicial", "prejudice", "judgment"]),
    "jur": ("法律、宣誓", "Latin", ["jury", "justice", "injure", "jurisdiction"]),
    "labor": ("劳动", "Latin", ["labor", "laboratory", "collaborate", "elaborate"]),
    "liber": ("自由", "Latin", ["liberty", "liberal", "liberate", "deliberate"]),
    "lig": ("绑、选", "Latin", ["obligate", "religion", "ligament", "eligible"]),
    "liter": ("文字", "Latin", ["literature", "literal", "literacy"]),
    "loc": ("地方", "Latin", ["local", "location", "allocate", "dislocate"]),
    "magn": ("大", "Latin", ["magnificent", "magnitude", "magnify"]),
    "man": ("手", "Latin", ["manual", "manufacture", "manipulate", "manifest"]),
    "mar": ("海", "Latin", ["marine", "maritime", "submarine"]),
    "medi": ("中间", "Latin", ["medium", "mediate", "immediate", "medieval"]),
    "memor": ("记忆", "Latin", ["memory", "memorial", "remember", "commemorate"]),
    "merg": ("沉、浸", "Latin", ["emerge", "submerge", "merge", "immerse"]),
    "migr": ("迁移", "Latin", ["migrate", "immigrant", "emigrate"]),
    "milit": ("兵", "Latin", ["military", "militant", "militia"]),
    "min": ("小、突出", "Latin", ["minor", "minimum", "minute", "diminish"]),
    "mir": ("惊奇、看", "Latin", ["mirror", "admire", "miracle", "mirage"]),
    "mod": ("方式、尺度", "Latin", ["model", "modern", "modify", "moderate"]),
    "mort": ("死", "Latin", ["mortal", "mortgage", "immortal", "mortality"]),
    "mut": ("改变", "Latin", ["mutual", "mutate", "commute", "mutation"]),
    "nat": ("出生", "Latin", ["nature", "native", "nation", "innate"]),
    "nav": ("船、航行", "Latin", ["navy", "navigate", "naval"]),
    "neg": ("否定", "Latin", ["negative", "neglect", "negotiate"]),
    "nomin": ("名字", "Latin", ["nominal", "nominate", "denomination"]),
    "norm": ("标准", "Latin", ["normal", "norm", "enormous", "abnormal"]),
    "not": ("标记、知道", "Latin", ["note", "notice", "notion", "notify"]),
    "nov": ("新", "Latin", ["novel", "innovate", "nova", "renovate"]),
    "numer": ("数", "Latin", ["number", "numerous", "enumerate", "numerical"]),
    "oper": ("工作", "Latin", ["operate", "operation", "cooperate"]),
    "opt": ("选择、眼", "Greek", ["option", "optical", "optimal", "adopt"]),
    "ori": ("升起、开始", "Latin", ["origin", "orient", "original", "aboriginal"]),
    "orn": ("装饰", "Latin", ["ornament", "adorn", "ornate"]),
    "par": ("相等", "Latin", ["parity", "compare", "disparity", "peer"]),
    "patr": ("父", "Latin", ["patriot", "paternal", "patron", "patriarch"]),
    "pel": ("推、驱", "Latin", ["compel", "expel", "propel", "dispel"]),
    "puls": ("推、驱", "Latin", ["compulsion", "expulsion", "pulse", "propulsion"]),
    "pet": ("追求", "Latin", ["compete", "appetite", "petition", "impetus"]),
    "phil": ("爱", "Greek", ["philosophy", "philanthropy"]),
    "phon": ("声音", "Greek", ["phone", "phonetic", "telephone", "symphony"]),
    "photo": ("光", "Greek", ["photograph", "photon", "photosynthesis"]),
    "pict": ("画", "Latin", ["picture", "depict", "pictorial"]),
    "plan": ("平", "Latin", ["plan", "plane", "plain", "explain"]),
    "polit": ("城邦、政治", "Greek", ["politics", "policy", "metropolis", "police"]),
    "popul": ("人民", "Latin", ["population", "popular", "populate"]),
    "pot": ("力量", "Latin", ["potential", "potent", "impotent", "potency"]),
    "prim": ("第一", "Latin", ["primary", "prime", "primitive", "prince"]),
    "priv": ("私人", "Latin", ["private", "privilege", "deprive"]),
    "prob": ("证明、试验", "Latin", ["problem", "probe", "approve", "probable"]),
    "psych": ("心智", "Greek", ["psychology", "psychiatric", "psyche"]),
    "punct": ("点、刺", "Latin", ["punctual", "puncture", "punctuation"]),
    "put": ("计算、想", "Latin", ["compute", "dispute", "reputation", "impute"]),
    "radi": ("根、射线", "Latin", ["radio", "radical", "radiate", "radius"]),
    "rect": ("直、正", "Latin", ["correct", "direct", "rectify", "erect"]),
    "rid": ("笑", "Latin", ["ridiculous", "deride", "ridicule"]),
    "rod": ("咬、蚀", "Latin", ["corrode", "erode", "rodent"]),
    "rog": ("问", "Latin", ["interrogate", "arrogant", "prerogative", "derogatory"]),
    "sanct": ("神圣", "Latin", ["sanctuary", "sanction", "sanctify"]),
    "sat": ("足够", "Latin", ["satisfy", "saturate", "satiety"]),
    "scend": ("攀爬", "Latin", ["ascend", "descend", "transcend"]),
    "scope": ("看", "Greek", ["microscope", "telescope", "scope"]),
    "sen": ("老", "Latin", ["senior", "senate", "senile"]),
    "sign": ("标记", "Latin", ["sign", "signal", "significant", "design"]),
    "simil": ("相似", "Latin", ["similar", "assimilate", "simulate"]),
    "soci": ("同伴", "Latin", ["social", "society", "associate", "sociology"]),
    "sol": ("太阳、单独", "Latin", ["solar", "sole", "solitude", "solitary"]),
    "soph": ("智慧", "Greek", ["philosophy", "sophisticated", "sophomore"]),
    "sphere": ("球", "Greek", ["sphere", "atmosphere", "hemisphere"]),
    "suad": ("劝", "Latin", ["persuade", "dissuade", "suave"]),
    "surg": ("升起", "Latin", ["surge", "surgery", "insurgent", "resurgent"]),
    "techn": ("技艺", "Greek", ["technology", "technique", "technical"]),
    "tele": ("远", "Greek", ["telephone", "television", "telecommunication"]),
    "termin": ("界限", "Latin", ["term", "terminal", "determine", "terminate"]),
    "therm": ("热", "Greek", ["thermal", "thermometer", "thermos"]),
    "tim": ("害怕", "Latin", ["timid", "intimidate", "timorous"]),
    "tort": ("扭", "Latin", ["torture", "distort", "retort", "extort"]),
    "trib": ("给予、分配", "Latin", ["tribute", "attribute", "distribute", "contribute"]),
    "trud": ("推", "Latin", ["intrude", "extrude", "protrude"]),
    "typ": ("型式", "Greek", ["type", "typical", "prototype", "typology"]),
    "vac": ("空", "Latin", ["vacant", "vacuum", "vacation", "evacuate"]),
    "vad": ("走", "Latin", ["invade", "evade", "pervade"]),
    "vag": ("漫游", "Latin", ["vague", "vagrant", "extravagant", "vagabond"]),
    "var": ("变化", "Latin", ["vary", "various", "variable"]),
    "vest": ("衣服", "Latin", ["vest", "invest", "investigate", "vestment"]),
    "via": ("道路", "Latin", ["via", "voyage", "deviate", "obvious"]),
    "vict": ("征服", "Latin", ["victory", "convict", "victim", "convince"]),
    "vir": ("人、力", "Latin", ["virtue", "virtual", "virile", "virtuoso"]),
    "vit": ("生命", "Latin", ["vital", "vitamin", "vitality"]),
    "vor": ("吃", "Latin", ["devour", "carnivore", "voracious"]),
    "amb": ("走、周围", "Latin", ["ambition", "ambiguous", "ambulance"]),
    "anim": ("生命、精神", "Latin", ["animal", "animate", "unanimous", "animosity"]),
    "ann": ("年", "Latin", ["annual", "anniversary", "perennial"]),
    "anthrop": ("人类", "Greek", ["anthropology", "misanthropy", "philanthropy"]),
    "arch": ("统治、首要", "Greek", ["architect", "monarchy", "anarchy", "archive"]),
    "bat": ("打", "Latin", ["battle", "debate", "combat", "battery"]),
    "brev": ("短", "Latin", ["brief", "abbreviate", "brevity"]),
    "cand": ("白、发光", "Latin", ["candidate", "candle", "candid", "incandescent"]),
    "ced": ("走、让步", "Latin", ["proceed", "concede", "precede", "recede"]),
    "cess": ("走、让步", "Latin", ["process", "access", "success", "necessary"]),
    "centr": ("中心", "Latin", ["center", "central", "concentrate", "eccentric"]),
    "cert": ("确定", "Latin", ["certain", "certify", "ascertain", "concert"]),
    "chron": ("时间", "Greek", ["chronic", "chronicle", "synchronize", "anachronism"]),
    "circ": ("圆、环", "Latin", ["circle", "circuit", "circumstance", "circulation"]),
    "civ": ("公民", "Latin", ["civil", "civilize", "civic", "civilian"]),
    "cogn": ("知道", "Latin", ["recognize", "cognitive", "cognizant", "incognito"]),
    "cord": ("心", "Latin", ["record", "accord", "cordial", "discord"]),
    "cosm": ("宇宙", "Greek", ["cosmos", "cosmic", "cosmopolitan", "microcosm"]),
    "crit": ("判断", "Greek", ["critic", "critical", "criterion", "crisis"]),
    "cult": ("耕种、培养", "Latin", ["culture", "cultivate", "agriculture", "cult"]),
    "doc": ("教", "Latin", ["doctor", "document", "doctrine", "docile"]),
    "dom": ("屋、统治", "Latin", ["domestic", "domain", "dominate", "kingdom"]),
    "don": ("给予", "Latin", ["donate", "donor", "pardon", "condition"]),
    "duc": ("引导", "Latin", ["educate", "produce", "conduct", "induce"]),
    "dur": ("持续、硬", "Latin", ["duration", "endure", "durable", "during"]),
    "err": ("游走、错", "Latin", ["error", "errant", "aberration", "erratic"]),
    "fab": ("说", "Latin", ["fable", "fabricate", "fabulous", "affable"]),
    "fam": ("名声", "Latin", ["fame", "famous", "infamous"]),
    "fend": ("打击", "Latin", ["defend", "offend", "defense"]),
    "fess": ("说", "Latin", ["confess", "profess", "profession"]),
    "flict": ("打击", "Latin", ["conflict", "inflict", "afflict"]),
    "flor": ("花", "Latin", ["floral", "flourish", "florid"]),
    "fund": ("底、基础", "Latin", ["fund", "fundamental", "foundation", "refund"]),
    "fus": ("倾倒", "Latin", ["confuse", "refuse", "infuse", "diffuse"]),
    "gest": ("搬运、带", "Latin", ["gesture", "digest", "suggest", "congest"]),
    "gnos": ("知道", "Greek", ["diagnosis", "prognosis", "agnostic"]),
    "her": ("继承", "Latin", ["heritage", "inherit", "hereditary", "heir"]),
    "hes": ("粘附", "Latin", ["adhesive", "cohesive", "hesitate", "inherent"]),
    "horr": ("害怕", "Latin", ["horror", "horrible", "abhor", "horrify"]),
    "hospit": ("客人", "Latin", ["hospital", "hospitality", "hostel"]),
    "laps": ("滑、落", "Latin", ["collapse", "lapse", "elapse", "relapse"]),
    "lat": ("搬运、带", "Latin", ["translate", "relate", "legislate", "relative"]),
    "lev": ("举起、轻", "Latin", ["elevate", "relieve", "levy"]),
    "lingu": ("语言、舌", "Latin", ["language", "linguistic", "bilingual", "linguist"]),
    "long": ("长", "Latin", ["longitude", "prolong", "elongate"]),
    "lud": ("玩、戏", "Latin", ["elude", "illusion", "delude", "prelude"]),
    "mater": ("母亲", "Latin", ["maternal", "material", "matter", "matron"]),
    "ment": ("心智", "Latin", ["mental", "mention", "comment", "demented"]),
    "merc": ("贸易", "Latin", ["commerce", "merchant", "market"]),
    "mor": ("风俗", "Latin", ["moral", "morale", "morality"]),
    "mun": ("公共", "Latin", ["community", "immune", "municipal", "common"]),
    "neur": ("神经", "Greek", ["neural", "neurology", "neurotic"]),
    "noc": ("伤害", "Latin", ["innocent", "noxious", "obnoxious"]),
    "nom": ("法则、名", "Greek", ["economy", "autonomy", "astronomy"]),
    "nutri": ("营养", "Latin", ["nutrition", "nutrient", "nourish"]),
    "ocul": ("眼睛", "Latin", ["ocular", "binocular", "inoculate"]),
    "onym": ("名字", "Greek", ["synonym", "anonymous", "antonym", "pseudonym"]),
    "ped": ("脚", "Latin", ["pedestrian", "pedal", "expedite", "impede"]),
    "plac": ("取悦、平静", "Latin", ["please", "placid", "placate", "complacent"]),
    "pon": ("放置", "Latin", ["postpone", "component", "opponent", "compound"]),
    "quir": ("寻求", "Latin", ["require", "acquire", "inquire", "conquer"]),
    "rogat": ("询问", "Latin", ["interrogate", "prerogative", "derogatory"]),
    "sci": ("知道", "Latin", ["science", "conscious", "scientific", "conscience"]),
    "sect": ("切割", "Latin", ["section", "insect", "sector", "intersection"]),
    "sed": ("坐", "Latin", ["sediment", "sedentary", "preside", "obsess"]),
    "spec": ("看", "Latin", ["special", "species", "specific", "specimen"]),
    "spir": ("呼吸", "Latin", ["inspire", "expire", "conspire", "aspiration"]),
    "stru": ("建造", "Latin", ["structure", "construct", "instruct", "obstruct"]),
    "tang": ("接触", "Latin", ["tangible", "contact", "intact", "contaminate"]),
    "tempor": ("时间", "Latin", ["temporary", "contemporary", "temperate"]),
    "ten": ("握住", "Latin", ["maintain", "retain", "tenant", "tenure"]),
    "terr": ("土地", "Latin", ["territory", "terrain", "terrestrial", "mediterranean"]),
    "test": ("见证", "Latin", ["testify", "protest", "contest", "testimony"]),
    "the": ("神", "Greek", ["theology", "atheist", "theocracy"]),
    "tract": ("拉、拖", "Latin", ["attract", "contract", "extract", "abstract"]),
    "val": ("强、价值", "Latin", ["value", "valid", "evaluate", "equivalent"]),
    "ven": ("来", "Latin", ["prevent", "event", "invent", "convention"]),
    "vers": ("转动", "Latin", ["universe", "diverse", "adverse", "versatile"]),
    "voc": ("叫喊、声音", "Latin", ["vocal", "advocate", "vocabulary", "provoke"]),
}

# 常见后缀派生规则：候选变换依次尝试，产物必须存在于 ECDICT
DERIV_SUFFIXES = [
    ("ation", ["", "e"]), ("ion", ["", "e"]), ("ment", ["", "e"]),
    ("ness", []), ("ity", ["", "e"]), ("ance", ["", "e"]), ("ence", ["", "e"]),
    ("er", ["", "e"]), ("or", ["", "e"]), ("able", ["", "e"]), ("ible", ["", "e"]),
    ("ive", ["", "e"]), ("al", []), ("ful", []), ("less", []), ("ous", ["", "e"]),
]

# 记忆公式用的高频前后缀（只对查得到的成分给释义，不编造）
PREFIX_MEANING = {
    "ab": "离开", "ad": "朝向", "anti": "反对", "auto": "自己", "bi": "二",
    "co": "共同", "com": "共同", "con": "共同、加强", "contra": "相反", "counter": "反对",
    "de": "向下、去除", "dis": "分开、否定", "ex": "向外", "extra": "超出",
    "fore": "在前", "hyper": "过度", "il": "否定", "im": "进入、否定", "in": "进入、否定",
    "inter": "在…之间", "ir": "否定", "micro": "微小", "mis": "错误", "mono": "单一",
    "multi": "多", "non": "非", "over": "过度", "post": "在后", "pre": "在前",
    "pro": "向前", "re": "再、回", "semi": "半", "sub": "在下", "super": "在上、超过",
    "sur": "在上、超过", "trans": "跨越、转变", "un": "否定", "under": "在下、不足",
    "ab": "离开、从", "ad": "朝向、加强", "amb": "周围", "ana": "向上、再",
    "cata": "向下", "dia": "穿过", "epi": "在…之上", "eu": "好", "hetero": "异",
    "hom": "同", "meta": "超出、变化", "para": "并列、辅助", "peri": "周围",
    "proto": "原初", "syn": "共同", "sym": "共同", "tri": "三", "uni": "单一",
    "bi": "二", "geo": "地", "bio": "生命", "aero": "空气", "astro": "星",
    "cardio": "心", "neuro": "神经", "eco": "家、生态", "psycho": "心智",
}
SUFFIX_MEANING = {
    "able": "能…的", "ible": "能…的", "al": "…的", "ance": "性质、状态",
    "ence": "性质、状态", "ation": "动作、结果", "ion": "动作、结果",
    "ful": "充满…的", "ity": "性质、状态", "ive": "有…倾向的",
    "less": "无…的", "ment": "结果、状态", "ness": "性质、状态", "or": "做…的人",
    "ous": "充满…的", "er": "做…的人",
    # 构词力强的派生后缀（只收 ≥3 字母，避免 city -> cit + y 这类误判）
    "ate": "使…化", "ize": "使…化", "ise": "使…化", "ify": "使…化",
    "ical": "…的", "ial": "…的", "ual": "…的", "ic": "…的",
    "ism": "主义、学说", "ist": "从事…的人", "ary": "与…有关的",
    "ory": "与…有关的", "ant": "…的、者", "ent": "…的、者",
    "ure": "行为、结果", "age": "集合、行为", "ics": "…学",
    "logy": "…学", "graphy": "…学、记录", "ish": "带…性质", "est": "最…",
}


def load_ecdict():
    csv.field_size_limit(10 ** 7)
    out = {}
    with open(ECDICT_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            w = (row.get("word") or "").strip().lower()
            if not w:
                continue
            out[w] = {
                "frq": int(row.get("frq") or 0),
                "bnc": int(row.get("bnc") or 0),
                "translation": row.get("translation") or "",
                "definition": row.get("definition") or "",
                "exchange": row.get("exchange") or "",
                "pos": row.get("pos") or "",
            }
    return out


def load_wordroot():
    with open(WORDROOT_JSON, encoding="utf-8") as f:
        return json.load(f)


def load_etymology_raw() -> dict:
    """Wiktionary 词源原始数据（scripts/fetch_wiktionary_etymology.py 产出）。"""
    if not os.path.exists(ETYM_RAW_JSON):
        return {}
    with open(ETYM_RAW_JSON, encoding="utf-8") as f:
        return json.load(f)


def etym_entry(raw: dict, word: str):
    """取该词可用的词源条目；缺失/无关系时返回 None。"""
    e = (raw or {}).get(word)
    if not e or not isinstance(e, dict) or e.get("missing"):
        return None
    if not (e.get("roots") or e.get("origins")):
        return None
    return e


def etym_keys(entry: dict) -> list:
    """词源分组键：优先原始词根（ine-pro / gem-pro），其次首选语言的来源词。

    来源词里混有词缀（measure 的 `la -tūra` 是后缀不是词），必须剔除 ——
    否则会取到 `tra` 这种词干，召回出一堆无关词。
    """
    def usable(term: str) -> bool:
        t = (term or "").strip()
        if len(t) < 3 or t.startswith("-") or t.endswith("-"):
            return False
        return bool(re.match(r"^[A-Za-zĀ-ɏ*]", t))

    keys = []
    for r in entry.get("roots") or []:
        if usable(r.get("term", "")):
            keys.append(("root", r.get("lang", ""), r.get("term", "")))
    for o in entry.get("origins") or []:
        if o.get("lang") in ETYM_PREFER_LANGS and usable(o.get("term", "")):
            keys.append(("origin", o.get("lang", ""), o.get("term", "")))
    return keys


def etym_stem(term: str) -> str:
    """从来源词里剥掉常见拉丁/希腊词尾，得到可用于形态召回的词干。

    先做 Unicode 规范化去掉变音符号（mēnsūra -> mensura），
    否则直接用 [^a-z] 过滤会把长音符删掉，得到 mnsr 这种残废词干。
    """
    t = unicodedata.normalize("NFKD", (term or "").lower())
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = re.sub(r"[^a-z]", "", t)
    for suf in ("ationis", "tionis", "ionis", "atio", "tio", "are", "ere", "ire",
                "ium", "ius", "ia", "us", "um", "is", "os", "on", "ein", "izein", "a", "e", "o"):
        # 剩余部分必须 >= 4：portio 剥掉 tio 只剩 por，再拼变体会变成 port，
        # 于是 portion 又被召回进 port(carry) 词族 —— 这类误判必须在这里掐掉。
        if t.endswith(suf) and len(t) - len(suf) >= 4:
            return t[: len(t) - len(suf)]
    return t


def build_roots_table():
    """roots.json：wordroot.txt 打底 + 手工校订高频词根。"""
    table = {}
    for key, meta in load_wordroot().items():
        form = key.strip().strip("-").lower()
        if not form:
            continue
        ex = meta.get("example") or []
        if isinstance(ex, str):
            ex = [ex]
        table[form] = {
            "meaning": meta.get("meaning", ""),
            "origin": meta.get("origin", ""),
            "class": meta.get("class", "root"),
            "source": "ECDICT-wordroot",
            "examples": [str(x).strip().lower() for x in ex],
        }
    for form, (meaning, origin, examples) in CURATED_ROOTS.items():
        # wordroot 已有的不覆盖，避免手工表与源表冲突
        if form in table:
            table[form].setdefault("examples", [])
            for e in examples:
                if e not in table[form]["examples"]:
                    table[form]["examples"].append(e)
            continue
        table[form] = {
            "meaning": meaning,
            "origin": origin,
            "class": "root",
            "source": "manual",
            "examples": list(examples),
        }
    return dict(sorted(table.items()))


def build_example_index(roots: dict):
    """人工示例词 -> 词根（wordroot.txt / 手工表自带，精度最高的匹配来源）。"""
    idx = {}
    for root, meta in roots.items():
        if meta.get("class") != "root":
            continue
        for ex in meta.get("examples") or []:
            w = str(ex).strip().lower()
            if not w or w in idx:
                continue
            # 从示例词里剥离词根，得到前缀 / 后缀（用于记忆公式）
            prefix, suffix = "", ""
            if w.startswith(root):
                suffix = w[len(root):]
            elif w.endswith(root):
                prefix = w[: len(w) - len(root)]
            elif root in w:
                i = w.index(root)
                prefix, suffix = w[:i], w[i + len(root):]
            idx[w] = (root, prefix, suffix)
    return idx


def core_cn(translation: str, max_items: int = 2, max_len: int = 24) -> str:
    """取 translation 的核心中文：优先带词性的第一行，剥掉领域标注。"""
    for raw in (translation or "").split("\\n"):
        line = raw.replace("\n", " ").strip()
        if not line:
            continue
        line = re.sub(r"^\s*\[[^\]]+\]\s*", "", line)
        line = re.sub(r"^\s*[a-z]{1,5}\.?\s+", "", line)
        items = []
        for piece in re.split(r"[,，;；]", line):
            p = piece.strip(" 。.()（）")
            if p and p not in items:
                items.append(p)
        if items:
            return strip_emoji("、".join(items[:max_items])[:max_len])
    return ""


def primary_pos(translation: str) -> str:
    m = re.match(r"^\s*([a-z]{1,5})\.", translation or "")
    if not m:
        return ""
    tok = m.group(1)
    return {
        "n": "n.", "v": "v.", "vt": "v.", "vi": "v.", "adj": "adj.", "a": "adj.",
        "adv": "adv.", "ad": "adv.", "prep": "prep.", "conj": "conj.",
    }.get(tok, "")


EMOJI_RE = re.compile(
    "[" "\U0001F000-\U0001FAFF" "\U00002600-\U000027BF"
    "\U0001F1E6-\U0001F1FF" "️" "⃣"
    "®" "©" "™" "℠" "〃"
    "]+"
)


def strip_emoji(s: str) -> str:
    """剥掉 emoji / 变体选择符：数据包禁止出现 emoji（质量红线）。"""
    return EMOJI_RE.sub("", s or "").strip()


def _tail_ok(rest: str, ecdict: dict) -> bool:
    """词根之后的残余是否可接受。

    只放行：空 / 静默 e / 已知后缀 / 已知后缀前带 ≤2 个连接字母 / 长度 ≥4 的真实单词。
    不放行任意短残余 —— 否则 `city` 会被当成 `cit` 的同源词（误召回比缺召回更糟）。
    """
    if rest == "" or rest == "e":
        return True
    if rest in SUFFIX_MEANING:
        return True
    for suf in SUFFIX_MEANING:
        if rest.endswith(suf) and 0 < len(rest) - len(suf) <= 2:
            return True
    return len(rest) >= 4 and rest in ecdict


def match_root(word: str, roots: dict, ecdict: dict):
    """词素边界匹配：把 word 拆成 [前缀] + 词根 + [后缀|残余]，只对查得到的成分放行。

    按长度查表而不是遍历全部词根，避免 O(词根数 x 前缀数) 的开销。
    返回 (root, prefix, suffix) 或 None —— 宁可没有词根，也不给出误导性拆解。
    """
    lens = range(min(10, len(word)), 2, -1)
    # 无前缀：词根位于开头
    for L in lens:
        root = word[:L]
        meta = roots.get(root)
        if meta and meta.get("class") == "root" and _tail_ok(word[L:], ecdict):
            return (root, "", word[L:])
    # 前缀 + 词根 [+ 后缀]
    for pref in sorted(PREFIX_MEANING, key=len, reverse=True):
        if not word.startswith(pref):
            continue
        stem = word[len(pref):]
        for L in range(min(10, len(stem)), 2, -1):
            root = stem[:L]
            meta = roots.get(root)
            if meta and meta.get("class") == "root" and _tail_ok(stem[L:], ecdict):
                return (root, pref, stem[L:])
    # 词根 + 前缀（无后缀）：前缀必须是已知前缀，避免 deficit -> cit 这类误判
    for L in lens:
        root = word[-L:]
        meta = roots.get(root)
        if not meta or meta.get("class") != "root":
            continue
        pre = word[: len(word) - L]
        if pre in PREFIX_MEANING:
            return (root, pre, "")
    return None


def build_root_index(ecdict: dict, roots: dict):
    """一次性建词根倒排索引：root -> [(frq, word, prefix, suffix), ...]。

    只扫一遍 ECDICT（77 万条），之后按词根直接取用，避免逐词全表扫描。
    """
    index = {}
    for w, row in ecdict.items():
        if not WORD_RE.match(w) or not row["translation"]:
            continue
        frq = row["frq"]
        if frq < MIN_FREQ or frq > MAX_FREQ:
            continue
        hit = match_root(w, roots, ecdict)
        if not hit:
            continue
        index.setdefault(hit[0], []).append((frq, w, hit[1], hit[2], row))
    for lst in index.values():
        lst.sort(key=lambda t: (t[0], t[1]))
    return index


def formula_for(word: str, root: str, prefix: str, suffix: str, roots: dict) -> str:
    """记忆公式：每个成分都能在词根表 / 词缀表里查到才拼接。"""
    parts = []
    if prefix and prefix in PREFIX_MEANING:
        parts.append("%s( %s )" % (prefix, PREFIX_MEANING[prefix]))
    parts.append("%s( %s )" % (root, roots.get(root, {}).get("meaning", "")))
    if suffix and suffix in SUFFIX_MEANING:
        parts.append("%s( %s )" % (suffix, SUFFIX_MEANING[suffix]))
    body = "+".join(parts)
    meaning = roots.get(root, {}).get("meaning", "")
    return "%s = %s「%s」相关" % (body, meaning, word) if meaning else ""


def recall_family(root: str, index: dict, roots: dict, exclude: set, limit: int = MAX_FAMILY):
    """以词根为键取同源词（来自倒排索引）：按常用度排序，过滤专名与生僻词。"""
    out = []
    for frq, w, pref, suf, row in index.get(root, [])[: limit * 3]:
        if w in exclude:
            continue
        cn = core_cn(row["translation"])
        if not cn:
            continue
        out.append({
            "lemma": w,
            "pos": primary_pos(row["translation"]),
            "cn": cn,
            "formula": formula_for(w, root, pref, suf, roots),
            "source": "ECDICT",
        })
        if len(out) >= limit:
            break
    return out


def recall_by_stem(stem: str, sorted_words: list, ecdict: dict, exclude: set, limit: int = MAX_FAMILY):
    """用词源词干直接在 ECDICT 上召回同源词（不要求词干已在词根表里）。

    词表排序后用二分定位前缀区间，避免 77 万条全表扫描；候选仍需过词素边界校验
    （_tail_ok），并且与词根表召回共用同一套严谨口径。
    """
    # 词干过短会把大量无关词拉进来（mens -> menstrual / menswear），门槛设在 5；
    # 更短的词干交给词根表召回（recall_family）处理，那条路径有词根表把关。
    if len(stem) < 5:
        return []
    cands = []

    def scan(key: str, prefix: str):
        lo = bisect.bisect_left(sorted_words, key)
        hi = bisect.bisect_left(sorted_words, key + "\uffff")
        for w in sorted_words[lo:hi]:
            if w in exclude:
                continue
            rest = w[len(key):]
            if not _tail_ok(rest, ecdict):
                continue
            cands.append((ecdict[w]["frq"] or 10 ** 6, w, prefix, rest, ecdict[w]))

    scan(stem, "")
    for pref in PREFIX_MEANING:
        scan(pref + stem, pref)

    cands.sort(key=lambda t: (t[0], t[1]))
    out = []
    for frq, w, pref, rest, row in cands:
        if row["frq"] > MAX_FREQ or row["frq"] < MIN_FREQ:
            continue
        cn = core_cn(row["translation"])
        if not cn:
            continue
        out.append({
            "lemma": w,
            "pos": primary_pos(row["translation"]),
            "cn": cn,
            "formula": "",
            "source": "Wiktionary-etymology",
        })
        if len(out) >= limit:
            break
    return out


def build_derivatives(word: str, row: dict, ecdict: dict):
    """派生词：ECDICT exchange 的屈折形式 + 后缀派生（产物必须存在）。"""
    out = []
    seen = {word}

    def add(lemma, kind):
        if not lemma or lemma in seen or not WORD_RE.match(lemma):
            return
        r = ecdict.get(lemma)
        if not r or not r["translation"]:
            return
        cn = core_cn(r["translation"])
        if not cn:
            return
        seen.add(lemma)
        out.append({"lemma": lemma, "pos": primary_pos(r["translation"]), "cn": cn, "kind": kind})

    for item in (row.get("exchange") or "").split("/"):
        if ":" not in item:
            continue
        tag, val = item.split(":", 1)
        if tag in ("p", "d", "i", "3", "r", "t", "s") and val.strip():
            add(val.strip().lower(), "INFLECTION")

    for suffix, drops in DERIV_SUFFIXES:
        for drop in drops:
            stem = word[: len(word) - len(drop)] if drop and word.endswith(drop) else word
            add(stem + suffix, "DERIVATION")
    return out


def sha256_bytes(buf: bytes) -> str:
    return hashlib.sha256(buf).hexdigest()


def main() -> int:
    dry = "--dry" in sys.argv
    print("[1/6] 载入 ECDICT ...")
    ecdict = load_ecdict()
    print("      词条数：%d" % len(ecdict))

    print("[2/6] 构建词根表 ...")
    roots = build_roots_table()
    with open(ROOTS_JSON, "w", encoding="utf-8") as f:
        json.dump(roots, f, ensure_ascii=False, indent=1)
    manual = sum(1 for v in roots.values() if v.get("source") == "manual")
    print("      词根条目：%d（含手工校订 %d）" % (len(roots), manual))

    sorted_words = sorted(ecdict.keys())
    print("[3/6] 建词根倒排索引（扫一遍 ECDICT）+ 人工示例索引 ...")
    index = build_root_index(ecdict, roots)
    example_idx = build_example_index(roots)
    # 词根自带的人工示例词是精度最高的同源词来源，并入召回（去重、按常用度排序）
    added = 0
    for root, meta in roots.items():
        if meta.get("class") != "root":
            continue
        bucket = index.setdefault(root, [])
        seen = {t[1] for t in bucket}
        for ex in meta.get("examples") or []:
            w = str(ex).strip().lower()
            if not w or w in seen or not WORD_RE.match(w):
                continue
            row = ecdict.get(w)
            if not row or not row["translation"]:
                continue
            frq = row["frq"]
            if frq < MIN_FREQ or frq > 60000:
                continue
            prefix, suffix = "", ""
            if w.startswith(root):
                suffix = w[len(root):]
            elif w.endswith(root):
                prefix = w[: len(w) - len(root)]
            elif root in w:
                i = w.index(root)
                prefix, suffix = w[:i], w[i + len(root):]
            bucket.append((frq, w, prefix, suffix, row))
            seen.add(w)
            added += 1
    for lst in index.values():
        lst.sort(key=lambda t: (t[0], t[1]))
    print("      有同源词群的词根：%d（并入人工示例 %d 条）；人工示例词：%d"
          % (len(index), added, len(example_idx)))

    pack_lemmas = set()
    chunks = []
    for path in sorted(glob.glob(os.path.join(PACK_DIR, "chunk-*.json"))):
        with open(path, encoding="utf-8") as f:
            chunks.append((path, json.load(f)))
        for w in chunks[-1][1]["words"]:
            pack_lemmas.add(w["lemma"].lower())

    # ---- 词源数据库（Wiktionary）作为首选判定源 ----
    etym_raw = load_etymology_raw()
    etym_by_word = {}
    etym_index = {}
    for w in sorted(pack_lemmas):
        e = etym_entry(etym_raw, w)
        if not e:
            continue
        keys = etym_keys(e)
        if not keys:
            continue
        etym_by_word[w] = (e, keys)
        for k in keys:
            etym_index.setdefault(k, []).append(w)
    etym_available = len(etym_by_word)
    print("      词源数据可用：%d/%d = %.1f%%" % (etym_available, len(pack_lemmas),
                                            100.0 * etym_available / max(1, len(pack_lemmas))))

    root_hits = 0
    family_hits = 0
    deriv_hits = 0
    for _, chunk in chunks:
        for word in chunk["words"]:
            lemma = word["lemma"].lower()
            row = ecdict.get(lemma, {})

            # 1) 词源优先：同词源键 = 词源级别的同源（最可靠）
            if lemma in etym_by_word:
                e, keys = etym_by_word[lemma]
                origin_keys = [k for k in keys if k[0] == "origin"]
                root_keys = [k for k in keys if k[0] == "root"]
                # 词干与标签优先取拉丁/希腊来源词（la cito -> cit），PIE 词根只作兜底：
                # 直接用 *keyh₂- 之类原始词根做形态召回会召回不到任何英文词。
                # 按语言优先级选标签来源：拉丁/希腊优先，其次古法语、中古英语等
                label_src = None
                for lang in ETYM_LABEL_LANGS:
                    for k in origin_keys:
                        if k[1] == lang:
                            label_src = k
                            break
                    if label_src:
                        break
                if label_src is None and origin_keys:
                    label_src = origin_keys[0]
                if label_src is None and root_keys:
                    label_src = root_keys[0]
                # 多个来源词各出一个词干候选（la cito -> cit，fro citer -> citer），逐个尝试召回
                def norm_term(t: str) -> str:
                    s = unicodedata.normalize("NFKD", (t or "").lower())
                    s = "".join(ch for ch in s if not unicodedata.combining(ch))
                    return re.sub(r"[^a-z]", "", s)

                stem_candidates = []
                for k in origin_keys:
                    base = norm_term(k[2])
                    for s in (etym_stem(k[2]), etym_stem(k[2]) + "at", etym_stem(k[2]) + "t"):
                        if len(s) >= 3 and s not in stem_candidates:
                            stem_candidates.append(s)
                    # 逐字截断（cito -> cit）：配合「命中 >=2 即停」的排序，
                    # portion 会停在 porti，不会掉到 port 上。
                    # 但截断结果若恰好是已知前缀（con / com / ex ...）必须跳过 ——
                    # 那会把 conduct 的词根标成 con，并把一批无关词拉进词族。
                    for L in range(len(base), 2, -1):
                        s = base[:L]
                        if len(s) >= 3 and s not in stem_candidates and s not in PREFIX_MEANING:
                            stem_candidates.append(s)
                # 同源判定：来源词级别的键（精确）+ 规模受限的原始词根，
                # 但 PIE 词根组的成员必须同时包含词干 —— 否则会把 tuck 塞进 conduct 的词族
                # （词源上同根，但对学习者毫无帮助，等于噪音）。
                same = set()
                for k in origin_keys:
                    same |= set(etym_index.get(k, []))
                for k in root_keys:
                    grp = etym_index.get(k, [])
                    if 0 < len(grp) <= ETYM_ROOT_GROUP_MAX:
                        for w in grp:
                            if any(s in w for s in stem_candidates):
                                same.add(w)
                same.discard(lemma)

                # 1) 同词源键的词（词源级别判定，最可靠）
                members = []
                for m in sorted(same):
                    cn = core_cn(ecdict.get(m, {}).get("translation", ""))
                    if not cn:
                        continue
                    members.append({
                        "lemma": m,
                        "pos": primary_pos(ecdict.get(m, {}).get("translation", "")),
                        "cn": cn,
                        "formula": "",
                        "source": "Wiktionary-etymology",
                    })

                # 展示用主词干：优先取能落到词根表的最短词干（cite -> 取 cit 而不是 citer）
                known = [s for s in stem_candidates if s in index]
                stem = min(known, key=len) if known else (min(stem_candidates, key=len) if stem_candidates else "")
                if label_src and not stem:
                    stem = etym_stem(label_src[2])
                if len(members) < MAX_FAMILY:
                    # 词干从长到短依次尝试，命中 >=2 个成员即停：
                    # portion 会停在 porti（不再落到 port），cite 则退到 cit 召回整组词族。
                    ordered = sorted(stem_candidates, key=len, reverse=True)
                    best = []
                    for variant in ordered:
                        # a) 词根表召回（词根表已收录该词干时）
                        pool = recall_family(variant, index, roots,
                                             exclude={lemma} | {m["lemma"] for m in members})
                        # b) 词干直接在 ECDICT 上召回（不依赖词根表）
                        pool += recall_by_stem(variant, sorted_words, ecdict,
                                               exclude={lemma} | {m["lemma"] for m in members}
                                               | {c["lemma"] for c in pool})
                        picked = []
                        for cand in pool:
                            ck = etym_by_word.get(cand["lemma"])
                            if ck and not (set(ck[1]) & set(keys)):
                                continue  # 候选词源明确且不同源 -> 剔除（修掉 portion 这类误判）
                            cand["source"] = "Wiktionary-etymology"
                            picked.append(cand)
                        if len(picked) > len(best):
                            best = picked
                        if len(picked) >= 2:
                            break
                    members.extend(best[:MAX_FAMILY])
                label_lang, label_term = (label_src[1], label_src[2]) if label_src else ("", "")
                word["wordFamily"] = {
                    "root": stem or label_term,
                    "rootMeaning": "%s %s" % (LANG_NAMES.get(label_lang, label_lang), label_term),
                    "origin": strip_emoji(e.get("text") or "")[:160],
                    "formula": "",
                    "members": members,
                    "source": "Wiktionary-etymology",
                }
                root_hits += 1
                if members:
                    family_hits += 1
                if not word.get("etymology"):
                    word["etymology"] = {
                        "formula": "%s（%s %s）" % (stem or label_term, label_lang, label_term),
                        "origin": strip_emoji(e.get("text") or "")[:200] or "词源来自 Wiktionary。",
                        "derivatives": [],
                    }
                derivs = build_derivatives(lemma, row, ecdict)
                if derivs:
                    deriv_hits += 1
                word["derivatives"] = derivs
                if word.get("etymology") and isinstance(word["etymology"].get("derivatives"), list):
                    word["etymology"]["derivatives"] = derivs[:4]
                continue

            # 3) 无词源数据：退回形态匹配（wordroot + 手工词根表）
            hit = None
            if lemma in example_idx:
                hit = example_idx[lemma]
            elif len(lemma) >= 4:
                hit = match_root(lemma, roots, ecdict)
            if hit:
                root_hits += 1
                root, prefix, suffix = hit
                meta = roots.get(root, {})
                family = recall_family(root, index, roots, exclude={lemma})
                if family:
                    family_hits += 1
                word["wordFamily"] = {
                    "root": root,
                    "rootMeaning": meta.get("meaning", ""),
                    "origin": meta.get("origin", ""),
                    "formula": formula_for(lemma, root, prefix, suffix, roots),
                    "members": family,
                    "source": "ECDICT-wordroot/manual",
                }
                # 词根命中时同步补齐 etymology（保留既有的人工词根）
                if not word.get("etymology"):
                    word["etymology"] = {
                        "formula": "%s（%s）" % (root, meta.get("meaning", "")),
                        "origin": "词根 %s 源自 %s，含义为「%s」。" % (root, meta.get("origin") or "—", meta.get("meaning", "")),
                        "derivatives": [],
                    }
            else:
                # 未命中必须清除上一轮可能写入的词群，避免旧数据残留（宁缺毋滥）
                word.pop("wordFamily", None)
            derivs = build_derivatives(lemma, row, ecdict)
            if derivs:
                deriv_hits += 1
            word["derivatives"] = derivs
            if word.get("etymology") and isinstance(word["etymology"].get("derivatives"), list):
                word["etymology"]["derivatives"] = derivs[:4]

    total = sum(len(c["words"]) for _, c in chunks)
    print("      词根命中：%d/%d = %.1f%%" % (root_hits, total, 100.0 * root_hits / total))
    print("      同源词群非空：%d/%d = %.1f%%" % (family_hits, total, 100.0 * family_hits / total))
    print("      派生词非空：%d/%d = %.1f%%" % (deriv_hits, total, 100.0 * deriv_hits / total))

    print("[4/6] 写回分块并重算 sha256 ...")
    manifest_path = os.path.join(PACK_DIR, "manifest.json")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    for path, chunk in chunks:
        if not dry:
            # 必须与 manifest 同步升版本：packVerifier.assertChunkShape 会校验
            # chunk.version === manifest.version，不一致时加载期直接抛 PackFormatError。
            chunk["version"] = NEXT_VERSION
            buf = json.dumps(chunk, ensure_ascii=False).encode("utf-8")
            with open(path, "wb") as f:
                f.write(buf)
            entry = next((c for c in manifest["chunks"] if c["file"] == os.path.basename(path)), None)
            if entry:
                entry["sha256"] = sha256_bytes(buf)
                entry["bytes"] = len(buf)

    if not dry:
        manifest["version"] = NEXT_VERSION
        manifest["generatedAt"] = __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z")
        manifest["wordFamilyNote"] = (
            "同源词群优先依据词源关系判定：来源为 Wiktionary（CC BY-SA 3.0，"
            "https://en.wiktionary.org），按「来源语言+来源词/原始词根」分组；"
            "无词源数据时退回词根表（ECDICT wordroot + 手工校订）的词素边界匹配，"
            "并从 ECDICT 召回，按常用度排序取前 %d 个。"
            "记忆公式只使用词根表与词缀表中可查到的成分，不做联想编造。" % MAX_FAMILY
        )
        manifest.setdefault("sources", [])
        manifest["sources"].append({
            "name": "Wiktionary",
            "license": "CC BY-SA 3.0",
            "url": "https://en.wiktionary.org",
            "usedFor": "词源关系（同源词群判定）",
        })
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)

    print("[5/6] 完成%s" % ("（dry run，未写入）" if dry else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
