#!/usr/bin/env python3
"""数据包版本号：唯一来源是 manifest.json，编排层决定一次，各步骤只负责写入。

背景：四个 ETL 脚本原本各带一份版本常量（build 1.4.0 / families 1.5.0 /
sentences 1.3.0 / synonyms 1.6.0），谁最后跑谁说了算。单独补一次例句就会把
v1.6.0 的包静默降回 1.3.0——manifest 与所有 chunk 一起改，校验器也不会报错，
客户端还以为有新版本。

用法（脚本内）：
    from pack_version import resolve_version
    version = resolve_version(out_dir, args.version, args.bump)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
PARTS = ("major", "minor", "patch")


def read_version(pack_dir: Path) -> str:
    """读已发布数据包的版本；没有 manifest 或格式非法时返回空串。"""
    manifest = Path(pack_dir) / "manifest.json"
    if not manifest.exists():
        return ""
    try:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return ""
    version = str(payload.get("version") or "")
    return version if SEMVER.match(version) else ""


def bump(version: str, part: str) -> str:
    matched = SEMVER.match(version or "")
    if matched is None:
        raise SystemExit(f"版本号不是 x.y.z：{version!r}")
    if part not in PARTS:
        raise SystemExit(f"未知的版本位：{part!r}（可选 {'/'.join(PARTS)}）")
    major, minor, patch = (int(x) for x in matched.groups())
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def resolve_version(pack_dir: Path, explicit: str | None = None, part: str | None = None, fallback: str = "1.0.0") -> str:
    """决定本次要写入的版本：显式 > 递增 > 沿用现有 > 兜底。"""
    if explicit and part:
        raise SystemExit("--version 与 --bump 只能二选一")
    current = read_version(pack_dir) or fallback
    if explicit:
        if not SEMVER.match(explicit):
            raise SystemExit(f"--version 需要 x.y.z 形式，得到 {explicit!r}")
        return explicit
    if part:
        return bump(current, part)
    return current


def add_version_args(parser) -> None:
    """给 ETL 脚本挂统一的版本参数。"""
    parser.add_argument("--version", default=None, help="写入的数据包版本（x.y.z）；缺省沿用 manifest 现有版本")
    parser.add_argument("--bump", default=None, choices=PARTS, help="在现有版本上递增（major/minor/patch）")
