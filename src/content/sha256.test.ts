import { describe, expect, it } from 'vitest';
import { bytesToHex, sha256Bytes } from './sha256';
import { sha256Hex } from './packVerifier';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

const NIST_VECTORS: Array<[string, string, string]> = [
  ['空串', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  // 56 字节：跨两个分块的填充边界
  ['两块消息', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  // 1000 个 a：多块输入
  ['千字 a', 'a'.repeat(1000), '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'],
];

describe('纯 JS SHA-256（非安全上下文降级）', () => {
  it.each(NIST_VECTORS)('NIST 向量：%s', (_name, input, expected) => {
    expect(bytesToHex(sha256Bytes(utf8(input)))).toBe(expected);
  });

  it('0..255 全字节序列：与 WebCrypto 交叉验证一致', async () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    const js = bytesToHex(sha256Bytes(bytes));
    const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
    const web = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(js).toBe(web);
  });

  it('sha256Hex：两条实现路径输出一致（subtle 与降级路径均可校验数据包）', async () => {
    const bytes = utf8('数据包 chunk 内容 fixture-payload-2026');
    const viaHex = await sha256Hex(bytes);
    const viaJs = bytesToHex(sha256Bytes(bytes));
    expect(viaHex).toBe(viaJs);
    expect(viaHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256Hex：接受 ArrayBuffer 输入', async () => {
    const bytes = utf8('arraybuffer');
    const fromView = await sha256Hex(bytes);
    const fromBuffer = await sha256Hex(bytes.slice().buffer);
    expect(fromView).toBe(fromBuffer);
  });
});
