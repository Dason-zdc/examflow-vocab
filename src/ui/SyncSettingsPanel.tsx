import { useState } from 'react';
import type { SyncController } from '../app/sync/useSync';
import { Badge, Button, Notice } from './primitives';
import { AlertCircle, CheckCircle2, ICON_SIZE, ICON_STROKE, Network } from './icons';

const INPUT_CLASS =
  'w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

function timeLabel(ts: number | null): string {
  if (!ts) return '尚未同步';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

/** 设置弹窗里的「云同步」区块：登录/注册、状态、手动同步、退出。 */
export function SyncSettingsPanel({ sync }: { sync: SyncController }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const loggedIn = Boolean(sync.state.token);
  const syncing = sync.phase === 'syncing';
  const canSubmit = username.trim().length >= 3 && password.length >= 8 && !syncing;

  const errorNotice = sync.error ? (
    <Notice tone="danger" icon={<AlertCircle size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />}>
      {sync.error}
    </Notice>
  ) : null;

  return (
    <section aria-labelledby="sync-title" className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h3 id="sync-title" className="flex items-center gap-2 text-sm font-emphasize text-fg">
          <Network size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
          云同步
        </h3>
        <Badge tone={!loggedIn ? 'neutral' : sync.state.lastStatus === 'error' ? 'danger' : 'success'}>
          {!loggedIn ? '未登录' : sync.state.lastStatus === 'error' ? '同步异常' : '已连接'}
        </Badge>
      </header>

      {loggedIn ? (
        <>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
            <div className="flex gap-1">
              <dt>账号</dt>
              <dd className="text-fg-2">{sync.state.username ?? '-'}</dd>
            </div>
            <div className="flex gap-1">
              <dt>上次同步</dt>
              <dd className="text-fg-2">{timeLabel(sync.state.lastSyncAt)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" loading={syncing} onClick={() => void sync.syncNow()}>
              立即同步
            </Button>
            <Button variant="ghost" onClick={() => void sync.logout()}>
              退出登录
            </Button>
            {!syncing && sync.phase === 'ok' ? (
              <span className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
                已同步
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-snug text-meta">
            本地数据是主副本，联网后自动双向同步；换设备登录同一账号即可恢复进度。
          </p>
          {errorNotice}
        </>
      ) : (
        <>
          <p className="text-xs leading-snug text-muted">
            登录后可把学习进度保存到自建服务器，多设备共用一份进度。不登录也能完整使用，数据只存在本机。
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-emphasize text-fg-2">用户名</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-emphasize text-fg-2">密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className={INPUT_CLASS}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!canSubmit} onClick={() => void sync.register(username.trim(), password)}>
              注册并开启同步
            </Button>
            <Button variant="secondary" disabled={!canSubmit} onClick={() => void sync.login(username.trim(), password)}>
              已有账号，登录
            </Button>
            {syncing ? <span className="self-center text-xs text-muted">正在同步…</span> : null}
          </div>
          <p className="text-xs text-meta">用户名 3-32 位字母/数字/下划线，密码至少 8 位。</p>
          {errorNotice}
        </>
      )}
    </section>
  );
}
