import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

const contenedor = document.getElementById('root');
if (!contenedor) throw new Error('No se encontro el elemento #root');

createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registra el service worker (habilita instalar como app). No cachea datos.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sin PWA: la app funciona igual */
    });
  });
}
