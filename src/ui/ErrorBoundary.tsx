import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from './icons';

/**
 * 根级错误边界：render 期抛错时展示可恢复的错误 UI，而不是白屏。
 * 用户数据在 IndexedDB，重试只是重新挂载，不会丢进度。
 */
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 本地产品：不上报，只落控制台，便于用户回贴
    console.error('ExamFlow 渲染异常', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-dvh bg-bg px-4 py-16">
        <div className="mx-auto max-w-96 rounded-lg border border-line bg-surface px-6 py-10 text-center" role="alert">
          <AlertTriangle size={24} strokeWidth={1.75} className="mx-auto text-warning" aria-hidden />
          <h1 className="mt-3 text-lg font-emphasize text-fg">页面出错了</h1>
          <p className="mt-2 text-md leading-body text-muted">
            你的学习进度已保存在本机，不会因此丢失。可以重试加载；若反复出现，请从设置页导出备份后重装。
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-emphasize text-accent-fg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
            重试
          </button>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-muted">技术细节</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-warm p-2 text-xs text-muted">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
