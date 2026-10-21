# -*- coding: utf-8 -*-
"""
tier_a_sentences.py — Tier A 人工撰写例句（选词打分最高的前 300 词）

规则：
  * 每个词给出 1~3 个「面向雅思考试」的义项（pos / cn），每个义项配 1 条仿真例句。
  * 例句话题贴近雅思常见场景：环境、教育、科技、健康、城市化、社会政策。
  * 全部为仿真例句，脚本会统一写入 provenance = {type:'ADAPTED', note:'仿真例句（人工撰写...）'}。
  * surface 字段写句中实际出现的词形（原形或变形）。
  * 不写真题年份、题号或出处。

结构：
    TIER_A = { "<lemma>": [ {"pos": "n.", "cn": "...", "en": "...", "zh": "...", "surface": "..."}, ... ] }
"""

TIER_A = {

# ===================== 1 - 60 =====================
"analysis": [
    {"pos": "n.", "cn": "分析（对数据或问题的系统考察）",
     "en": "A detailed analysis of the survey data revealed a clear gap between urban and rural schools.",
     "zh": "对调查数据的详细分析揭示了城乡学校之间的明显差距。", "surface": "analysis"},
],
"present": [
    {"pos": "adj.", "cn": "现在的，当前的；出席的、在场的",
     "en": "Under the present system, patients in remote areas wait far longer for treatment.",
     "zh": "在现行制度下，偏远地区的患者要等更久才能得到治疗。", "surface": "present"},
    {"pos": "v.", "cn": "提出，呈现；展示",
     "en": "The researchers presented their findings at an international conference on public health.",
     "zh": "研究人员在一次公共卫生国际会议上展示了他们的发现。", "surface": "presented"},
],
"access": [
    {"pos": "n.", "cn": "使用权，获取途径；入口",
     "en": "Access to clean water remains limited in many rapidly growing cities.",
     "zh": "在许多快速扩张的城市，获得清洁水的途径仍然有限。", "surface": "Access"},
    {"pos": "v.", "cn": "获取，访问；进入",
     "en": "Students can access the digital library from any device with an internet connection.",
     "zh": "学生可以用任何联网设备访问这座数字图书馆。", "surface": "access"},
],
"text": [
    {"pos": "n.", "cn": "文本，正文；课文",
     "en": "The examiner asked candidates to compare two short texts on the same subject.",
     "zh": "考官要求考生比较两篇同一主题的短文。", "surface": "texts"},
],
"contribute": [
    {"pos": "v.", "cn": "促成，有助于；贡献",
     "en": "Vehicle emissions contribute significantly to air pollution in dense city centres.",
     "zh": "汽车尾气在人口稠密的市中心对空气污染有显著影响。", "surface": "contribute"},
],
"procedure": [
    {"pos": "n.", "cn": "程序，步骤；手续",
     "en": "The laboratory follows a strict procedure to avoid contaminating the samples.",
     "zh": "实验室遵循严格的程序，以避免样本受到污染。", "surface": "procedure"},
],
"demonstrate": [
    {"pos": "v.", "cn": "证明，表明；演示",
     "en": "The data demonstrate a steady decline in infant mortality over the past two decades.",
     "zh": "这些数据表明，过去二十年婴儿死亡率持续下降。", "surface": "demonstrate"},
],
"grade": [
    {"pos": "n.", "cn": "年级；等级，级别",
     "en": "Children in the upper grades are more likely to walk to school alone.",
     "zh": "高年级的孩子更可能独自步行上学。", "surface": "grades"},
    {"pos": "v.", "cn": "评分，给…打分；分级",
     "en": "Essays are graded by two examiners who do not know the candidate's name.",
     "zh": "作文由两位不知道考生姓名的阅卷人评分。", "surface": "graded"},
],
"context": [
    {"pos": "n.", "cn": "背景，语境；上下文",
     "en": "The statistic looks alarming until you examine the wider economic context.",
     "zh": "在考察更广阔的经济背景之前，这个统计数字看起来令人担忧。", "surface": "context"},
],
"category": [
    {"pos": "n.", "cn": "类别，种类",
     "en": "Household waste falls into several categories, each requiring different treatment.",
     "zh": "生活垃圾分为若干类别，每一类需要不同的处理方式。", "surface": "categories"},
],
"appropriate": [
    {"pos": "adj.", "cn": "恰当的，合适的",
     "en": "Governments must choose the most appropriate response to each local housing shortage.",
     "zh": "各国政府必须针对各地的住房短缺选择最恰当的应对方式。", "surface": "appropriate"},
],
"primary": [
    {"pos": "adj.", "cn": "主要的，首要的；初级的",
     "en": "The primary cause of the shortage was a lack of investment in public transport.",
     "zh": "造成短缺的主要原因是对公共交通缺乏投资。", "surface": "primary"},
],
"expand": [
    {"pos": "v.", "cn": "扩大，扩张；扩展",
     "en": "Many universities plan to expand their online courses over the next five years.",
     "zh": "许多大学计划在未来五年扩大其在线课程规模。", "surface": "expand"},
],
"mental": [
    {"pos": "adj.", "cn": "心理的，精神的",
     "en": "Long working hours have been linked to a rise in mental health problems among young employees.",
     "zh": "长时间工作与年轻员工心理健康问题增多有关。", "surface": "mental"},
],
"panel": [
    {"pos": "n.", "cn": "专家小组，专题讨论组；面板",
     "en": "A panel of independent scientists reviewed the report before it was published.",
     "zh": "一个独立科学家小组在该报告发表前对其进行了审阅。", "surface": "panel"},
],
"code": [
    {"pos": "n.", "cn": "法规，准则；代码",
     "en": "The new building code requires all flats to meet stricter insulation standards.",
     "zh": "新的建筑法规要求所有公寓达到更严格的隔热标准。", "surface": "code"},
],
"theme": [
    {"pos": "n.", "cn": "主题，话题",
     "en": "Sustainability has become a recurring theme in modern architecture courses.",
     "zh": "可持续性已成为现代建筑课程中反复出现的主题。", "surface": "theme"},
],
"shift": [
    {"pos": "n.", "cn": "转变，变化；轮班",
     "en": "There has been a marked shift towards renewable energy in the last decade.",
     "zh": "过去十年出现了向可再生能源的明显转变。", "surface": "shift"},
    {"pos": "v.", "cn": "转移，改变",
     "en": "Many factories shifted production overseas to reduce labour costs.",
     "zh": "许多工厂把生产转移到海外以降低劳动力成本。", "surface": "shifted"},
],
"generate": [
    {"pos": "v.", "cn": "产生，生成；发（电）",
     "en": "Wind farms now generate roughly a quarter of the country's electricity.",
     "zh": "风电场目前发电量约占该国用电量的四分之一。", "surface": "generate"},
],
"trend": [
    {"pos": "n.", "cn": "趋势，倾向",
     "en": "The upward trend in house prices shows no sign of slowing down.",
     "zh": "房价上涨的趋势没有任何放缓的迹象。", "surface": "trend"},
],
"unique": [
    {"pos": "adj.", "cn": "独特的，唯一的",
     "en": "Each neighbourhood has its own unique character that planners should preserve.",
     "zh": "每个街区都有其独特风貌，规划者应当加以保护。", "surface": "unique"},
],
"internal": [
    {"pos": "adj.", "cn": "内部的，国内的",
     "en": "The company published an internal review of its hiring practices.",
     "zh": "该公司公布了一份针对其招聘做法的内部审查报告。", "surface": "internal"},
],
"appreciate": [
    {"pos": "v.", "cn": "理解并重视；欣赏；感激",
     "en": "Few commuters appreciate how much the new rail line will reduce journey times.",
     "zh": "几乎没有通勤者意识到新铁路线将大幅缩短通勤时间。", "surface": "appreciate"},
],
"contrast": [
    {"pos": "n.", "cn": "对比，差异",
     "en": "In contrast to the 1990s, households now spend far less on basic food items.",
     "zh": "与二十世纪九十年代相比，如今家庭在基本食品上的支出少得多。", "surface": "contrast"},
    {"pos": "v.", "cn": "使对比，形成对照",
     "en": "The chart contrasts the energy consumption of four European countries.",
     "zh": "该图表对比了四个欧洲国家的能源消耗量。", "surface": "contrasts"},
],
"capacity": [
    {"pos": "n.", "cn": "容量，能力；容纳力",
     "en": "The stadium was rebuilt to increase its capacity to sixty thousand spectators.",
     "zh": "该体育场经过重建，容纳人数增加到六万名观众。", "surface": "capacity"},
],
"circumstance": [
    {"pos": "n.", "cn": "情况，情形；环境",
     "en": "Under no circumstances should candidates leave the room before the invigilator agrees.",
     "zh": "在任何情况下，考生都不得在监考人员同意之前离开考场。", "surface": "circumstances"},
],
"topic": [
    {"pos": "n.", "cn": "话题，主题",
     "en": "Examiners often choose a topic that every candidate has some experience of.",
     "zh": "考官常常选择每个考生都有些亲身体验的话题。", "surface": "topic"},
],
"somewhat": [
    {"pos": "adv.", "cn": "有点，稍微",
     "en": "The results were somewhat better than the researchers had expected.",
     "zh": "结果比研究人员预期的稍好一些。", "surface": "somewhat"},
],
"initial": [
    {"pos": "adj.", "cn": "最初的，开始的",
     "en": "The initial cost of solar panels is high, but the long-term savings are substantial.",
     "zh": "太阳能板的初期成本很高，但长期节省相当可观。", "surface": "initial"},
],
"contemporary": [
    {"pos": "adj.", "cn": "当代的；同时代的",
     "en": "Contemporary artists often use recycled materials to comment on consumer culture.",
     "zh": "当代艺术家常使用回收材料来评论消费文化。", "surface": "Contemporary"},
],
"invest": [
    {"pos": "v.", "cn": "投资；投入（时间、精力）",
     "en": "The council decided to invest heavily in cycle lanes rather than new car parks.",
     "zh": "市政委员会决定大力投资自行车道，而不是新建停车场。", "surface": "invest"},
],
"expose": [
    {"pos": "v.", "cn": "使暴露，使接触；揭露",
     "en": "Children who are exposed to high levels of traffic noise may struggle to concentrate.",
     "zh": "长期暴露在高强度交通噪音中的儿童可能难以集中注意力。", "surface": "exposed"},
],
"convince": [
    {"pos": "v.", "cn": "说服，使信服",
     "en": "The minister failed to convince the public that the new tax was necessary.",
     "zh": "部长未能让公众相信新税种是必要的。", "surface": "convince"},
],
"acquire": [
    {"pos": "v.", "cn": "获得，习得；购得",
     "en": "Children acquire their first language long before they learn to read.",
     "zh": "儿童早在学会阅读之前就习得了母语。", "surface": "acquire"},
],
"priority": [
    {"pos": "n.", "cn": "优先事项，优先权",
     "en": "Reducing class sizes should be a priority for any education budget.",
     "zh": "缩小班级规模应当是任何教育预算的优先事项。", "surface": "priority"},
],
"recover": [
    {"pos": "v.", "cn": "恢复，康复；重新获得",
     "en": "The local economy took almost five years to recover from the factory closures.",
     "zh": "当地经济花了将近五年才从工厂倒闭中恢复过来。", "surface": "recover"},
],
"layer": [
    {"pos": "n.", "cn": "层，层次",
     "en": "A thin layer of insulation can cut household heating bills considerably.",
     "zh": "薄薄一层隔热材料就能大幅降低家庭取暖开支。", "surface": "layer"},
],
"transform": [
    {"pos": "v.", "cn": "彻底改变，改造",
     "en": "The arrival of the railway transformed the village into a commuter town.",
     "zh": "铁路的通车把这个村庄变成了一座通勤城镇。", "surface": "transformed"},
],
"cycle": [
    {"pos": "n.", "cn": "周期，循环；自行车",
     "en": "The life cycle of the building was considered before the demolition permit was granted.",
     "zh": "在批准拆除许可之前，有关部门考虑了这座建筑的生命周期。", "surface": "cycle"},
],
"pose": [
    {"pos": "v.", "cn": "造成，引起（问题、威胁）；提出",
     "en": "Plastic waste poses a serious threat to marine life in coastal waters.",
     "zh": "塑料垃圾对沿海水域的海洋生物构成严重威胁。", "surface": "poses"},
],
"resolve": [
    {"pos": "v.", "cn": "解决，化解；决心",
     "en": "The two departments resolved their disagreement over the budget in a single meeting.",
     "zh": "两个部门在一次会议中就解决了预算分歧。", "surface": "resolved"},
],
"phase": [
    {"pos": "n.", "cn": "阶段，时期",
     "en": "The first phase of the project focused on repairing existing infrastructure.",
     "zh": "项目第一阶段专注于修复现有基础设施。", "surface": "phase"},
],
"adjust": [
    {"pos": "v.", "cn": "调整，调节；适应",
     "en": "Bus timetables were adjusted to match the new school hours.",
     "zh": "公交时刻表经过调整，以配合新的上课时间。", "surface": "adjusted"},
],
"visible": [
    {"pos": "adj.", "cn": "看得见的，明显的",
     "en": "The effects of the drought were visible from the air across the whole region.",
     "zh": "从空中可以看到干旱对整个地区造成的影响。", "surface": "visible"},
],
"fundamental": [
    {"pos": "adj.", "cn": "根本的，基本的",
     "en": "Access to schooling is a fundamental right, not a privilege.",
     "zh": "接受教育是一项基本权利，而非特权。", "surface": "fundamental"},
],
"illustrate": [
    {"pos": "v.", "cn": "说明，阐明；举例说明",
     "en": "The graph illustrates the relationship between income and life expectancy.",
     "zh": "该图说明了收入与预期寿命之间的关系。", "surface": "illustrates"},
],
"monitor": [
    {"pos": "v.", "cn": "监测，监控；监督",
     "en": "Sensors installed along the river monitor water quality every fifteen minutes.",
     "zh": "沿河安装的传感器每十五分钟监测一次水质。", "surface": "monitor"},
],
"concentrate": [
    {"pos": "v.", "cn": "集中（注意力）；聚集",
     "en": "Pupils find it hard to concentrate in classrooms that are too warm.",
     "zh": "在过于温暖的教室里，学生很难集中注意力。", "surface": "concentrate"},
],
"vary": [
    {"pos": "v.", "cn": "变化，不同",
     "en": "The cost of childcare varies enormously from one region to another.",
     "zh": "保育费用在不同地区之间差异极大。", "surface": "varies"},
],
"crucial": [
    {"pos": "adj.", "cn": "至关重要的，关键性的",
     "en": "Early diagnosis is crucial if the treatment is to succeed.",
     "zh": "要使治疗成功，早期诊断至关重要。", "surface": "crucial"},
],
"objective": [
    {"pos": "adj.", "cn": "客观的，不带偏见的",
     "en": "An objective assessment requires data that neither side has manipulated.",
     "zh": "客观的评估需要任何一方都未篡改过的数据。", "surface": "objective"},
    {"pos": "n.", "cn": "目标，目的",
     "en": "The main objective of the scheme is to cut carbon emissions by a third.",
     "zh": "该方案的主要目标是把碳排放减少三分之一。", "surface": "objective"},
],
"confront": [
    {"pos": "v.", "cn": "面对，遭遇；正视",
     "en": "City authorities are confronting a housing crisis they cannot solve alone.",
     "zh": "市政当局正面临一场无法独自解决的住房危机。", "surface": "confronting"},
],
"accompany": [
    {"pos": "v.", "cn": "伴随，与…同时发生；陪同",
     "en": "Rapid industrial growth is often accompanied by a sharp rise in pollution.",
     "zh": "快速的工业增长往往伴随着污染的急剧上升。", "surface": "accompanied"},
],
"convention": [
    {"pos": "n.", "cn": "惯例，习俗；大会；公约",
     "en": "By convention, the report lists the most recent data first.",
     "zh": "按照惯例，该报告先列出最新的数据。", "surface": "convention"},
],
"apparent": [
    {"pos": "adj.", "cn": "明显的；表面上的",
     "en": "It soon became apparent that the bridge could not carry heavy lorries.",
     "zh": "很快就明显看出，这座桥无法承载重型卡车。", "surface": "apparent"},
],
"restore": [
    {"pos": "v.", "cn": "恢复，修复；归还",
     "en": "Volunteers helped restore the wetland after years of industrial use.",
     "zh": "志愿者帮助修复了这片在工业用途下荒废多年的湿地。", "surface": "restore"},
],
"assure": [
    {"pos": "v.", "cn": "向…保证，使确信",
     "en": "Officials assured residents that the water supply was safe to drink.",
     "zh": "官员向居民保证，供水可以安全饮用。", "surface": "assured"},
],
"via": [
    {"pos": "prep.", "cn": "经由，通过",
     "en": "Passengers can now reach the airport via a direct underground line.",
     "zh": "乘客现在可以经由一条直达地铁线路到达机场。", "surface": "via"},
],
"nevertheless": [
    {"pos": "adv.", "cn": "然而，尽管如此",
     "en": "The scheme was expensive; nevertheless, it reduced waiting times substantially.",
     "zh": "该方案耗资巨大；尽管如此，它大幅缩短了等待时间。", "surface": "nevertheless"},
],
"routine": [
    {"pos": "n.", "cn": "常规，惯例；日常程序",
     "en": "Checking the equipment has become part of the laboratory's daily routine.",
     "zh": "检查设备已成为该实验室日常工作的一部分。", "surface": "routine"},
    {"pos": "adj.", "cn": "常规的，日常的",
     "en": "Routine maintenance prevents far more costly repairs later on.",
     "zh": "常规维护可以避免日后昂贵得多的维修。", "surface": "Routine"},
],

# ===================== 61 - 120 =====================
"index": [
    {"pos": "n.", "cn": "指数，指标；索引",
     "en": "The cost-of-living index rose by two per cent over the twelve-month period.",
     "zh": "生活成本指数在十二个月间上涨了百分之二。", "surface": "index"},
],
"draft": [
    {"pos": "n.", "cn": "草稿，草案",
     "en": "The committee circulated a draft of the new housing policy in March.",
     "zh": "委员会在三月分发了新住房政策的草案。", "surface": "draft"},
    {"pos": "v.", "cn": "起草，草拟",
     "en": "The report was drafted by three researchers working independently.",
     "zh": "该报告由三位独立工作的研究人员起草。", "surface": "drafted"},
],
"proceed": [
    {"pos": "v.", "cn": "继续进行，开展",
     "en": "Construction proceeded more slowly than the council had planned.",
     "zh": "施工进展比市政委员会计划的要慢。", "surface": "proceeded"},
],
"encounter": [
    {"pos": "v.", "cn": "遇到，遭遇",
     "en": "Surgeons increasingly encounter conditions that were rare thirty years ago.",
     "zh": "外科医生越来越多地遇到三十年前很罕见的病症。", "surface": "encounter"},
],
"retain": [
    {"pos": "v.", "cn": "保留，保持；留住",
     "en": "Older buildings were retained to preserve the character of the street.",
     "zh": "保留了较老的建筑，以维护这条街道的风貌。", "surface": "retained"},
],
"accurate": [
    {"pos": "adj.", "cn": "准确的，精确的",
     "en": "Accurate records are essential if the scheme is to be evaluated properly.",
     "zh": "若要妥善评估该方案，准确的记录必不可少。", "surface": "Accurate"},
],
"whereas": [
    {"pos": "conj.", "cn": "然而，而；鉴于",
     "en": "Rural bus services have been cut, whereas urban routes receive more funding.",
     "zh": "乡村公交服务被削减，而城市线路却获得更多资金。", "surface": "whereas"},
],
"chart": [
    {"pos": "n.", "cn": "图表，图",
     "en": "The chart below shows changes in average household size since 1980.",
     "zh": "下图显示了自1980年以来家庭平均规模的变化。", "surface": "chart"},
],
"interpret": [
    {"pos": "v.", "cn": "解读，理解；口译",
     "en": "The figures can be interpreted in several quite different ways.",
     "zh": "这些数字可以用几种截然不同的方式来解读。", "surface": "interpreted"},
],
"relevant": [
    {"pos": "adj.", "cn": "相关的，切题的",
     "en": "Candidates lose marks when they include information that is not relevant.",
     "zh": "考生如果加入不相关的信息就会丢分。", "surface": "relevant"},
],
"justify": [
    {"pos": "v.", "cn": "证明…正当，为…辩护",
     "en": "The council must justify spending so much on a single new road.",
     "zh": "市政委员会必须证明把这么多钱花在一条新路上是合理的。", "surface": "justify"},
],
"prior": [
    {"pos": "adj.", "cn": "先前的，在前的；优先的",
     "en": "Applicants with prior experience of teaching are preferred.",
     "zh": "有教学经验的申请者优先考虑。", "surface": "prior"},
],
"alter": [
    {"pos": "v.", "cn": "改变，改动",
     "en": "Widening the pavement altered the way people used the street.",
     "zh": "加宽人行道改变了人们使用这条街道的方式。", "surface": "altered"},
],
"convert": [
    {"pos": "v.", "cn": "转变，改造；换算",
     "en": "The old warehouse was converted into thirty affordable flats.",
     "zh": "旧仓库被改造成了三十套经济适用公寓。", "surface": "converted"},
],
"steady": [
    {"pos": "adj.", "cn": "稳定的，稳步的",
     "en": "There has been a steady increase in the number of cyclists since 2010.",
     "zh": "自2010年以来，骑自行车的人数稳步增加。", "surface": "steady"},
],
"adapt": [
    {"pos": "v.", "cn": "使适应，适应",
     "en": "Species that fail to adapt quickly to shifting habitats face severe extinction risks.",
     "zh": "无法迅速适应栖息地变化的物种面临严重的灭绝风险。", "surface": "adapt"},
    {"pos": "v.", "cn": "改编，改造",
     "en": "The book was adapted for television in 2019.",
     "zh": "这本书在2019年被改编成电视剧。", "surface": "adapted"},
],
"distribute": [
    {"pos": "v.", "cn": "分发，分配；分布",
     "en": "Vaccines were distributed to clinics across the region within a week.",
     "zh": "疫苗在一周内被分发到全地区的诊所。", "surface": "distributed"},
],
"trace": [
    {"pos": "v.", "cn": "追踪，追溯；查出",
     "en": "Scientists can trace the source of the contamination to a single factory.",
     "zh": "科学家可以把污染源追溯到一家工厂。", "surface": "trace"},
    {"pos": "n.", "cn": "痕迹，微量",
     "en": "Tests found no trace of the chemical in the drinking water.",
     "zh": "检测发现饮用水中没有这种化学物质的痕迹。", "surface": "trace"},
],
"uniform": [
    {"pos": "adj.", "cn": "统一的，一致的",
     "en": "The study calls for uniform safety standards across all European airports.",
     "zh": "该研究呼吁在所有欧洲机场实行统一的安全标准。", "surface": "uniform"},
],
"derive": [
    {"pos": "v.", "cn": "源自，得自；获得",
     "en": "Much of the city's wealth is derived from its port.",
     "zh": "这座城市的大部分财富来自其港口。", "surface": "derived"},
],
"proportion": [
    {"pos": "n.", "cn": "比例，部分",
     "en": "A growing proportion of graduates now rent rather than buy their first home.",
     "zh": "如今越来越多的毕业生选择租房而非购买首套住房。", "surface": "proportion"},
],
"sufficient": [
    {"pos": "adj.", "cn": "足够的，充足的",
     "en": "The shelter had sufficient beds for everyone who arrived that night.",
     "zh": "该收容所有足够的床位供当晚抵达的所有人使用。", "surface": "sufficient"},
],
"temporary": [
    {"pos": "adj.", "cn": "临时的，暂时的",
     "en": "Temporary housing was provided while the damaged flats were repaired.",
     "zh": "在受损公寓维修期间提供了临时住房。", "surface": "Temporary"},
],
"register": [
    {"pos": "v.", "cn": "登记，注册；记录",
     "en": "All households must register before they can use the recycling service.",
     "zh": "所有家庭必须先登记，才能使用回收服务。", "surface": "register"},
],
"devote": [
    {"pos": "v.", "cn": "投入，献身于；把…专用于",
     "en": "The hospital devotes an entire floor to children's outpatient care.",
     "zh": "这家医院把整整一层楼专门用于儿童门诊服务。", "surface": "devotes"},
],
"medium": [
    {"pos": "n.", "cn": "媒介，媒体；手段",
     "en": "Television remains the medium through which most people get their news.",
     "zh": "电视仍然是大多数人获取新闻的媒介。", "surface": "medium"},
],
"adequate": [
    {"pos": "adj.", "cn": "足够的，适当的",
     "en": "Many schools lack adequate space for indoor sport in winter.",
     "zh": "许多学校缺少足够的冬季室内运动场地。", "surface": "adequate"},
],
"formula": [
    {"pos": "n.", "cn": "公式，配方；方案",
     "en": "The formula used to calculate the grant has been revised twice.",
     "zh": "用于计算补助金的公式已经修订过两次。", "surface": "formula"},
],
"highlight": [
    {"pos": "v.", "cn": "突出，强调；使显著",
     "en": "The report highlights the widening gap between rich and poor districts.",
     "zh": "该报告突出了富裕街区与贫困街区之间不断扩大的差距。", "surface": "highlights"},
],
"logic": [
    {"pos": "n.", "cn": "逻辑，推理方式；道理",
     "en": "The logic behind the policy is that fewer cars mean cleaner air.",
     "zh": "这项政策背后的逻辑是：汽车越少，空气越清洁。", "surface": "logic"},
],
"exclude": [
    {"pos": "v.", "cn": "排除，不包括",
     "en": "The survey excluded households without a fixed address.",
     "zh": "该调查排除了没有固定住所的家庭。", "surface": "excluded"},
],
"reverse": [
    {"pos": "v.", "cn": "逆转，扭转；倒车",
     "en": "It may take decades to reverse the damage done to the soil.",
     "zh": "要扭转对土壤造成的破坏可能需要几十年。", "surface": "reverse"},
    {"pos": "adj.", "cn": "相反的，反向的",
     "en": "The figures show the reverse pattern in northern Europe.",
     "zh": "这些数字在北欧呈现出相反的模式。", "surface": "reverse"},
],
"confuse": [
    {"pos": "v.", "cn": "使困惑；混淆",
     "en": "Shoppers are often confused by the number of different recycling bins.",
     "zh": "购物者常被种类繁多的回收箱弄糊涂。", "surface": "confused"},
],
"lecture": [
    {"pos": "n.", "cn": "讲座，课",
     "en": "The first lecture of the term dealt with urban population growth.",
     "zh": "本学期的第一堂课讲的是城市人口增长。", "surface": "lecture"},
],
"consult": [
    {"pos": "v.", "cn": "咨询，请教；查阅",
     "en": "Planners consulted local residents before drawing up the scheme.",
     "zh": "规划者在制定方案前咨询了当地居民。", "surface": "consulted"},
],
"precise": [
    {"pos": "adj.", "cn": "精确的，确切的",
     "en": "The satellite provides precise data on changes in forest cover.",
     "zh": "该卫星提供关于森林覆盖率变化的精确数据。", "surface": "precise"},
],
"output": [
    {"pos": "n.", "cn": "产量，产出；输出",
     "en": "Factory output fell by eight per cent during the recession.",
     "zh": "经济衰退期间工厂产量下降了百分之八。", "surface": "output"},
],
"insert": [
    {"pos": "v.", "cn": "插入，嵌入；添加",
     "en": "Candidates should insert the missing word in the space provided.",
     "zh": "考生应在所给空白处填入缺失的单词。", "surface": "insert"},
],
"equivalent": [
    {"pos": "adj.", "cn": "相等的，等同的",
     "en": "The grant is equivalent to about three weeks of average wages.",
     "zh": "这笔补助相当于大约三周的平均工资。", "surface": "equivalent"},
],
"behalf": [
    {"pos": "n.", "cn": "（on behalf of）代表；利益",
     "en": "The union negotiated on behalf of more than four thousand workers.",
     "zh": "工会代表四千多名工人进行了谈判。", "surface": "behalf"},
],
"cease": [
    {"pos": "v.", "cn": "停止，终止",
     "en": "Funding for the night bus service ceased at the end of the year.",
     "zh": "夜间公交服务的资金在年底终止了。", "surface": "ceased"},
],
"interval": [
    {"pos": "n.", "cn": "间隔，间隙",
     "en": "Trains run at ten-minute intervals during the morning peak.",
     "zh": "早高峰期间列车每十分钟一班。", "surface": "intervals"},
],
"summary": [
    {"pos": "n.", "cn": "摘要，总结",
     "en": "Each chapter ends with a short summary of the main findings.",
     "zh": "每一章都以简短的主要发现摘要结尾。", "surface": "summary"},
],
"confine": [
    {"pos": "v.", "cn": "限制，局限于；禁闭",
     "en": "The damage was largely confined to the eastern side of the city.",
     "zh": "破坏主要局限于城市东部。", "surface": "confined"},
],
"substitute": [
    {"pos": "n.", "cn": "替代品，代替者",
     "en": "Margarine is a cheap substitute for butter in most recipes.",
     "zh": "在大多数食谱中，人造黄油是黄油的一种廉价替代品。", "surface": "substitute"},
    {"pos": "v.", "cn": "代替，取代",
     "en": "Online tutorials have substituted for many face-to-face classes.",
     "zh": "在线辅导已经取代了许多面授课程。", "surface": "substituted"},
],
"revise": [
    {"pos": "v.", "cn": "修订，修改；复习",
     "en": "The timetable was revised after passengers complained about delays.",
     "zh": "在乘客抱怨延误之后，时刻表做了修订。", "surface": "revised"},
],
"evidence": [
    {"pos": "n.", "cn": "证据，根据；迹象",
     "en": "There is growing evidence that green spaces improve mental health.",
     "zh": "越来越多的证据表明，绿地能改善心理健康。", "surface": "evidence"},
],
"culture": [
    {"pos": "n.", "cn": "文化；培养",
     "en": "Local culture can be damaged as easily as local buildings.",
     "zh": "地方文化和地方建筑一样容易受到破坏。", "surface": "culture"},
],
"energy": [
    {"pos": "n.", "cn": "能源；精力",
     "en": "Households that generate their own energy still rely partly on the grid.",
     "zh": "自行发电的家庭仍有一部分依赖电网。", "surface": "energy"},
],
"period": [
    {"pos": "n.", "cn": "时期，一段时间",
     "en": "Unemployment fell throughout the period covered by the study.",
     "zh": "在该研究涵盖的整个时期内，失业率都在下降。", "surface": "period"},
],
"available": [
    {"pos": "adj.", "cn": "可获得的，可用的",
     "en": "Affordable housing is simply not available in the city centre.",
     "zh": "市中心根本没有可负担得起的住房。", "surface": "available"},
],
"economy": [
    {"pos": "n.", "cn": "经济；节约",
     "en": "Tourism now accounts for a fifth of the island's economy.",
     "zh": "旅游业目前占该岛经济的五分之一。", "surface": "economy"},
],
"involve": [
    {"pos": "v.", "cn": "涉及，包含；使参与",
     "en": "The scheme involves training more than five hundred new teachers.",
     "zh": "该方案涉及培训五百多名新教师。", "surface": "involves"},
],
"author": [
    {"pos": "n.", "cn": "作者，著者",
     "en": "The author argues that car ownership will decline within a generation.",
     "zh": "作者认为，汽车保有量将在一代人之内下降。", "surface": "author"},
],
"focus": [
    {"pos": "n.", "cn": "焦点，重点",
     "en": "The focus of the study is the link between diet and school performance.",
     "zh": "这项研究的重点是饮食与学业表现之间的联系。", "surface": "focus"},
    {"pos": "v.", "cn": "集中（注意力），聚焦",
     "en": "The second chapter focuses on transport in smaller towns.",
     "zh": "第二章聚焦于较小城镇的交通。", "surface": "focuses"},
],
"series": [
    {"pos": "n.", "cn": "一系列，连续",
     "en": "A series of storms caused widespread damage along the coast.",
     "zh": "一系列风暴在沿海地区造成了大范围破坏。", "surface": "series"},
],
"significant": [
    {"pos": "adj.", "cn": "显著的，重要的",
     "en": "There was no significant change in attendance after the fee was introduced.",
     "zh": "引入收费后，出勤率没有出现显著变化。", "surface": "significant"},
],
"similar": [
    {"pos": "adj.", "cn": "相似的，类似的",
     "en": "Similar patterns have been observed in several other European cities.",
     "zh": "在其他几个欧洲城市也观察到了类似的模式。", "surface": "Similar"},
],
"factor": [
    {"pos": "n.", "cn": "因素，要素",
     "en": "Cost is the single most important factor for most first-time buyers.",
     "zh": "对大多数首次购房者来说，成本是最重要的单一因素。", "surface": "factor"},
],
"decade": [
    {"pos": "n.", "cn": "十年",
     "en": "Public transport use has doubled over the past decade.",
     "zh": "过去十年里，公共交通的使用量翻了一番。", "surface": "decade"},
],

# ===================== 121 - 180 =====================
"approach": [
    {"pos": "n.", "cn": "方法，途径；接近",
     "en": "Researchers proposed a novel approach to recycling plastic waste.",
     "zh": "研究人员提出了一种回收塑料垃圾的新方法。", "surface": "approach"},
    {"pos": "v.", "cn": "接近，靠近；着手处理",
     "en": "As winter approaches, demand for emergency beds rises sharply.",
     "zh": "随着冬季临近，对紧急床位的需求急剧上升。", "surface": "approaches"},
],
"occur": [
    {"pos": "v.", "cn": "发生；出现",
     "en": "Most accidents occur at junctions without traffic lights.",
     "zh": "大多数事故发生在没有红绿灯的路口。", "surface": "occur"},
],
"media": [
    {"pos": "n.", "cn": "媒体，传媒",
     "en": "The media tend to report extreme weather rather than gradual change.",
     "zh": "媒体倾向于报道极端天气，而不是渐变。", "surface": "media"},
],
"individual": [
    {"pos": "n.", "cn": "个人，个体",
     "en": "The survey followed the same individuals for fifteen years.",
     "zh": "该调查对同一批个体进行了长达十五年的跟踪。", "surface": "individuals"},
    {"pos": "adj.", "cn": "个别的，个人的",
     "en": "Individual choices matter less than the infrastructure available.",
     "zh": "个人选择的影响不如现有基础设施大。", "surface": "Individual"},
],
"resource": [
    {"pos": "n.", "cn": "资源，物力",
     "en": "Water is becoming an increasingly scarce resource in the region.",
     "zh": "水在该地区正变成一种日益稀缺的资源。", "surface": "resource"},
],
"identify": [
    {"pos": "v.", "cn": "识别，确认；发现",
     "en": "Engineers identified three points where the bridge was most at risk.",
     "zh": "工程师确认了这座桥梁风险最大的三个位置。", "surface": "identified"},
],
"region": [
    {"pos": "n.", "cn": "地区，区域",
     "en": "The northern region has the highest rate of youth unemployment.",
     "zh": "北部地区的青年失业率最高。", "surface": "region"},
],
"physical": [
    {"pos": "adj.", "cn": "身体的，物质的；物理的",
     "en": "Children need at least an hour of physical activity every day.",
     "zh": "儿童每天至少需要一小时的身体活动。", "surface": "physical"},
],
"benefit": [
    {"pos": "n.", "cn": "好处，益处；福利",
     "en": "The health benefits of walking to school are well documented.",
     "zh": "步行上学对健康的益处有充分记录。", "surface": "benefits"},
    {"pos": "v.", "cn": "使受益，得益于",
     "en": "Families on low incomes benefit most from free bus travel.",
     "zh": "低收入家庭从免费公交出行中受益最多。", "surface": "benefit"},
],
"sex": [
    {"pos": "n.", "cn": "性别；性",
     "en": "The table compares unemployment rates by sex and age group.",
     "zh": "该表按性别和年龄组比较了失业率。", "surface": "sex"},
],
"section": [
    {"pos": "n.", "cn": "部分，章节；区域",
     "en": "The final section of the report deals with future risks.",
     "zh": "报告的最后一部分讨论未来的风险。", "surface": "section"},
],
"authority": [
    {"pos": "n.", "cn": "当局，官方；权威",
     "en": "The local authority has no power to close the railway line.",
     "zh": "地方当局无权关闭这条铁路线。", "surface": "authority"},
],
"design": [
    {"pos": "n.", "cn": "设计，构思",
     "en": "The design of the building allows daylight to reach every classroom.",
     "zh": "这座建筑的设计让日光能照进每一间教室。", "surface": "design"},
    {"pos": "v.", "cn": "设计，策划",
     "en": "The park was designed to flood safely during heavy rain.",
     "zh": "这座公园的设计使其在暴雨期间可以安全蓄洪。", "surface": "designed"},
],
"strategy": [
    {"pos": "n.", "cn": "策略，战略",
     "en": "A national strategy on food waste was published last spring.",
     "zh": "去年春天发布了一项关于食物浪费的国家战略。", "surface": "strategy"},
],
"environment": [
    {"pos": "n.", "cn": "环境，自然环境",
     "en": "Pupils who learn outdoors often show more concern for the environment.",
     "zh": "在户外学习的学生往往更关心环境。", "surface": "environment"},
],
"network": [
    {"pos": "n.", "cn": "网络，系统；关系网",
     "en": "The tram network now covers most of the metropolitan area.",
     "zh": "有轨电车网络目前覆盖了大半个都市区。", "surface": "network"},
],
"legal": [
    {"pos": "adj.", "cn": "法律的，合法的",
     "en": "Landlords have a legal duty to keep rented homes warm.",
     "zh": "房东有法律义务保证出租房屋温暖。", "surface": "legal"},
],
"final": [
    {"pos": "adj.", "cn": "最终的，最后的",
     "en": "The final decision rests with the planning committee.",
     "zh": "最终决定由规划委员会作出。", "surface": "final"},
],
"establish": [
    {"pos": "v.", "cn": "建立，设立；确定",
     "en": "The university established a research centre on urban flooding.",
     "zh": "这所大学设立了一个研究城市内涝的研究中心。", "surface": "established"},
],
"expert": [
    {"pos": "n.", "cn": "专家，行家",
     "en": "Independent experts reviewed the data before publication.",
     "zh": "独立专家在发表前审阅了这些数据。", "surface": "experts"},
],
"theory": [
    {"pos": "n.", "cn": "理论，学说",
     "en": "The theory has been tested in several very different cities.",
     "zh": "该理论已在几个差异很大的城市得到检验。", "surface": "theory"},
],
"impact": [
    {"pos": "n.", "cn": "影响，冲击",
     "en": "The impact of the new motorway on local air quality was severe.",
     "zh": "新高速公路对当地空气质量的影响十分严重。", "surface": "impact"},
],
"maintain": [
    {"pos": "v.", "cn": "维持，保持；维修",
     "en": "It costs far more to maintain a car than to run a bicycle.",
     "zh": "养护一辆汽车的花费远高于使用一辆自行车。", "surface": "maintain"},
],
"affect": [
    {"pos": "v.", "cn": "影响，作用于",
     "en": "Noise from the airport affects several thousand households.",
     "zh": "机场的噪音影响到数千户家庭。", "surface": "affects"},
],
"style": [
    {"pos": "n.", "cn": "风格，方式；样式",
     "en": "The architect's style suits a cold climate better than a hot one.",
     "zh": "这位建筑师的风格更适合寒冷气候，而非炎热气候。", "surface": "style"},
],
"adult": [
    {"pos": "n.", "cn": "成年人",
     "en": "One in five adults in the survey had never used a computer.",
     "zh": "调查中五分之一的成年人从未使用过电脑。", "surface": "adults"},
],
"range": [
    {"pos": "n.", "cn": "范围，幅度；系列",
     "en": "The scheme supports a wide range of community projects.",
     "zh": "该方案支持范围广泛的社区项目。", "surface": "range"},
],
"specific": [
    {"pos": "adj.", "cn": "具体的，特定的",
     "en": "The report makes no specific recommendation on fares.",
     "zh": "该报告没有就票价提出具体建议。", "surface": "specific"},
],
"challenge": [
    {"pos": "n.", "cn": "挑战，难题",
     "en": "The biggest challenge is persuading people to change habits.",
     "zh": "最大的挑战是说服人们改变习惯。", "surface": "challenge"},
],
"method": [
    {"pos": "n.", "cn": "方法，办法",
     "en": "The team used two different methods to check the results.",
     "zh": "该团队用两种不同的方法核对了结果。", "surface": "methods"},
],
"item": [
    {"pos": "n.", "cn": "项目，条目；一件物品",
     "en": "Households were asked to record every item they threw away.",
     "zh": "被调查的家庭被要求记录他们丢弃的每一件物品。", "surface": "item"},
],
"positive": [
    {"pos": "adj.", "cn": "积极的，正面的；肯定的",
     "en": "The response from residents has been overwhelmingly positive.",
     "zh": "居民的反应极为积极。", "surface": "positive"},
],
"assume": [
    {"pos": "v.", "cn": "假定，认为；承担",
     "en": "Planners assumed that traffic would keep growing every year.",
     "zh": "规划者假定交通量会逐年持续增长。", "surface": "assumed"},
],
"professional": [
    {"pos": "adj.", "cn": "专业的，职业的",
     "en": "Teachers need professional support, not just more equipment.",
     "zh": "教师需要专业支持，而不只是更多设备。", "surface": "professional"},
],
"option": [
    {"pos": "n.", "cn": "选择，选项",
     "en": "Few households regard renting as an attractive long-term option.",
     "zh": "很少有家庭认为租房是有吸引力的长期选择。", "surface": "option"},
],
"release": [
    {"pos": "v.", "cn": "释放，排放；发布",
     "en": "Older vehicles release far more particulates than new ones.",
     "zh": "老旧车辆排放的颗粒物远多于新车。", "surface": "release"},
],
"version": [
    {"pos": "n.", "cn": "版本，说法",
     "en": "The 2020 version of the test contains an extra reading passage.",
     "zh": "2020年版本的考试增加了一篇阅读文章。", "surface": "version"},
],
"achieve": [
    {"pos": "v.", "cn": "实现，达到；取得",
     "en": "Only one country achieved the target set for 2015.",
     "zh": "只有一个国家实现了为2015年设定的目标。", "surface": "achieved"},
],
"conflict": [
    {"pos": "n.", "cn": "冲突，矛盾",
     "en": "There is an obvious conflict between cheap housing and green space.",
     "zh": "廉价住房与绿地之间存在明显的矛盾。", "surface": "conflict"},
],
"feature": [
    {"pos": "n.", "cn": "特征，特点；专题",
     "en": "A key feature of the plan is the car-free zone around schools.",
     "zh": "该计划的一个关键特点是在学校周边设立无车区。", "surface": "feature"},
],
"status": [
    {"pos": "n.", "cn": "地位，身份；状态",
     "en": "Owning a home still confers social status in many countries.",
     "zh": "在许多国家，拥有住房仍然带来社会地位。", "surface": "status"},
],
"survey": [
    {"pos": "n.", "cn": "调查，勘测",
     "en": "A national survey found that commuting times had lengthened.",
     "zh": "一项全国性调查发现，通勤时间变长了。", "surface": "survey"},
],
"potential": [
    {"pos": "n.", "cn": "潜力，潜能；可能性",
     "en": "All children should be encouraged to realize their full potential.",
     "zh": "应当鼓励所有孩子充分发挥潜能。", "surface": "potential"},
    {"pos": "adj.", "cn": "潜在的，可能的",
     "en": "The company is looking for potential customers who value sustainable packaging.",
     "zh": "公司正在寻找重视可持续包装的潜在客户。", "surface": "potential"},
],
"contract": [
    {"pos": "n.", "cn": "合同，契约",
     "en": "The contract requires the builder to finish within two years.",
     "zh": "合同要求施工方在两年内完工。", "surface": "contract"},
    {"pos": "v.", "cn": "收缩，缩小；感染（疾病）",
     "en": "Metals contract as the temperature falls overnight.",
     "zh": "金属在夜间温度下降时会收缩。", "surface": "contract"},
],
"previous": [
    {"pos": "adj.", "cn": "先前的，以前的",
     "en": "Previous studies ignored households without a car.",
     "zh": "先前的研究忽略了没有汽车的家庭。", "surface": "Previous"},
],
"vehicle": [
    {"pos": "n.", "cn": "车辆，交通工具；媒介",
     "en": "Electric vehicles produce no exhaust fumes at the point of use.",
     "zh": "电动车辆在使用过程中不产生尾气。", "surface": "vehicles"},
],
"emerge": [
    {"pos": "v.", "cn": "出现，浮现；显露",
     "en": "A clear pattern emerged once the data were sorted by income.",
     "zh": "数据按收入排序后，一个清晰的模式显现出来。", "surface": "emerged"},
],
"promote": [
    {"pos": "v.", "cn": "促进，推动；晋升",
     "en": "The campaign promotes cycling as a cheap way to improve health.",
     "zh": "这项活动把骑自行车宣传为改善健康的廉价方式。", "surface": "promotes"},
],
"technique": [
    {"pos": "n.", "cn": "技术，技巧，方法",
     "en": "Farmers were taught a simple technique for saving water.",
     "zh": "农民学会了一种简单的节水技术。", "surface": "technique"},
],
"annual": [
    {"pos": "adj.", "cn": "每年的，年度的",
     "en": "The annual report shows a steady fall in railway subsidies.",
     "zh": "年度报告显示铁路补贴在持续下降。", "surface": "annual"},
],
"comment": [
    {"pos": "n.", "cn": "评论，意见",
     "en": "The minister declined to comment on the leaked figures.",
     "zh": "部长拒绝对泄露的数据发表评论。", "surface": "comment"},
],
"review": [
    {"pos": "n.", "cn": "审查，评估；评论",
     "en": "An independent review of the scheme is due next year.",
     "zh": "对该方案的独立审查定于明年进行。", "surface": "review"},
],
"commit": [
    {"pos": "v.", "cn": "承诺，投入；犯（罪、错）",
     "en": "The government has committed £40 million to flood defences.",
     "zh": "政府已承诺投入四千万英镑用于防洪。", "surface": "committed"},
],
"aware": [
    {"pos": "adj.", "cn": "意识到的，知道的",
     "en": "Few drivers are aware of how much fuel idling wastes.",
     "zh": "很少有司机意识到怠速会浪费多少燃油。", "surface": "aware"},
],
"function": [
    {"pos": "n.", "cn": "功能，作用",
     "en": "Green roofs perform the same function as ordinary insulation.",
     "zh": "绿色屋顶起着与普通隔热层相同的作用。", "surface": "function"},
    {"pos": "v.", "cn": "运作，起作用",
     "en": "The system functions well only when buses run on time.",
     "zh": "只有在公交准点的情况下，这套系统才能良好运作。", "surface": "functions"},
],
"contact": [
    {"pos": "n.", "cn": "接触，联系",
     "en": "Children with little contact with nature may value it less later.",
     "zh": "很少接触自然的孩子日后可能不太重视自然。", "surface": "contact"},
],
"supply": [
    {"pos": "n.", "cn": "供应，供给",
     "en": "The supply of affordable flats has not kept pace with demand.",
     "zh": "经济适用公寓的供应没有跟上需求。", "surface": "supply"},
],
"domestic": [
    {"pos": "adj.", "cn": "家庭的，国内的；家用的",
     "en": "Domestic waste accounts for a third of all rubbish collected.",
     "zh": "生活垃圾占所收集垃圾总量的三分之一。", "surface": "Domestic"},
],
"complex": [
    {"pos": "adj.", "cn": "复杂的，难解的",
     "en": "The causes of obesity are far more complex than diet alone.",
     "zh": "肥胖的成因远比单纯的饮食复杂得多。", "surface": "complex"},
],
"minority": [
    {"pos": "n.", "cn": "少数，少数群体",
     "en": "Only a small minority of commuters travel by bicycle.",
     "zh": "只有少数通勤者骑自行车出行。", "surface": "minority"},
],

# ===================== 181 - 240 =====================
"obvious": [
    {"pos": "adj.", "cn": "明显的，显而易见的",
     "en": "The link between poverty and poor housing is obvious.",
     "zh": "贫困与恶劣住房条件之间的联系显而易见。", "surface": "obvious"},
],
"stress": [
    {"pos": "n.", "cn": "压力，紧张；强调",
     "en": "Long commuting times are a major source of stress for workers.",
     "zh": "漫长的通勤时间是工人压力的一个主要来源。", "surface": "stress"},
    {"pos": "v.", "cn": "强调，着重",
     "en": "The lecturer stressed the need for reliable data.",
     "zh": "讲师强调了可靠数据的必要性。", "surface": "stressed"},
],
"estimate": [
    {"pos": "v.", "cn": "估计，估算",
     "en": "Officials estimate that two million tonnes of food are wasted each year.",
     "zh": "官员估计每年有二百万吨食物被浪费。", "surface": "estimate"},
],
"investigate": [
    {"pos": "v.", "cn": "调查，研究",
     "en": "Inspectors investigated complaints about the new recycling plant.",
     "zh": "检查人员调查了对新回收工厂的投诉。", "surface": "investigated"},
],
"fee": [
    {"pos": "n.", "cn": "费用，费",
     "en": "Parents pay an hourly fee for after-school care.",
     "zh": "家长按小时支付课后托管费。", "surface": "fee"},
],
"confirm": [
    {"pos": "v.", "cn": "证实，确认",
     "en": "The second study confirmed the findings of the first.",
     "zh": "第二项研究证实了第一项研究的发现。", "surface": "confirmed"},
],
"grant": [
    {"pos": "n.", "cn": "拨款，补助金",
     "en": "The council awarded a grant of £20,000 to the community garden.",
     "zh": "市政委员会向社区花园拨了两万英镑的补助金。", "surface": "grant"},
    {"pos": "v.", "cn": "准予，授予；承认",
     "en": "Permission was granted only after a public hearing.",
     "zh": "只有在举行公众听证会之后才获得许可。", "surface": "granted"},
],
"volume": [
    {"pos": "n.", "cn": "量，体积；音量；卷册",
     "en": "The volume of traffic on the ring road has doubled since 2000.",
     "zh": "环城公路上的交通量自2000年以来翻了一番。", "surface": "volume"},
],
"overall": [
    {"pos": "adj.", "cn": "总的，全面的",
     "en": "The overall cost of the scheme was higher than expected.",
     "zh": "该方案的总体成本高于预期。", "surface": "overall"},
],
"sector": [
    {"pos": "n.", "cn": "部门，行业；区域",
     "en": "The transport sector produces more emissions than any other.",
     "zh": "交通运输部门的排放量高于任何其他部门。", "surface": "sector"},
],
"decline": [
    {"pos": "n.", "cn": "下降，衰退",
     "en": "There has been a sharp decline in the number of corner shops.",
     "zh": "街角小店的数量出现了急剧下降。", "surface": "decline"},
    {"pos": "v.", "cn": "下降，减少；婉拒",
     "en": "Sales of newspapers have declined steadily since 2005.",
     "zh": "自2005年以来，报纸销量持续下降。", "surface": "declined"},
],
"plus": [
    {"pos": "prep.", "cn": "加，加上",
     "en": "Two bedrooms plus a small garden is the minimum for most families.",
     "zh": "两间卧室加一个小花园是大多数家庭的最低要求。", "surface": "plus"},
],
"alternative": [
    {"pos": "n.", "cn": "替代方案，选择",
     "en": "Trams are a cleaner alternative to diesel buses.",
     "zh": "有轨电车是比柴油公交车更清洁的替代方案。", "surface": "alternative"},
    {"pos": "adj.", "cn": "可供选择的，替代的",
     "en": "Cyclists should be offered alternative routes during the works.",
     "zh": "施工期间应为骑行者提供替代路线。", "surface": "alternative"},
],
"suspect": [
    {"pos": "v.", "cn": "怀疑，猜想",
     "en": "Researchers suspect that the figures understate the true problem.",
     "zh": "研究人员怀疑这些数字低估了问题的真实程度。", "surface": "suspect"},
],
"schedule": [
    {"pos": "n.", "cn": "时间表，日程安排",
     "en": "The building work fell six months behind schedule.",
     "zh": "建筑工程比时间表落后了六个月。", "surface": "schedule"},
],
"dominate": [
    {"pos": "v.", "cn": "支配，占主导地位",
     "en": "Cars still dominate the streets of most British towns.",
     "zh": "汽车仍然占据着大多数英国城镇街道的主导地位。", "surface": "dominate"},
],
"transfer": [
    {"pos": "v.", "cn": "转移，调动；转让",
     "en": "Passengers can transfer between the two lines without paying again.",
     "zh": "乘客可以在两条线路之间换乘而无需再次付费。", "surface": "transfer"},
],
"prospect": [
    {"pos": "n.", "cn": "前景，可能性；展望",
     "en": "The prospect of four-day weeks appeals to many office workers.",
     "zh": "每周四天工作制的前景对许多上班族有吸引力。", "surface": "prospect"},
],
"impose": [
    {"pos": "v.", "cn": "强制实行，征收；把…强加于",
     "en": "The city imposed a charge on drivers entering the centre.",
     "zh": "该市对进入市中心的司机收费。", "surface": "imposed"},
],
"commission": [
    {"pos": "n.", "cn": "委员会；委托；佣金",
     "en": "An independent commission was set up to review the fares.",
     "zh": "成立了一个独立委员会来审查票价。", "surface": "commission"},
],
"constant": [
    {"pos": "adj.", "cn": "持续不断的，不变的",
     "en": "Residents complained of constant noise from the construction site.",
     "zh": "居民抱怨建筑工地持续不断的噪音。", "surface": "constant"},
],
"channel": [
    {"pos": "n.", "cn": "渠道，途径；频道；海峡",
     "en": "Social media have become the main channel for public complaints.",
     "zh": "社交媒体已成为公众投诉的主要渠道。", "surface": "channel"},
],
"classic": [
    {"pos": "adj.", "cn": "典型的，经典的",
     "en": "This is a classic example of poor urban planning.",
     "zh": "这是城市规划不当的一个典型例子。", "surface": "classic"},
],
"occupy": [
    {"pos": "v.", "cn": "占据，占用；居住",
     "en": "Offices occupy more than half the floor space in the tower.",
     "zh": "办公区占据了这座塔楼一半以上的楼面面积。", "surface": "occupy"},
],
"guarantee": [
    {"pos": "v.", "cn": "保证，担保",
     "en": "A good transport link does not guarantee that people will move there.",
     "zh": "良好的交通连接并不能保证人们会搬到那里。", "surface": "guarantee"},
],
"finance": [
    {"pos": "v.", "cn": "为…提供资金，资助",
     "en": "The new library was financed entirely by private donations.",
     "zh": "新图书馆完全由私人捐款资助建成。", "surface": "financed"},
],
"considerable": [
    {"pos": "adj.", "cn": "相当大的，可观的",
     "en": "Considerable progress has been made in cutting emissions.",
     "zh": "在减排方面已经取得了相当大的进展。", "surface": "Considerable"},
],
"chapter": [
    {"pos": "n.", "cn": "章，篇章",
     "en": "Chapter four examines the effect of the policy on rural areas.",
     "zh": "第四章考察该政策对农村地区的影响。", "surface": "Chapter"},
],
"scheme": [
    {"pos": "n.", "cn": "计划，方案",
     "en": "A bike-hire scheme was introduced in the city centre last year.",
     "zh": "市中心去年引入了自行车租赁计划。", "surface": "scheme"},
],
"export": [
    {"pos": "v.", "cn": "出口，输出",
     "en": "The region exports most of the vegetables it grows.",
     "zh": "该地区把种植的大部分蔬菜出口。", "surface": "exports"},
],
"transport": [
    {"pos": "n.", "cn": "交通，运输",
     "en": "Public transport is free for residents over sixty-five.",
     "zh": "六十五岁以上的居民可免费乘坐公共交通。", "surface": "transport"},
],
"perspective": [
    {"pos": "n.", "cn": "视角，观点；透视法",
     "en": "From a historical perspective, the change is remarkably recent.",
     "zh": "从历史角度看，这一变化发生得非常晚近。", "surface": "perspective"},
],
"participate": [
    {"pos": "v.", "cn": "参加，参与",
     "en": "Only a third of eligible residents participated in the scheme.",
     "zh": "只有三分之一的符合条件的居民参加了该计划。", "surface": "participated"},
],
"corporate": [
    {"pos": "adj.", "cn": "公司的，企业的",
     "en": "Corporate sponsors paid for half of the new sports centre.",
     "zh": "企业赞助商支付了新体育中心一半的费用。", "surface": "Corporate"},
],
"prime": [
    {"pos": "adj.", "cn": "主要的，首要的；最好的",
     "en": "Safety was the prime consideration in the design.",
     "zh": "安全是设计中的首要考虑因素。", "surface": "prime"},
],
"revenue": [
    {"pos": "n.", "cn": "收入，税收",
     "en": "Parking charges now provide a tenth of the council's revenue.",
     "zh": "停车费目前占市政委员会收入的十分之一。", "surface": "revenue"},
],
"notion": [
    {"pos": "n.", "cn": "概念，观念；想法",
     "en": "The notion that cycling is dangerous is hard to overturn.",
     "zh": "骑自行车很危险这一观念很难改变。", "surface": "notion"},
],
"outcome": [
    {"pos": "n.", "cn": "结果，成果",
     "en": "The outcome of the trial disappointed both sides.",
     "zh": "试验的结果令双方都感到失望。", "surface": "outcome"},
],
"component": [
    {"pos": "n.", "cn": "组成部分，成分",
     "en": "Housing costs are the largest component of household spending.",
     "zh": "住房支出是家庭开支中最大的组成部分。", "surface": "component"},
],
"eliminate": [
    {"pos": "v.", "cn": "消除，排除；淘汰",
     "en": "The new filter eliminates almost all of the harmful particles.",
     "zh": "新过滤器几乎消除了所有有害颗粒。", "surface": "eliminates"},
],
"regime": [
    {"pos": "n.", "cn": "制度，体制；政权",
     "en": "The tax regime favours owners of larger properties.",
     "zh": "税收制度有利于拥有较大房产的人。", "surface": "regime"},
],
"cite": [
    {"pos": "v.", "cn": "引用，引证；举例",
     "en": "Several authors cite the same 1998 study on school size.",
     "zh": "几位作者引用了同一项1998年关于学校规模的研究。", "surface": "cite"},
],
"welfare": [
    {"pos": "n.", "cn": "福利，福祉",
     "en": "The scheme was judged on its effect on child welfare.",
     "zh": "该方案是依据其对儿童福利的影响来评判的。", "surface": "welfare"},
],
"visual": [
    {"pos": "adj.", "cn": "视觉的，看得见的",
     "en": "Visual evidence of the damage convinced even the critics.",
     "zh": "破坏的视觉证据甚至说服了批评者。", "surface": "Visual"},
],
"perceive": [
    {"pos": "v.", "cn": "感知，认为，察觉",
     "en": "Cycling is perceived as risky even where accident rates are low.",
     "zh": "即使在事故率很低的地方，骑自行车也被认为有风险。", "surface": "perceived"},
],
"portion": [
    {"pos": "n.", "cn": "一部分，一份",
     "en": "A large portion of the budget goes on maintenance alone.",
     "zh": "预算的很大一部分仅用于维护。", "surface": "portion"},
],
"consist": [
    {"pos": "v.", "cn": "由…组成；在于",
     "en": "The sample consisted of two thousand households in five cities.",
     "zh": "样本由五个城市的两千户家庭组成。", "surface": "consisted"},
],
"implement": [
    {"pos": "v.", "cn": "实施，执行",
     "en": "The policy was implemented in three pilot areas first.",
     "zh": "该政策首先在三个试点地区实施。", "surface": "implemented"},
],
"intense": [
    {"pos": "adj.", "cn": "强烈的，剧烈的；紧张的",
     "en": "Intense rainfall now causes flooding several times a year.",
     "zh": "强降雨如今每年造成数次内涝。", "surface": "Intense"},
],
"enhance": [
    {"pos": "v.", "cn": "提高，增强",
     "en": "Tree planting enhances both air quality and street appeal.",
     "zh": "植树既能改善空气质量，也能提升街道吸引力。", "surface": "enhances"},
],
"evaluate": [
    {"pos": "v.", "cn": "评估，评价",
     "en": "Each project is evaluated two years after it opens.",
     "zh": "每个项目在启用两年后接受评估。", "surface": "evaluated"},
],
"phenomenon": [
    {"pos": "n.", "cn": "现象",
     "en": "Urban heat islands are a well-documented phenomenon.",
     "zh": "城市热岛是一种有充分记录的现象。", "surface": "phenomenon"},
],
"incorporate": [
    {"pos": "v.", "cn": "包含，纳入；合并",
     "en": "The new rules incorporate lessons from earlier failures.",
     "zh": "新规定纳入了以往失败的教训。", "surface": "incorporate"},
],
"assign": [
    {"pos": "v.", "cn": "分配，指派；赋值",
     "en": "Each interviewer was assigned a different district.",
     "zh": "每位采访者被指派到不同的区域。", "surface": "assigned"},
],
"advocate": [
    {"pos": "v.", "cn": "主张，提倡",
     "en": "Many planners advocate lower speed limits in residential areas.",
     "zh": "许多规划者主张在居民区降低限速。", "surface": "advocate"},
],
"mechanism": [
    {"pos": "n.", "cn": "机制，机理；机构",
     "en": "The subsidy is the main mechanism for encouraging insulation.",
     "zh": "补贴是鼓励做隔热的主要机制。", "surface": "mechanism"},
],
"detect": [
    {"pos": "v.", "cn": "发现，察觉；探测",
     "en": "Sensors can detect leaks long before they become visible.",
     "zh": "传感器能在漏水变得可见之前很久就探测到。", "surface": "detect"},
],
"mode": [
    {"pos": "n.", "cn": "方式，模式",
     "en": "Walking remains the most common mode of transport for short trips.",
     "zh": "步行仍是短途出行最常见的交通方式。", "surface": "mode"},
],
"mutual": [
    {"pos": "adj.", "cn": "相互的，共同的",
     "en": "The two councils reached a mutual agreement on waste collection.",
     "zh": "两个市政委员会就垃圾收集达成了共同协议。", "surface": "mutual"},
],
"diverse": [
    {"pos": "adj.", "cn": "多样的，不同的",
     "en": "The borough has a highly diverse population.",
     "zh": "这个区的人口构成非常多元。", "surface": "diverse"},
],

# ===================== 241 - 300 =====================
"insight": [
    {"pos": "n.", "cn": "洞察力，见解",
     "en": "Interviews gave the researchers insight into why people drive short distances.",
     "zh": "访谈让研究人员了解到人们为何要开车跑短途。", "surface": "insight"},
],
"controversy": [
    {"pos": "n.", "cn": "争议，争论",
     "en": "The closure of the swimming pool caused considerable controversy.",
     "zh": "游泳馆的关闭引起了相当大的争议。", "surface": "controversy"},
],
"constitute": [
    {"pos": "v.", "cn": "构成，组成",
     "en": "Flats constitute more than half of all new homes in the city.",
     "zh": "公寓占该市所有新建住宅的一半以上。", "surface": "constitute"},
],
"violate": [
    {"pos": "v.", "cn": "违反，违背",
     "en": "Any building that violates the standard will be refused permission.",
     "zh": "任何违反该标准的建筑都将被拒绝批准。", "surface": "violates"},
],
"segment": [
    {"pos": "n.", "cn": "部分，段；细分市场",
     "en": "The report examines one segment of the housing market in detail.",
     "zh": "该报告详细考察了住房市场的一个细分部分。", "surface": "segment"},
],
"ongoing": [
    {"pos": "adj.", "cn": "持续进行的，不间断的",
     "en": "The repair work is ongoing and will finish next spring.",
     "zh": "维修工作仍在进行中，将于明年春天完工。", "surface": "ongoing"},
],
"sustain": [
    {"pos": "v.", "cn": "维持，支撑；承受",
     "en": "The city cannot sustain such rapid growth without more investment.",
     "zh": "没有更多投资，这座城市无法维持如此快速的增长。", "surface": "sustain"},
],
"definite": [
    {"pos": "adj.", "cn": "明确的，确定的",
     "en": "There is no definite answer to the question of school size.",
     "zh": "关于学校规模的问题没有明确答案。", "surface": "definite"},
],
"guideline": [
    {"pos": "n.", "cn": "指导方针，准则",
     "en": "New guidelines require every new flat to have a balcony.",
     "zh": "新准则要求每套新公寓都配有一个阳台。", "surface": "guidelines"},
],
"ratio": [
    {"pos": "n.", "cn": "比率，比例",
     "en": "The ratio of pupils to teachers rose steadily after 2010.",
     "zh": "学生与教师的比例在2010年后稳步上升。", "surface": "ratio"},
],
"undergo": [
    {"pos": "v.", "cn": "经历，经受",
     "en": "The town has undergone dramatic change since the bypass opened.",
     "zh": "自绕城公路开通以来，这座小镇经历了巨大变化。", "surface": "undergone"},
],
"sequence": [
    {"pos": "n.", "cn": "顺序，序列；一连串",
     "en": "The diagram shows the sequence of events during a flood.",
     "zh": "该图显示了洪水发生期间事件发生的顺序。", "surface": "sequence"},
],
"submit": [
    {"pos": "v.", "cn": "提交，呈递；服从",
     "en": "Residents were invited to submit comments before the deadline.",
     "zh": "居民被邀请在截止日期前提交意见。", "surface": "submit"},
],
"distinct": [
    {"pos": "adj.", "cn": "明显不同的，清晰的",
     "en": "The two neighbourhoods have quite distinct characters.",
     "zh": "这两个街区有着截然不同的风貌。", "surface": "distinct"},
],
"subsequent": [
    {"pos": "adj.", "cn": "随后的，后来的",
     "en": "Subsequent studies reached very different conclusions.",
     "zh": "后来的研究得出了很不一样的结论。", "surface": "Subsequent"},
],
"exceed": [
    {"pos": "v.", "cn": "超过，超出",
     "en": "Noise levels near the airport exceed the legal limit at night.",
     "zh": "机场附近的夜间噪音水平超出了法定限值。", "surface": "exceed"},
],
"margin": [
    {"pos": "n.", "cn": "边缘；差额；页边空白",
     "en": "The proposal was approved by a narrow margin of two votes.",
     "zh": "该提案以两票的微弱优势获得通过。", "surface": "margin"},
],
"reinforce": [
    {"pos": "v.", "cn": "加强，强化；加固",
     "en": "The findings reinforce the case for investing in bus lanes.",
     "zh": "这些发现进一步支持了投资公交专用道的理由。", "surface": "reinforce"},
],
"attribute": [
    {"pos": "v.", "cn": "把…归因于",
     "en": "Officials attribute the improvement to the new cycle network.",
     "zh": "官员把这一改善归因于新的自行车道网络。", "surface": "attribute"},
    {"pos": "n.", "cn": "属性，特征",
     "en": "Price is not the only attribute buyers consider.",
     "zh": "价格并非购房者考虑的唯一属性。", "surface": "attribute"},
],
"hypothesis": [
    {"pos": "n.", "cn": "假设，假说",
     "en": "The hypothesis was tested against data from nine countries.",
     "zh": "该假设用来自九个国家的数据进行了检验。", "surface": "hypothesis"},
],
"regulate": [
    {"pos": "v.", "cn": "监管，管理；调节",
     "en": "A single agency should regulate both rail and bus services.",
     "zh": "应由一个机构统一监管铁路和公交服务。", "surface": "regulate"},
],
"norm": [
    {"pos": "n.", "cn": "规范，标准，常态",
     "en": "Working from home has become the norm in many offices.",
     "zh": "居家办公已成为许多办公室的常态。", "surface": "norm"},
],
"resign": [
    {"pos": "v.", "cn": "辞职，放弃",
     "en": "Two board members resigned after the report was published.",
     "zh": "报告发表后，两名董事会成员辞职了。", "surface": "resigned"},
],
"compound": [
    {"pos": "n.", "cn": "化合物，复合物；大院",
     "en": "The plant releases a compound that irritates the eyes.",
     "zh": "该工厂排放一种刺激眼睛的化合物。", "surface": "compound"},
    {"pos": "v.", "cn": "使加重，使恶化",
     "en": "Poor insulation compounds the problem of fuel poverty.",
     "zh": "隔热不良加剧了燃料贫困的问题。", "surface": "compounds"},
],
"integrate": [
    {"pos": "v.", "cn": "整合，使结合",
     "en": "Bus and train tickets should be fully integrated.",
     "zh": "公交票和火车票应当完全整合。", "surface": "integrated"},
],
"integrity": [
    {"pos": "n.", "cn": "正直，诚信；完整性",
     "en": "The integrity of the data depends on how it was collected.",
     "zh": "数据的完整性取决于其采集方式。", "surface": "integrity"},
],
"reliable": [
    {"pos": "adj.", "cn": "可靠的，可信赖的",
     "en": "Reliable figures on homelessness are surprisingly hard to obtain.",
     "zh": "关于无家可归者的可靠数据出人意料地难以获得。", "surface": "Reliable"},
],
"initiate": [
    {"pos": "v.", "cn": "发起，开始",
     "en": "The council initiated the review after several serious accidents.",
     "zh": "市政委员会在发生数起严重事故后启动了审查。", "surface": "initiated"},
],
"random": [
    {"pos": "adj.", "cn": "随机的，任意的",
     "en": "Households were selected at random from the electoral register.",
     "zh": "从选民名册中随机抽取住户。", "surface": "random"},
],
"domain": [
    {"pos": "n.", "cn": "领域，范围",
     "en": "Housing policy remains outside the domain of the transport ministry.",
     "zh": "住房政策仍然不在交通部的管辖领域之内。", "surface": "domain"},
],
"ideology": [
    {"pos": "n.", "cn": "意识形态，思想体系",
     "en": "The two parties are separated more by ideology than by evidence.",
     "zh": "两党的分歧更多源于意识形态，而非证据。", "surface": "ideology"},
],
"trigger": [
    {"pos": "v.", "cn": "引发，触发",
     "en": "A single heavy storm can trigger landslides on the steep slopes.",
     "zh": "一场暴雨就可能在陡坡上引发山体滑坡。", "surface": "trigger"},
],
"virtual": [
    {"pos": "adj.", "cn": "虚拟的；实质上的",
     "en": "Virtual meetings have replaced many business trips.",
     "zh": "虚拟会议已经取代了许多商务出差。", "surface": "Virtual"},
],
"modify": [
    {"pos": "v.", "cn": "修改，调整",
     "en": "The design was modified after consultation with residents.",
     "zh": "在与居民磋商后，设计方案做了修改。", "surface": "modified"},
],
"accommodate": [
    {"pos": "v.", "cn": "容纳，接纳；适应",
     "en": "The new school was built to accommodate nine hundred pupils.",
     "zh": "这所新学校的建设可容纳九百名学生。", "surface": "accommodate"},
],
"format": [
    {"pos": "n.", "cn": "格式，形式；版式",
     "en": "The test keeps the same format from one year to the next.",
     "zh": "该考试历年保持相同的形式。", "surface": "format"},
],
"spectrum": [
    {"pos": "n.", "cn": "范围，系列；光谱",
     "en": "The survey covered a broad spectrum of household types.",
     "zh": "该调查涵盖了范围广泛的家庭类型。", "surface": "spectrum"},
],
"bias": [
    {"pos": "n.", "cn": "偏见，偏向；偏差",
     "en": "The sample has a clear bias towards owner-occupiers.",
     "zh": "该样本明显偏向自有住房者。", "surface": "bias"},
],
"diminish": [
    {"pos": "v.", "cn": "减少，减弱",
     "en": "The advantage of living near the station diminishes as fares rise.",
     "zh": "随着票价上涨，住在车站附近的优势会减弱。", "surface": "diminishes"},
],
"isolate": [
    {"pos": "v.", "cn": "隔离，孤立；分离出",
     "en": "New estates on the edge of town isolate residents without cars.",
     "zh": "城镇边缘的新住宅区使没有汽车的居民与外界隔绝。", "surface": "isolate"},
],
"prohibit": [
    {"pos": "v.", "cn": "禁止，阻止",
     "en": "Several European cities prohibit cars in their historic centres.",
     "zh": "几个欧洲城市禁止汽车进入其历史中心区。", "surface": "prohibit"},
],
"abstract": [
    {"pos": "adj.", "cn": "抽象的，理论上的",
     "en": "The idea of a fifteen-minute city is no longer abstract.",
     "zh": "十五分钟城市的概念已不再抽象。", "surface": "abstract"},
],
"undertake": [
    {"pos": "v.", "cn": "承担，着手进行",
     "en": "No authority has undertaken a survey on this scale before.",
     "zh": "此前没有任何机构进行过如此规模的调查。", "surface": "undertaken"},
],
"conceive": [
    {"pos": "v.", "cn": "构想，设想；怀孕",
     "en": "The scheme was conceived as a temporary measure in 2008.",
     "zh": "该方案在2008年被构想为一项临时措施。", "surface": "conceived"},
],
"flexible": [
    {"pos": "adj.", "cn": "灵活的，可变通的",
     "en": "Flexible working hours reduce congestion on the morning trains.",
     "zh": "弹性工作时间可以缓解早班列车的拥挤。", "surface": "Flexible"},
],
"manipulate": [
    {"pos": "v.", "cn": "操纵，控制；处理",
     "en": "Critics argued that the statistics had been manipulated.",
     "zh": "批评者认为这些统计数字被人为操纵过。", "surface": "manipulated"},
],
"subsidy": [
    {"pos": "n.", "cn": "补贴，补助金",
     "en": "Removing the subsidy would double the cost of a bus ticket.",
     "zh": "取消补贴会让公交票价翻倍。", "surface": "subsidy"},
],
"edit": [
    {"pos": "v.", "cn": "编辑，校订",
     "en": "Two editors edited the report before it was printed.",
     "zh": "两名编辑在报告付印前对其进行了校订。", "surface": "edited"},
],
"minimal": [
    {"pos": "adj.", "cn": "最小的，极少的",
     "en": "The scheme requires minimal maintenance once installed.",
     "zh": "该装置一旦安装完成，几乎不需要维护。", "surface": "minimal"},
],
"interact": [
    {"pos": "v.", "cn": "互动，相互作用",
     "en": "Children who interact with green space daily are calmer in class.",
     "zh": "每天接触绿色空间的儿童在课堂上更安静。", "surface": "interact"},
],
"persist": [
    {"pos": "v.", "cn": "持续存在，坚持",
     "en": "The gap between the two districts persists despite new investment.",
     "zh": "尽管有新的投资，两个区之间的差距依然存在。", "surface": "persists"},
],
"exploit": [
    {"pos": "v.", "cn": "利用，开发；剥削",
     "en": "Developers exploited a gap in the planning rules.",
     "zh": "开发商利用了规划法规中的一个漏洞。", "surface": "exploited"},
],
"comprise": [
    {"pos": "v.", "cn": "包含，由…组成",
     "en": "The report comprises three sections and a short appendix.",
     "zh": "该报告由三个部分和一个简短的附录组成。", "surface": "comprises"},
],
"preliminary": [
    {"pos": "adj.", "cn": "初步的，预备的",
     "en": "Preliminary results suggest the scheme has worked.",
     "zh": "初步结果表明该方案奏效了。", "surface": "Preliminary"},
],
"rational": [
    {"pos": "adj.", "cn": "理性的，合理的",
     "en": "Choosing to live near work is a rational response to high fares.",
     "zh": "选择住在工作地点附近是对高票价的理性回应。", "surface": "rational"},
],
"protocol": [
    {"pos": "n.", "cn": "协议，规程；礼仪",
     "en": "The two agencies signed a protocol on sharing traffic data.",
     "zh": "两个机构签署了关于共享交通数据的协议。", "surface": "protocol"},
],
"sphere": [
    {"pos": "n.", "cn": "领域，范围；球体",
     "en": "Transport has traditionally been a male sphere of employment.",
     "zh": "交通运输传统上一直是男性主导的就业领域。", "surface": "sphere"},
],
"sole": [
    {"pos": "adj.", "cn": "唯一的，仅有的",
     "en": "The bus is the sole public transport link to the village.",
     "zh": "公共汽车是通往该村唯一的公共交通线路。", "surface": "sole"},
],
"partial": [
    {"pos": "adj.", "cn": "部分的，不完全的；偏袒的",
     "en": "The data give only a partial picture of commuting habits.",
     "zh": "这些数据只能部分反映通勤习惯。", "surface": "partial"},
],
"premise": [
    {"pos": "n.", "cn": "前提，假定",
     "en": "The whole argument rests on a premise few people accept.",
     "zh": "整个论证建立在一个很少有人接受的前提之上。", "surface": "premise"},
],

# ===================== END =====================
}
