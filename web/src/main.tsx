import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Mini App: сообщаем Telegram, что готовы, и разворачиваемся на весь экран.
const tg = (window as any).Telegram?.WebApp;
try {
  tg?.ready();
  tg?.expand();
} catch {
  /* в обычном браузере Telegram нет — не страшно */
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
