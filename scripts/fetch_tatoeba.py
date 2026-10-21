# -*- coding: utf-8 -*-
"""下载 Tatoeba 英中句对语料（只用于构建期，不进入运行时产物）。"""
import bz2
import os
import urllib.request

CACHE = os.path.join(os.path.dirname(__file__), ".cache", "tatoeba")
BASE = "https://downloads.tatoeba.org/exports/per_language/"
FILES = [
    ("cmn/cmn-eng_links.tsv.bz2", "cmn-eng_links.tsv.bz2"),
    ("cmn/cmn_sentences_detailed.tsv.bz2", "cmn_sentences_detailed.tsv.bz2"),
    ("eng/eng_sentences.tsv.bz2", "eng_sentences.tsv.bz2"),
]


def main():
    os.makedirs(CACHE, exist_ok=True)
    for rel, name in FILES:
        out = os.path.join(CACHE, name)
        if os.path.exists(out) and os.path.getsize(out) > 0:
            print("cached", name, os.path.getsize(out))
            continue
        url = BASE + rel
        print("downloading", url)
        req = urllib.request.Request(url, headers={"User-Agent": "examflow-vocab-build/1.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(out + ".part", "wb") as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
        os.replace(out + ".part", out)
        print("done", name, os.path.getsize(out))

    # 校验 bz2 可解压（读前 1KB）
    for _, name in FILES:
        with bz2.open(os.path.join(CACHE, name), "rb") as f:
            f.read(1024)
    print("corpus ready")


if __name__ == "__main__":
    main()
