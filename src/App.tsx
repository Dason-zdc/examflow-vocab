import { ExamFlowApp } from './ui/ExamFlowApp';
import { ErrorBoundary } from './ui/ErrorBoundary';

/** 入口只装配（门禁 6）：挂载错误边界 + 应用容器，不承载任何业务逻辑。 */
export default function App() {
  return (
    <ErrorBoundary>
      <ExamFlowApp />
    </ErrorBoundary>
  );
}
