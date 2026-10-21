# 后端 API 与同步协议

> 实现：`server/`（Node 内置 `node:http` + `node:sqlite`，零第三方依赖）
> 默认端口 `8787`；开发态由 Vite 把 `/api` 反代到后端（见 `vite.config.ts`），生产态由后端同进程托管 `dist/`。

---

## 1. 运行方式

| 命令 | 说明 |
| :-- | :-- |
| `npm run dev:full` | 同时起前端（5173）与后端（8787），`/api` 走代理 |
| `npm run dev:api` | 只起后端（`--watch` 热重启） |
| `npm run build && npm run serve` | 生产构建并启动单端口服务（前端 + API 同源） |
| `npm run test:api` | 后端集成冒烟（自起服务 + 临时 SQLite 库） |

环境变量：

| 变量 | 默认值 | 说明 |
| :-- | :-- | :-- |
| `PORT` | `8787` | 监听端口 |
| `EXAMFLOW_DB` | `server/data/examflow.db` | SQLite 文件路径（自动建目录） |
| `EXAMFLOW_SECRET` | 内置开发密钥 | 令牌签名密钥，**生产必须覆盖** |

> `node:sqlite` 需要 Node >= 22.5；脚本已带 `--experimental-sqlite`，在 22 / 24 均可用。

---

## 2. 认证

| Method | Path | 说明 | 认证 |
| :-- | :-- | :-- | :-- |
| POST | `/api/v1/auth/register` | 注册，返回令牌 | 否 |
| POST | `/api/v1/auth/login` | 登录，返回令牌 | 否 |
| GET | `/api/v1/me` | 当前用户 | 是 |
| GET | `/api/v1/health` | 健康检查 | 否 |

- 用户名 `3-32` 位字母/数字/下划线，密码 `8-128` 位
- 口令用 `scrypt`（N=16384）加盐哈希存储
- 令牌为 HMAC-SHA256 签名的无状态 token，有效期 30 天，请求头 `Authorization: Bearer <token>`
- 错误统一返回 `{ "error": { "code": "...", "message": "..." } }`；常见状态码：400 / 401 / 409 / 413 / 429 / 500

---

## 3. 同步协议

设计目标：**离线优先**。本地 IndexedDB 始终是主副本，后端只做多设备汇聚；断网时照常学习，联网后双向对账。

### 3.1 端点

| Method | Path | 说明 |
| :-- | :-- | :-- |
| GET | `/api/v1/sync?cursor=<n>` | 增量拉取 `sync_seq > cursor` 的行（含墓碑） |
| POST | `/api/v1/sync` | 推送本地变更，返回最新游标 |

### 3.2 版本与冲突

- 每一行带客户端时钟版本 `v`（毫秒时间戳），**相同主键保留 `v` 更大者**（Last-Write-Wins）
- 服务端每行额外记录 `sync_seq`（全局单调），仅用于增量拉取游标
- 删除是**软删墓碑**（`deleted=1`），否则其它设备会把删掉的数据再拉回来
- 派生卡片（`updatedAt = 0`，可由词书重建的空卡）不参与推送，允许云端真实进度直接覆盖
- 重置进度 / 覆盖导入采用「墓碑 + 严格更大的重建版本」，保证破坏性操作能传播到其它设备
- 设置项在本地 `examDate` 为空（未初始化）时不推送，云端设置无条件接管——新设备加入不会被本地默认值覆盖
- AI 私教配置（Base URL / Key / 模型名）是本机凭证，**不参与同步**，服务端也没有对应列；合并云端设置时保留本机值

### 3.3 推送报文

