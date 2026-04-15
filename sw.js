const CACHE_NAME = 'ki-invoice-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/db.js',
  '/firebase-config.js',
  '/emailjs-config.js',
  '/manifest.json',
];

const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.hostname === 'firestore.googleapis.com' || url.hostname.includes('firebaseio.com')) {
    return;
  }

  const isCDN = CDN_ASSETS.some((cdn) => e.request.url.startsWith(cdn));

  if (isCDN || url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetched = fetch(e.request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetched;
      })
    );
  }
});
