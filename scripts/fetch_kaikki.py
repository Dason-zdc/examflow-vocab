#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_kaikki.py — 分段并发下载 Wiktionary 英语 dump（kaikki.org / Wiktextract）

单连接被限速到 ~90 KB/s，534 MB 要 1.5 小时；改成 8 段 Range 并发可到 1 MB/s 上下。
产物按字节序拼接后仍是合法 gzip（多 member），`gzip.open` 能直接逐行读。

数据许可：Wiktionary 内容为 CC BY-SA 3.0（kaikki.org 由其离线抽取）。
本缓存只进 scripts/.cache/（gitignore），不随数据包分发。

用法：
  python scripts/fetch_kaikki.py               # 8 段并发，断点续传
  python scripts/fetch_kaikki.py --chunks 16   # 更多并发（网络好时可试）
  python scripts/fetch_kaikki.py --check       # 只校验已有文件的大小与 gzip 头
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

URL = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz"
SCRIPT_DIR = Path(__file__).resolve().parent
CACHE = SCRIPT_DIR / ".cache"
TARGET = CACHE / "kaikki-en.jsonl.gz"
PARTS = CACHE / "kaikki.parts"


def remote_size() -> int:
    request = urllib.request.Request(URL, method="HEAD")
    with urllib.request.urlopen(request, timeout=30) as response:
        return int(response.headers["Content-Length"])


def fetch_range(index: int, start: int, end: int, total: int, attempts: int = 4) -> tuple[int, int]:
    """下单个分片。服务端会中途掐断（实测 44 MB 的片下到 17 MB 就 EOF），
    所以按「断点续传 + 重试」处理：已有字节数作为新的 start 继续要。"""
    part = PARTS / f"part-{index:02d}"
    expected = end - start + 1
    if part.exists() and part.stat().st_size == expected:
        return index, expected

    last_error: Exception | None = None
    for attempt in range(attempts):
        written = part.stat().st_size if part.exists() else 0
        if written >= expected:
            return index, expected
        request = urllib.request.Request(URL, headers={"Range": f"bytes={start + written}-{end}"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response, part.open("ab") as handle:
                while True:
                    block = response.read(1 << 16)
                    if not block:
                        break
                    handle.write(block)
                    written += len(block)
        except Exception as error:  # 断流 / 超时：保留已写字节，下一轮续传
            last_error = error
        if part.exists() and part.stat().st_size == expected:
            _ = total
            return index, expected
        time.sleep(1.5 * (attempt + 1))
    part.unlink(missing_ok=True)
    raise RuntimeError(f"分片 {index} 重试 {attempts} 次仍失败（{last_error}）")


def main() -> None:
    parser = argparse.ArgumentParser(description="分段下载 kaikki 英语 dump")
    parser.add_argument("--chunks", type=int, default=8)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    total = remote_size()
    print(f"远端大小：{total / 1024 / 1024:.1f} MB")

    if args.check:
        if not TARGET.exists():
            raise SystemExit("尚未下载")
        actual = TARGET.stat().st_size
        with TARGET.open("rb") as handle:
            magic = handle.read(2)
        print(f"本地大小：{actual / 1024 / 1024:.1f} MB，gzip 头：{magic.hex()}，一致：{actual == total}")
        return

    PARTS.mkdir(exist_ok=True)
    chunks = max(1, args.chunks)
    step = total // chunks
    jobs = []
    for i in range(chunks):
        start = i * step
        end = total - 1 if i == chunks - 1 else (i + 1) * step - 1
        jobs.append((i, start, end))

    started = time.time()
    done_bytes = 0
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=chunks) as pool:
        futures = [pool.submit(fetch_range, i, s, e, total) for i, s, e in jobs]
        for future in as_completed(futures):
            try:
                index, size = future.result()
            except Exception as error:
                failures.append(str(error))
                continue
            done_bytes += size
            elapsed = max(0.1, time.time() - started)
            print(
                f"  分片 {index + 1}/{chunks} 完成，累计 {done_bytes / 1024 / 1024:.1f} MB"
                f"，{done_bytes / 1024 / elapsed:.0f} KB/s",
                flush=True,
            )
    if failures:
        for message in failures:
            print(f"  失败：{message}", flush=True)
        raise SystemExit(f"{len(failures)} 个分片未完成，重跑本脚本会接着下（已完成的分片会跳过）")

    missing = [i for i, _, _ in jobs if not (PARTS / f"part-{i:02d}").exists()]
    if missing:
        raise SystemExit(f"分片缺失：{missing}")

    # 按序号合并：gzip 多 member 允许直接拼接
    with TARGET.open("wb") as out:
        for i, _, _ in jobs:
            out.write((PARTS / f"part-{i:02d}").read_bytes())
    size = TARGET.stat().st_size
    print(f"合并完成：{TARGET.relative_to(SCRIPT_DIR.parent)}（{size / 1024 / 1024:.1f} MB）")
    if size != total:
        raise SystemExit(f"大小不符：期望 {total}，实得 {size}")
    for i, _, _ in jobs:
        (PARTS / f"part-{i:02d}").unlink(missing_ok=True)
    PARTS.rmdir()
    _ = os


if __name__ == "__main__":
    sys.exit(main())