```jsonc
{
  "changes": {
    "settings":      [{ "op": "upsert", "v": 1792551000000, "data": { "exam": "IELTS", "exam_date": "2026-12-20", "...": "..." } }],
    "cards":         [{ "op": "upsert", "v": 1792551000000, "data": { "id": "IELTS:s_1", "exam": "IELTS", "word_id": "w_address", "sense_id": "s_1", "kind": "PRIMARY", "fsrs": "{...}", "suspended": 0, "last_first_review_day": "2026-10-21" } }],
    "review_logs":   [{ "op": "upsert", "v": 1792551000000, "data": { "id": "IELTS:s_1#...", "card_id": "IELTS:s_1", "reviewed_at": 1792551000000, "...": "..." } }],
    "user_word_meta":[{ "op": "upsert", "v": 1792551000000, "data": { "word_id": "w_address", "starred": 1, "note": "" } }],
    "custom_words":  [{ "op": "upsert", "v": 1792551000000, "data": { "id": "c_1", "lemma": "serendipity", "...": "..." } }]
  }
}
```

字段为服务端列名（snake_case）；`fsrs` / `fsrs_before` 为 JSON 文本（`due`、`last_review` 为 ISO 字符串，客户端拉取时还原为 `Date`）。
删除用 `{ "op": "delete", "v": <时间戳>, "data": { "id": "<主键>" } }`。

### 3.4 拉取报文

```jsonc
{
  "ok": true,
  "cursor": 42,
  "changes": {
    "cards": [{ "id": "IELTS:s_1", "v": 1792551000000, "deleted": false, "exam": "IELTS", "fsrs": "{...}", "...": "..." }],
    "settings": [/* 单行 */], "review_logs": [], "user_word_meta": [], "custom_words": []
  }
}
```

### 3.5 一次同步的顺序

```
pull(cursor) → 逐行 LWW 合并 → 记录新 cursor
             → 组装本地增量（updatedAt > pushCursor + 墓碑）
             → push → 更新 cursor / pushCursor / lastSyncAt
```

客户端每 30 秒自动同步一次（仅登录后），`online` 事件触发补同步，设置面板可手动「立即同步」。
令牌失效（401）会自动退出登录，避免反复重试。

---

## 4. 数据库表

SQLite 文件默认 `server/data/examflow.db`（WAL 模式）。

| 表 | 主键 | 关键列 | 说明 |
| :-- | :-- | :-- | :-- |
| `users` | `id` | `username` 唯一、`pass_hash`、`pass_salt` | 账号 |
| `settings` | `user_id` | 全部计划字段、`updated_at`、`deleted`、`sync_seq` | 单行设置 |
| `cards` | `(user_id, id)` | `exam`、`word_id`、`sense_id`、`fsrs`(JSON)、`suspended`、`last_first_review_day` | 学习卡与 FSRS 状态 |
| `review_logs` | `(user_id, id)` | `card_id`、`reviewed_at`、`study_day`、`rating`、`fsrs_before`(JSON) | 复习流水 |
| `user_word_meta` | `(user_id, word_id)` | `starred`、`note`、`updated_at` | 收藏/笔记 |
| `custom_words` | `(user_id, id)` | `lemma`、`phonetic`、`cn` | 自定义词 |
| `packs` | `pack_id` | `version`、`word_count`、`sense_count` | 已发布数据包元数据（启动时从 `packs/*/manifest.json` 播种） |
| `sync_seq_counter` | `id=1` | `value` | 全局同步序号 |
| `pack_chunks` | — | — | 仅存在于客户端 IndexedDB（离线缓存） |

所有可同步表都带 `updated_at` / `deleted` / `sync_seq`，删除一律软删。

---

## 5. 数据包接口（只读）

| Method | Path | 说明 |
| :-- | :-- | :-- |
| GET | `/api/v1/packs` | 已发布数据包列表 |
| GET | `/api/v1/packs/:id` | 该包 `manifest.json` |

学习页仍通过静态路径 `/packs/<EXAM>/chunk-*.json` 加载词书（PWA 预缓存 + IndexedDB 缓存），生产由后端静态托管 `dist/`。

---

## 6. 安全与限制

- 口令 `scrypt` 加盐；令牌 HMAC 签名，`timingSafeEqual` 校验
- 请求体上限 8MB；单 IP 限流 200 次/分钟
- 参数与数据类型均在落库前收敛到白名单列，未知字段丢弃
- 当前为单机 SQLite，适合个人/小团队自建；多实例部署需换 Postgres 等共享存储
