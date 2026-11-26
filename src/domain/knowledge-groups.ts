// Families browse by these broad topics. Keep the original points for explanations and practice.
type Rule = readonly [name: string, matches: RegExp];
const rules: Record<string, Rule[]> = {
  数学: [
    ["数量关系与应用", /应用题|解决问题|数量关系|和倍|差倍|行程|单价|总价|工程问题/],
    ["数与分数", /分数|分母|分子|约分|通分|几分之|数位|数的认识|数的大小|比较大小|互化/],
    ["四则运算与运算律", /运算|[加减乘除]法|四则|简便|综合算式|括号|巧算|口算|笔算|计算顺序|末尾有0/],
    ["图形与测量", /图形|几何|角度|面积|体积|周长|对称|单位换算|长度|平行|垂直/],
    ["统计与概率", /统计|概率|平均数|可能性/],
    ["规律与代数", /找规律|数列|方程|用字母|等量关系/],
  ],
  语文: [
    ["识字与书写", /字形|形近字|偏旁|部首|生字|识字|写字|书写|错别字|拼音|字音|词语书写/],
    ["词语理解与运用", /词义|词语|成语|组词|近义|反义|量词/],
    ["句子与表达", /句式|造句|修辞|病句|标点|改写|扩句|缩句/],
    ["阅读理解", /阅读|理解文意|概括|主旨|细节|段意|人物形象/],
    ["习作与写作", /习作|作文|写作|描写/],
    ["积累与背诵", /背诵|古诗|名句|积累|诗词/],
  ],
  英语: [
    ["语音与听辨", /音标|发音|拼读|听力|听辨|重音/],
    ["阅读与表达", /阅读|细节理解|主旨|写作|作文|口语表达/],
    ["语法与句型", /语法|句型|句式|疑问|否定|时态|现在时|过去时|将来时|主谓|名词|动词|单复数|单词形式|比较级|介词|代词|冠词|形容词|副词|从句/],
    ["词汇与拼写", /拼写|词义|单词辨析|词汇|近义|反义/],
    ["短语与搭配", /短语|搭配|词组|惯用|^[a-z'-]+(?:\s+[a-z'-]+)+$/i],
    ["词汇与拼写", /单词|词性|[a-z]+.*(?:用法|辨析)|^[a-z][a-z'-]*$/i],
  ],
};

export function knowledgeGroups(subject: string, points: string[]): string[] {
  const subjectRules = rules[subject] ?? [];
  const groups = new Set<string>();
  for (const raw of points) {
    const value = raw.normalize("NFKC").trim();
    const group = subjectRules.find(([name]) => value === name)
      ?? subjectRules.find(([, pattern]) => pattern.test(value));
    if (group) groups.add(group[0]);
  }
  return groups.size ? [...groups] : ["待分类"];
}
