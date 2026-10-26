# -*- coding: utf-8 -*-
"""一次性：把逐条起草的记忆链写入 affix-lexicon.json 的 curated。

输入：
  scripts/.cache/auto-morphology.json   AUTO 拆分（含 PREFIX/ROOT/SUFFIX 类型）
  OVERRIDES                             本文件里的 literal / atoms
输出：
  src/content/affix-lexicon.json        新增 curated 条目，authoredBy = AI_DRAFTED

安全闸：写入前逐条校验「成分首尾相接覆盖整词」（允许词尾不发音 e），
覆盖不了的直接报错，避免把切分错的词塞进词表。
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEXICON = ROOT / "src/content/affix-lexicon.json"
AUTO = ROOT / "scripts/.cache/auto-morphology.json"

# lemma: (literal, atoms)   atoms 只写需要覆盖默认短义的那个成分
OVERRIDES: dict[str, tuple[str, dict[str, str]]] = {
    "assess": ("坐在旁边判定", {"as": "在旁", "sess": "坐"}),
    "mechanism": ("机械的构造", {"ism": "构造"}),
    "radical": ("与根有关的", {"ical": "的"}),
    "integrate": ("使成为整体", {"integr": "整体"}),
    "authority": ("创始者的身份", {"ity": "身份"}),
    "design": ("标出来", {"de": "下来"}),
    "determine": ("把界限定下来", {"de": "下"}),
    "establish": ("使站稳", {"e": "使", "ish": "使"}),
    "factor": ("做事的那一方", {"or": "者"}),
    "indicate": ("指出来给人看", {"in": "朝向"}),
    "region": ("统治的范围", {"ion": "范围"}),
    "remove": ("挪开", {"re": "离开"}),
    "respond": ("回应回去", {}),
    "positive": ("已经放定的", {"posit": "放置", "ive": "的"}),
    "professional": ("公开宣称自己行当的", {"pro": "公开", "al": "的"}),
    "specific": ("使看得清的", {"ific": "使"}),
    "appreciate": ("给东西定价，所以看重", {"ap": "朝", "preci": "价值"}),
    "appropriate": ("使之成为自己的", {"ap": "朝"}),
    "conclude": ("一起关上", {"con": "一起"}),
    "locate": ("使有地方", {}),
    "obtain": ("伸手握住", {}),
    "predict": ("预先说出", {}),
    "promote": ("往前推", {"mot": "推"}),
    "proposal": ("往前放出来的方案", {"al": "的"}),
    "survive": ("活得比…长", {}),
    "acquire": ("去寻求", {}),
    "adjust": ("调到正好", {"just": "正好"}),
    "alternative": ("另有一个可选", {"altern": "另一个", "ative": "的"}),
    "capable": ("能拿得下的", {}),
    "capacity": ("能装下的量", {"cap": "装"}),
    "commission": ("交出去办的事", {"com": "交出", "ion": "结果"}),
    "concentrate": ("一起聚到中心", {}),
    "confirm": ("一起确认牢固", {"con": "一起"}),
    "constant": ("一直站着", {"con": "一直"}),
    "contemporary": ("同一时间的", {"ary": "的"}),
    "convince": ("彻底征服对方", {"con": "彻底"}),
    "dominate": ("使处于统治", {}),
    "estimate": ("给出估价", {}),
    "evaluate": ("把价值算出来", {"e": "出"}),
    "expose": ("放到外面", {}),
    "fundamental": ("与基础有关的", {"ament": "根基", "al": "的"}),
    "illustrate": ("使照亮，也就说明白了", {"il": "使"}),
    "impose": ("放到别人身上", {"im": "往上"}),
    "investigate": ("顺着脚印追进去", {}),
    "perceive": ("彻底拿住", {}),
    "prospect": ("往前看", {}),
    "resolve": ("把结解开", {"re": "打开"}),
    "sector": ("切出来的一块", {"or": "块"}),
    "transfer": ("搬到另一边", {"trans": "另一边", "fer": "搬"}),
    "transform": ("换个形状", {"trans": "换"}),
    "visible": ("能看见的", {}),
    "visual": ("与看有关的", {"ual": "的"}),
    "assign": ("标给某人", {"as": "朝"}),
    "communicate": ("让大家共同知道", {"com": "大家", "ic": "通", "ate": "使"}),
    "confront": ("面对面", {"con": "面对"}),
    "constitute": ("一起立起来", {"con": "一起"}),
    "construct": ("一起建造", {"con": "一起"}),
    "convention": ("大家走到一起定下的", {"ion": "约定"}),
    "convert": ("整个转过来", {"con": "整个"}),
    "distribute": ("分开给出去", {"ute": "出去"}),
    "finance": ("把账结清", {"ance": "结清"}),
    "incorporate": ("使成为一个团体", {"corpor": "团体"}),
    "justify": ("使显得正当", {}),
    "objective": ("摆在面前的对象", {"ob": "摆在面前"}),
    "proceed": ("往前走", {"ceed": "走"}),
    "proportion": ("按份额分", {"pro": "按", "port": "份额", "ion": "分"}),
    "relevant": ("能举起来对上的", {"ant": "的"}),
    "retain": ("握住不放", {"re": "一直"}),
    "revolution": ("转回来的一次", {"ion": "一次"}),
    "sequence": ("一个接一个", {"ence": "一串"}),
    "submit": ("从下面交上去", {"sub": "向上"}),
    "sufficient": ("在下补足了", {"suf": "补足", "ient": "的"}),
    "temporary": ("与时间有关的", {"ary": "的"}),
    "uniform": ("只有一种形状", {}),
    "abstract": ("从里面拉出来", {"abs": "从…里"}),
    "accommodate": ("调到合适的尺度", {"ac": "调到"}),
    "adequate": ("使相等", {}),
    "attribute": ("归给某人", {"at": "归", "ute": "给"}),
    "compound": ("放在一起", {}),
    "comprise": ("一起抓住", {}),
    "conceive": ("把想法拿住", {"con": "把"}),
    "confuse": ("混在一起", {"con": "混"}),
    "cooperate": ("一起干活", {}),
    "equivalent": ("价值相等的", {}),
    "exceed": ("走出去了", {"ceed": "走"}),
    "exclude": ("关在外面", {}),
    "exhibit": ("拿出来举着", {"hibit": "举"}),
    "export": ("运出去", {"port": "运"}),
    "ideology": ("观念之学", {}),
    "import": ("运进来", {"port": "运"}),
    "integrity": ("完整的性质", {"ity": "性质"}),
    "interact": ("之间互相做", {}),
    "lecture": ("读出来的东西", {"ure": "结果"}),
    "modify": ("改尺度", {}),
    "persist": ("一直站着", {"per": "一直"}),
    "precise": ("预先切好的", {}),
    "preliminary": ("门槛前的", {"ary": "的"}),
    "prohibit": ("挡在前面", {"pro": "挡在", "hibit": "前面"}),
    "regulate": ("使合规矩", {"regul": "规矩"}),
    "reinforce": ("再往里加力", {"re": "再"}),
    "restrict": ("拉紧", {}),
    "reverse": ("转回去", {}),
    "accumulate": ("堆到一起", {}),
    "attain": ("伸手够到", {"at": "伸手"}),
    "commodity": ("共同尺度下的东西", {"ity": "东西"}),
    "compensate": ("一起称量着补", {"pens": "称量"}),
    "confine": ("围在一个界限里", {"con": "围在"}),
    "coordinate": ("使顺序一致", {}),
    "correspond": ("来回呼应", {"cor": "相互"}),
    "duration": ("持续的时间", {"ation": "时间"}),
    "extract": ("拉出来", {}),
    "induce": ("引进来", {}),
    "integral": ("与完整有关的", {"al": "的"}),
    "intervene": ("插到中间来", {}),
    # ---- 第二批：权重 44–62 的词 ----
    "partial": ("只涉及一部分的", {"ial": "的"}),
    "prescribe": ("预先写下来", {}),
    "revise": ("再看一遍", {}),
    "substitute": ("站在下面顶替", {"sub": "顶替", "stitut": "站"}),
    "transport": ("运到另一边", {"trans": "到另一边", "port": "运"}),
    "coherent": ("粘在一起，所以连贯", {"co": "一起", "her": "粘", "ent": "的"}),
    "compatible": ("能一起忍受的", {"pat": "忍受", "ible": "的"}),
    "complement": ("把空补满的东西", {"ple": "填满", "ment": "东西"}),
    "compute": ("一起算清楚", {"put": "思考"}),
    "confer": ("一起带来商量", {"con": "一起", "fer": "带来"}),
    "conform": ("同一个形状", {"con": "同一"}),
    "constrain": ("一起拉紧", {"con": "一起"}),
    "convene": ("一起过来", {"con": "一起"}),
    "definite": ("界限划定的", {"ite": "的"}),
    "distort": ("扭歪了", {"dis": "扭开", "tort": "扭"}),
    "institute": ("立起来的东西", {"in": "立起"}),
    "mediate": ("在中间调停", {"medi": "中间", "ate": "使"}),
    "migrate": ("迁走", {"ate": "使"}),
    "simulate": ("做得像", {"simul": "相似", "ate": "使"}),
    "terminate": ("到界限为止", {"ate": "使"}),
    "finite": ("有界限的", {"ite": "的"}),
    "subordinate": ("排在下面的", {"sub": "在下", "ordin": "顺序", "ate": "的"}),
    "synthesis": ("放到一起", {"syn": "一起", "thesis": "放置"}),
    "approximate": ("靠得很近的", {"ap": "朝", "proxim": "接近", "ate": "的"}),
    "consequent": ("跟着来的", {"con": "一起", "ent": "的"}),
    "deduce": ("往下引出来", {"de": "往下"}),
    "depress": ("往下压", {"de": "往下"}),
    "predominant": ("先占上风的", {"pre": "先", "ant": "的"}),
    "native": ("生来就在此地的", {"ive": "的"}),
    "depression": ("往下压的状态", {"de": "往下", "ion": "状态"}),
    "exposure": ("放到外面", {"ex": "向外", "pos": "放", "ure": "结果"}),
    "immigrant": ("迁进来的人", {"im": "向内", "ant": "的人"}),
    "numerous": ("数目多的", {"numer": "数目", "ous": "的"}),
    "passion": ("心里翻涌的", {"pass": "涌", "ion": "状态"}),
    "psychological": ("与心智之学有关的", {"ical": "的"}),
    "volunteer": ("凭意愿做事的人", {"eer": "的人"}),
    "assumption": ("拿过来当真", {"as": "朝", "sumpt": "拿", "ion": "结果"}),
    "controversial": ("被反过来议论的", {"contro": "相反", "vers": "转", "ial": "的"}),
    "conviction": ("被彻底说服", {"con": "彻底", "vict": "征服", "ion": "结果"}),
    "corporation": ("结成团体的组织", {"corpor": "团体", "ation": "组织"}),
    "demonstration": ("摆出来给人看", {"de": "出来", "monstr": "展示", "ation": "行为"}),
    "dominant": ("占统治的", {"ant": "的"}),
    "gesture": ("身体带出来的动作", {"gest": "带", "ure": "动作"}),
    "provision": ("预先看到并备下", {"pro": "预先", "vis": "看", "ion": "结果"}),
    "acquisition": ("去求得的东西", {"ac": "朝", "quis": "寻求", "ition": "结果"}),
    "compensation": ("称量着补回来", {"pens": "称量", "ation": "行为"}),
    "compose": ("放在一起", {"com": "一起"}),
    "concede": ("让出去", {"con": "一起", "ced": "让"}),
    "constitution": ("立起来的东西", {"con": "一起", "stitut": "建立", "ion": "结果"}),
    "counterpart": ("对面那份", {"counter": "对面", "part": "一份"}),
    "equity": ("相等的对待", {"equ": "相等", "ity": "性质"}),
    "sacrifice": ("使成为神圣的", {"sacr": "神圣", "ific": "使"}),
    "congress": ("走到一起", {"con": "一起", "gress": "走"}),
    "nature": ("生来如此", {"ure": "状态"}),
    "performance": ("彻底做出来的样子", {"per": "彻底", "form": "做", "ance": "状态"}),
    "population": ("一地的人", {"popul": "人民", "ation": "全体"}),
    "subject": ("投在下面受人管", {"sub": "下面", "ject": "投"}),
    "animal": ("有生命的", {"anim": "生命", "al": "的"}),
    "central": ("在中心的", {"al": "的"}),
    "compare": ("放在一起看齐", {"com": "一起", "par": "相等"}),
    "concern": ("筛过之后挂在心上", {"cern": "分辨"}),
    "general": ("整类都算的", {"al": "的"}),
    "management": ("用手做出来的事", {"man": "手", "age": "行为", "ment": "结果"}),
    "prepare": ("预先备好", {"par": "备"}),
    "pressure": ("压下来的力", {"ure": "状态"}),
    "production": ("往前引出来的东西", {"pro": "向前", "duct": "引导", "ion": "结果"}),
    "professor": ("公开宣称学问的人", {"pro": "公开", "or": "人"}),
    "quality": ("性质本身", {"qual": "性质", "ity": "性质"}),
    "science": ("知道的东西", {"sci": "知道", "ence": "状态"}),
    "station": ("站定的地方", {"stat": "站", "ion": "地方"}),
    "television": ("远处看", {"tele": "远", "vis": "看", "ion": "结果"}),
    "various": ("各种不同", {"var": "不同", "ious": "的"}),
    "attempt": ("试着伸手", {"at": "朝", "tempt": "试"}),
    "attend": ("把注意力伸过去", {"at": "朝", "tend": "伸"}),
    "audience": ("听的人", {"audi": "听", "ence": "人"}),
    "capital": ("头一样的地方", {"capit": "头", "al": "的"}),
    "collection": ("收起来的一批", {"col": "一起", "lect": "收", "ion": "结果"}),
    "conference": ("带来一起说的场合", {"con": "一起", "fer": "带来", "ence": "场合"}),
    "department": ("分出去的一块", {"de": "分开", "part": "部分", "ment": "结果"}),
    "effective": ("做出来的", {"ef": "向外", "fect": "做", "ive": "的"}),
    "institution": ("立起来的机构", {"in": "立起", "ion": "结果"}),
    "investigation": ("顺着痕迹追", {"in": "向内", "vestig": "追踪", "ation": "行为"}),
    "normal": ("合标准的", {"norm": "标准", "al": "的"}),
    "object": ("投在眼前的东西", {"ob": "朝向", "ject": "投"}),
    "observe": ("留神守着", {"ob": "朝向", "serv": "保存"}),
    "reform": ("重新塑形", {"re": "重新", "form": "形状"}),
    "solution": ("解开的结果", {"solu": "解开", "tion": "结果"}),
    "application": ("往上贴用", {"ap": "朝", "plic": "折叠", "ation": "行为"}),
    "associate": ("走到同伴那里", {"as": "朝", "soci": "同伴", "ate": "使"}),
    "prominent": ("往前突出来", {"pro": "向前", "min": "突出", "ent": "的"}),
    "intellectual": ("在中间挑出好坏的眼力", {"intel": "之间", "lect": "选", "ual": "的"}),
    "immune": ("免于公共义务", {"im": "免除", "mun": "公共"}),
    # ---- 第三批：权重 39–41 的高频词 ----
    "comfortable": ("身心都强壮的", {"fort": "强", "able": "的"}),
    "commitment": ("交出去承担的事", {"mit": "送", "ment": "事"}),
    "competition": ("一起追同一个目标", {"pet": "追求", "ition": "行为"}),
    "conclusion": ("一起关上", {"clus": "关闭", "ion": "结果"}),
    "consequence": ("跟着来的结果", {"sequ": "跟随", "ence": "结果"}),
    "content": ("一起握住的东西", {"tent": "握住"}),
    "educational": ("把人引出来的", {"e": "引出", "duc": "引导", "ation": "过程", "al": "的"}),
    "emergency": ("突然冒出来要处理的事", {"em": "冒出", "erg": "能量", "ency": "状态"}),
    "expensive": ("要花出去很多钱的", {"ex": "花出去", "pens": "称量", "ive": "的"}),
    "extend": ("往外伸", {}),
    "extent": ("伸出去的范围", {"ex": "向外", "tent": "范围"}),
    "identity": ("同一个的性质", {"ident": "同一个", "ity": "性质"}),
    "impossible": ("做不到的", {"im": "不", "poss": "能做", "ible": "的"}),
    "influence": ("流进来影响你", {"in": "流入", "flu": "流", "ence": "状态"}),
    "instruction": ("在脑子里建起来的东西", {"in": "向内", "struct": "建造", "ion": "结果"}),
    "intelligence": ("在中间把线索绑起来的能力", {"intel": "之间", "lig": "绑", "ence": "能力"}),
    "location": ("地方", {"loc": "地方", "ation": "位置"}),
    "negative": ("带否定倾向的", {"neg": "否定", "ative": "的"}),
    "photograph": ("用光记录下来", {}),
    "propose": ("往前放出来", {}),
    "regional": ("一个统治范围里的", {"reg": "统治", "ion": "范围", "al": "的"}),
    "regulation": ("定规矩", {"regul": "规矩", "ation": "行为"}),
    "religion": ("把人绑回来的东西", {"re": "回", "lig": "绑", "ion": "结果"}),
    "scientific": ("使有知识的", {"sci": "知道", "ent": "的", "ific": "使"}),
    "session": ("坐下来的一段时间", {"sess": "坐", "ion": "一段"}),
    "surprise": ("突然从上面抓住", {"sur": "突然", "pris": "抓住"}),
    "assistance": ("站到旁边帮手", {"as": "旁边", "sist": "站", "ance": "行为"}),
    "association": ("结成同伴的组织", {"as": "朝", "soci": "同伴", "ation": "组织"}),
    "competitive": ("一起追同一目标的", {"pet": "追求", "itive": "的"}),
    "confidence": ("完全相信", {"con": "完全", "fid": "信任", "ence": "状态"}),
    "conservative": ("想保住现状的", {"servat": "保存", "ive": "的"}),
    "contribution": ("一起拿出来的东西", {"con": "一起", "tribut": "给予", "ion": "结果"}),
    "creation": ("生长出来的东西", {"cre": "生长", "ation": "结果"}),
    "description": ("一笔一笔写下来", {"de": "下来", "script": "写", "ion": "结果"}),
    "deserve": ("该得的那份", {"de": "该", "serv": "保存"}),
    "distribution": ("分开给出去", {"dis": "分开", "tribut": "给予", "ion": "行为"}),
    "enormous": ("超出常规的", {"e": "超出", "norm": "标准", "ous": "的"}),
    "exception": ("被拿出来放在一边的", {"ex": "拿出来", "cept": "拿", "ion": "结果"}),
    "factory": ("做东西的地方", {"fact": "做", "ory": "场所"}),
    "formal": ("讲形式的", {"form": "形式", "al": "的"}),
    "independence": ("不挂在别人下面", {"in": "不", "de": "下面", "pend": "悬挂", "ence": "状态"}),
    "motion": ("移动", {"mot": "移动", "ion": "行为"}),
    "nervous": ("神经绷着的", {"nerv": "神经", "ous": "的"}),
    "observation": ("守着看", {"ob": "朝向", "servat": "保存", "ion": "行为"}),
    "occasion": ("落到眼前的时候", {"oc": "朝", "cas": "落下", "ion": "时机"}),
    "opponent": ("站在对面的人", {"op": "对面", "pon": "放", "ent": "人"}),
    "oppose": ("站到对面", {"op": "对面"}),
    "opposite": ("放在对面的", {"op": "对面", "pos": "放", "ite": "的"}),
    "ordinary": ("按常规顺序的", {"ordin": "顺序", "ary": "的"}),
    "passage": ("走过去的路", {"pass": "通过", "age": "一段"}),
    "perception": ("彻底拿住信息", {"per": "彻底", "cept": "拿", "ion": "结果"}),
    "permit": ("放行", {"per": "彻底", "mit": "送"}),
    "personality": ("一个人身上稳定下来的特质", {"per": "彻底", "son": "声音", "al": "的", "ity": "性质"}),
    "physician": ("懂自然之学的人", {"phys": "自然", "ic": "的", "ian": "人"}),
    "preserve": ("提前保住", {}),
    "reference": ("带回来对照的东西", {"re": "回", "fer": "带来", "ence": "结果"}),
    "request": ("再求一次", {"re": "再", "quest": "寻求"}),
    "resistance": ("站回去顶住", {"re": "回", "sist": "站", "ance": "行为"}),
    "signal": ("用来标记的", {"sign": "标记", "al": "的"}),
    "technical": ("与技艺有关的", {"ical": "的"}),
    "tension": ("拉紧的状态", {"tens": "拉紧", "ion": "状态"}),
    "admission": ("准许送进去", {"ad": "朝", "miss": "送", "ion": "结果"}),
    "aggressive": ("往前冲的", {"ag": "朝", "gress": "走", "ive": "的"}),
    "anticipate": ("抢先拿到", {"anti": "先", "cip": "拿", "ate": "使"}),
    "assignment": ("标给某人的任务", {"as": "朝", "sign": "标记", "ment": "任务"}),
    "assistant": ("站在旁边的人", {"as": "旁边", "sist": "站", "ant": "人"}),
    "attractive": ("把人拉过来的", {"at": "朝", "tract": "拉", "ive": "的"}),
    "biological": ("与生命之学有关的", {"ical": "的"}),
}


def main() -> None:
    lexicon = json.loads(LEXICON.read_text(encoding="utf-8"))
    auto = json.loads(AUTO.read_text(encoding="utf-8"))
    curated = lexicon.setdefault("curated", {})

    added: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []
    for lemma, (literal, atoms) in OVERRIDES.items():
        if lemma in curated:
            skipped.append(lemma)
            continue
        info = auto.get(lemma)
        if not info:
            errors.append(f"{lemma}: 不在 AUTO 拆分表里")
            continue
        parts = [[p["kind"].lower(), p["form"]] for p in info["parts"]]
        joined = "".join(p[1] for p in parts)
        if joined != lemma and not (info.get("silentE") and joined + "e" == lemma):
            errors.append(f"{lemma}: 成分拼接为 {joined}，与词形不符")
            continue
        if not any(kind == "root" for kind, _ in parts):
            errors.append(f"{lemma}: 没有词根成分")
            continue
        curated[lemma] = {
            "parts": parts,
            "literal": literal,
            "atoms": atoms,
            "authoredBy": "AI_DRAFTED",
        }
        added.append(lemma)

    if errors:
        print("发现不可写入的条目：")
        for message in errors:
            print("  -", message)
        raise SystemExit(1)

    lexicon["version"] = "1.2.0"
    LEXICON.write_text(json.dumps(lexicon, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"新增 {len(added)} 条，跳过已存在 {len(skipped)} 条，curated 合计 {len(curated)}")


if __name__ == "__main__":
    main()
