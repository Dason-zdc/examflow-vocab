import { useRef, useState } from 'react';
import type { Settings } from '../domain/types';
import { Button, Notice, Panel } from './primitives';
import { ICON_SIZE, ICON_STROKE, AlertTriangle, Download, ShieldAlert, ShieldCheck, Upload } from './icons';

/** 备份面板（UIUX P5）：导出 / 导入 / 持久化存储状态 */

export interface BackupPanelProps {
  settings: Settings;
  persisted: boolean | undefined;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
}

const SEVEN_DAYS_MS = 7 * 86_400_000;

export function BackupPanel({ settings, persisted, onExport, onImport }: BackupPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const last = settings.lastBackupAt;
  const stale = last === null || Date.now() - last > SEVEN_DAYS_MS;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="备份与恢复" caption={last === null ? '从未备份' : `上次备份 ${new Date(last).toLocaleDateString('zh-CN')}`}>
      <div className="flex flex-col gap-3">
        {stale ? (
          <Notice tone="warn" icon={<AlertTriangle size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="mt-0.5 shrink-0" />}>
            超过 7 天未备份。本地数据可能因浏览器清理而丢失，建议现在导出。
          </Notice>
        ) : null}

        <div className="flex gap-2">
          <Button variant="primary" loading={busy} onClick={() => run(onExport)}>
            <Download size={ICON_SIZE.button} strokeWidth={ICON_STROKE} aria-hidden />
            导出备份
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={ICON_SIZE.button} strokeWidth={ICON_STROKE} aria-hidden />
            导入备份
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="选择备份文件"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run(() => onImport(file));
          }}
        />

        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          {persisted ? (
            <>
              <ShieldCheck size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="text-success" />
              已获得持久化存储，浏览器清理时数据保留。
            </>
          ) : (
            <>
              <ShieldAlert size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="text-warning" />
              未获得持久化存储，请定期导出备份。
            </>
          )}
        </p>

        {message ? <Notice tone="danger">{message}</Notice> : null}
      </div>
    </Panel>
  );
}
