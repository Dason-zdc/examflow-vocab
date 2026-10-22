import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertChunkShape, assertManifestShape, sha256Hex } from './packVerifier';
import type { PackChunk } from './packVerifier';

/**
 * 真实数据包（public/packs/IELTS）的加载期校验 —— 不是夹具，是线上要加载的那份数据。
 *
 * 存在理由：曾经出现过 manifest 升到 1.5.0、但各 chunk 内部 version 仍停在 1.4.0 的情况，
 * assertChunkShape 会在加载期直接抛 PackFormatError，而夹具测试完全测不出来。
 * 这里同时守住三件事：manifest 形状、chunk.version 与 manifest.version 一致、sha256 一致。
 */
const PACK_DIR = join(process.cwd(), 'public', 'packs', 'IELTS');

describe('真实数据包 · 加载期校验', () => {
  const manifest = assertManifestShape(
    JSON.parse(readFileSync(join(PACK_DIR, 'manifest.json'), 'utf8')),
  );

  it('每个分块都能通过运行期形状校验（chunk.version 必须与 manifest.version 一致）', () => {
    for (const entry of manifest.chunks) {
      const raw = readFileSync(join(PACK_DIR, entry.file));
      const payload = JSON.parse(raw.toString('utf8')) as PackChunk;
      expect(payload.version, `${entry.file} 的 version 与 manifest 不一致`).toBe(manifest.version);
      expect(() => assertChunkShape(payload, {
        exam: manifest.exam,
        version: manifest.version,
        chunk: entry.n,
      })).not.toThrow();
    }
  });

  it('每个分块的 sha256 与 bytes 与 manifest 一致', async () => {
    for (const entry of manifest.chunks) {
      const raw = readFileSync(join(PACK_DIR, entry.file));
      expect(entry.bytes).toBe(raw.byteLength);
      const digest = await sha256Hex(new Uint8Array(raw));
      expect(digest, `${entry.file} 的 sha256 与 manifest 不一致（改了数据没重算？）`).toBe(entry.sha256);
    }
  });

  it('manifest 声明的词数与各分块实际词数合计一致', () => {
    let total = 0;
    for (const entry of manifest.chunks) {
      const payload = JSON.parse(readFileSync(join(PACK_DIR, entry.file), 'utf8')) as PackChunk;
      total += payload.words.length;
    }
    expect(total).toBe(manifest.wordCount);
  });
});
