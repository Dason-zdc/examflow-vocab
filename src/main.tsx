import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/index.css';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA：新版本就绪时自动刷新（registerType: prompt 的轻量提示由弹层版本处理）
registerSW({ immediate: true });
