/*
 * Service worker mínimo de Los Gochitos.
 * Objetivo: permitir instalar la web como app (PWA). NO cachea la API ni respuestas
 * dinámicas — es passthrough puro — para NUNCA mostrar datos viejos (dinero/stock).
 * Solo declara un handler de fetch, que es requisito de instalabilidad del navegador.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Passthrough: no se llama a respondWith(), el navegador maneja la red normalmente.
});
