#!/usr/bin/env node
/**
 * 词库增强：用 WordNet 同义集为 IELTS 数据包补 synonyms（PRD US-08 / S-02）。
 *
 * 口径与质量控制：
 * - 只取每个词性下前 2 个同义集（WordNet 按常用度排序），避免冷僻义项串入；
 * - 过滤多词短语、连字符、专有名词形态与词形变体；
 * - 词库内已有的词优先，其次按长度升序，每词最多 4 个；
 * - 词库内命中的近义词带中文释义，库外的只给英文（不编造翻译）。
 *
 * 依赖：devDependency `wordnet-db`（WordNet 3.1，WordNet License）。
 * 用法：node scripts/enrich_pack_synonyms.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACK_DIR = path.join(ROOT, 'public', 'packs', 'IELTS');
const DICT = path.join(ROOT, 'node_modules', 'wordnet-db', 'dict');
const DRY = process.argv.includes('--dry');
const MAX_SYNONYMS = 4;
const NEXT_VERSION = '1.2.0';

const POS_FILES = { n: ['index.noun', 'data.noun'], v: ['index.verb', 'data.verb'], a: ['index.adj', 'data.adj'], r: ['index.adv', 'data.adv'] };
const POS_LABEL = { n: 'n.', v: 'v.', a: 'adj.', r: 'adv.' };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const words = [];
for (const file of fs.readdirSync(PACK_DIR).filter((f) => f.startsWith('chunk-'))) {
  const chunk = readJson(path.join(PACK_DIR, file));
  words.push(...chunk.words);
}
const wanted = new Set(words.map((w) => w.lemma.toLowerCase()));

if (!fs.existsSync(DICT)) {
  console.error('缺少 wordnet-db，请先执行：npm i -D wordnet-db');
  process.exit(1);
}

// lemma -> [{ pos, offsets(前 2 个义项) }]
const lemmaIndex = new Map();
for (const pos of Object.keys(POS_FILES)) {
  const lines = fs.readFileSync(path.join(DICT, POS_FILES[pos][0]), 'utf8').split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('  ')) continue;
    const t = line.trim().split(/\s+/);
    const lemma = t[0].toLowerCase();
    if (!wanted.has(lemma)) continue;
    const pCnt = Number(t[3]);
    const offsets = t.slice(4 + pCnt + 2).filter((x) => /^\d+$/.test(x)).slice(0, 2);
    if (!lemmaIndex.has(lemma)) lemmaIndex.set(lemma, []);
    lemmaIndex.get(lemma).push({ pos, offsets });
  }
}

const needed = new Map();
for (const list of lemmaIndex.values()) for (const e of list) for (const off of e.offsets) needed.set(off, e.pos);

const synsets = new Map();
for (const pos of Object.keys(POS_FILES)) {
  const lines = fs.readFileSync(path.join(DICT, POS_FILES[pos][1]), 'utf8').split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('  ')) continue;
    const t = line.trim().split(/\s+/);
    const off = t[0];
    if (!needed.has(off)) continue;
    const wCnt = parseInt(t[3], 16);
    const members = [];
    for (let i = 0; i < wCnt; i += 1) {
      const w = t[4 + i * 2];
      if (w) members.push(w.replace(/_/g, ' '));
    }
    synsets.set(off, members);
  }
}

const cnByLemma = new Map();
for (const w of words) {
  const key = w.lemma.toLowerCase();
  if (!cnByLemma.has(key)) cnByLemma.set(key, w.senses?.[0]?.cn ?? '');
}

function isVariant(a, b) {
  return (
    a !== b &&
    (a === `${b}s` || a === `${b}es` || a === `${b}ed` || a === `${b}d` || a === `${b}ing` || a === `${b}ly` || a === `${b.replace(/e$/, '')}ing`)
  );
}

function synonymsFor(lemma) {
  const entry = lemmaIndex.get(lemma);
  if (!entry) return [];
  const out = [];
  for (const e of entry) {
    for (const off of e.offsets) {
      for (const cand of synsets.get(off) ?? []) {
        const key = cand.toLowerCase();
        if (key === lemma || key.includes(' ') || key.includes('-')) continue;
        if (key.length < 3 || key.length > 14 || !/^[a-z]+$/.test(key)) continue;
        if (isVariant(lemma, key) || isVariant(key, lemma)) continue;
        if (out.some((x) => x.lemma === key)) continue;
        out.push({ lemma: key, pos: POS_LABEL[e.pos], cn: cnByLemma.get(key) ?? '', inPack: wanted.has(key) });
      }
    }
  }
  out.sort((a, b) => Number(b.inPack) - Number(a.inPack) || a.lemma.length - b.lemma.length);
  return out.slice(0, MAX_SYNONYMS).map(({ lemma: l, pos, cn }) => ({ lemma: l, pos, cn }));
}

let filled = 0;
const manifest = readJson(path.join(PACK_DIR, 'manifest.json'));
for (const file of fs.readdirSync(PACK_DIR).filter((f) => f.startsWith('chunk-'))) {
  const full = path.join(PACK_DIR, file);
  const chunk = readJson(full);
  chunk.version = NEXT_VERSION;
  for (const word of chunk.words) {
    if (!Array.isArray(word.synonyms)) word.synonyms = [];
    if (word.synonyms.length > 0) continue;
    const syn = synonymsFor(word.lemma.toLowerCase());
    if (syn.length > 0) {
      word.synonyms = syn;
      filled += 1;
    }
  }
  if (!DRY) {
    const buf = Buffer.from(JSON.stringify(chunk));
    fs.writeFileSync(full, buf);
    const entry = manifest.chunks.find((c) => c.file === file);
    if (entry) {
      entry.sha256 = sha256(buf);
      entry.bytes = buf.length;
    }
  }
}

if (!DRY) {
  manifest.version = NEXT_VERSION;
  manifest.generatedAt = new Date().toISOString();
  manifest.synonymsNote =
    '近义词由 WordNet 同义集自动匹配（每词最多 4 个，优先词库内常见词），可能存在义项不完全对应，仅作替换参考。';
  fs.writeFileSync(path.join(PACK_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`synonyms filled: ${filled}/${words.length}${DRY ? ' (dry run)' : ''}`);
