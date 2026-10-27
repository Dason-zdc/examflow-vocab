import type { ExamCode } from '../domain/types';
import type { PackWord } from './packVerifier';

/**
 * 词典查询（P1 范围内的最小闭环）：
 * - 词形还原：surface → lemma（lemma-map，6631 条覆盖常见变形）；
 * - 查词：按 lemma 精确取；搜索：lemma 前缀优先，中文释义包含其次；
 * - 不做激进的推测性词干提取——还原不了就如实说未收录，避免把
 *   "address" 的卡片错误地安到 "addressed" 的查询上（数据本身已覆盖大多数变形）。
 */
export class PackDictionary {
  private readonly byLemma: Map<string, PackWord>;
  private readonly byId: Map<string, PackWord>;

  constructor(
    private readonly words: readonly PackWord[],
    private readonly lemmaMap: Record<string, string>,
  ) {
    this.byLemma = new Map(words.map((w) => [w.lemma, w]));
    this.byId = new Map(words.map((w) => [w.id, w]));
  }

  get size(): number {
    return this.words.length;
  }

  /** 词形还原；无法还原返回 null */
  restoreLemma(surface: string): string | null {
    // 所有格撇号不是词形：council's → council、students' → students（例句分词会把 's 带在词上）
    const key = surface.trim().replace(/['’]s$/i, '').replace(/['’]$/, '');
    if (key.length === 0) return null;
    if (this.lemmaMap[key]) return this.lemmaMap[key];
    const lower = key.toLowerCase();
    if (this.lemmaMap[lower]) return this.lemmaMap[lower];
    return this.byLemma.has(lower) ? lower : null;
  }

  /**
   * 按 ID 或原形精确查找（不做词形还原）。
   * 卡片上的 wordId 存的是数据包 ID（w_xxx），历史调用方与夹具也可能传 lemma，
   * 因此先按 ID 查、回落 lemma——两者都是精确匹配，不存在歧义。
   */
  getWord(idOrLemma: string): PackWord | undefined {
    return this.byId.get(idOrLemma) ?? this.byLemma.get(idOrLemma);
  }

  /** 查词入口：先还原再精确匹配 */
  lookup(surface: string): PackWord | undefined {
    const lemma = this.restoreLemma(surface);
    return lemma ? this.byLemma.get(lemma) : undefined;
  }

  /**
   * 搜索：lemma 前缀命中排在最前，其后是中文释义包含。
   * query 为空时返回空（词库页有独立的浏览列表）。
   */
  search(query: string, limit = 20): PackWord[] {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    const prefix: PackWord[] = [];
    const contains: PackWord[] = [];
    for (const w of this.words) {
      if (w.lemma.toLowerCase().startsWith(q)) {
        prefix.push(w);
      } else if (w.senses.some((s) => s.cn.toLowerCase().includes(q))) {
        contains.push(w);
      }
      if (prefix.length >= limit) break;
    }
    return [...prefix, ...contains].slice(0, limit);
  }

  /** 合并自定义生词（点词即查加入），返回新词典实例；空数组直接返回自身 */
  withExtraWords(extra: readonly PackWord[]): PackDictionary {
    if (extra.length === 0) return this;
    return new PackDictionary([...this.words, ...extra], this.lemmaMap);
  }

  /** 词库页浏览：按 senseWeight 降序分页 */
  browse(offset: number, limit: number): PackWord[] {
    return [...this.words]
      .sort((a, b) => this.weightOf(b) - this.weightOf(a) || a.lemma.localeCompare(b.lemma))
      .slice(offset, offset + limit);
  }

  private weightOf(word: PackWord): number {
    let max = 0;
    for (const s of word.senses) {
      for (const stat of Object.values(s.examStats)) {
        if (stat && stat.senseWeight > max) max = stat.senseWeight;
      }
    }
    return max;
  }

  /** 该考试下可用于建卡的单词（有该考试统计、未废弃） */
  wordsForExam(exam: ExamCode): PackWord[] {
    return this.words.filter((w) => w.senses.some((s) => s.examStats[exam]));
  }
}
