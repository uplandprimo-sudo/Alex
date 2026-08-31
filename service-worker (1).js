/**
 * ALEX — SERVICE WORKER
 * =====================
 * Caches the interface only. Never project data.
 *
 * The temptation with a service worker is to cache everything so the app
 * "works offline". For this app that would be actively harmful: opening
 * Alex on a train and seeing yesterday's cash position, with nothing to
 * say it was stale, is worse than seeing an honest error.
 *
 * So: the shell is cached and loads instantly. Every request for figures
 * goes to the network, and if there is no network it says so.
 */

const SHELL_CACHE = 'alex-shell-v1';

// Only files we control and that contain no figures.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];


self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Individually, so one missing icon does not fail the whole install.
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});


self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== SHELL_CACHE).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});


self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                    // never cache a POST

  const url = new URL(req.url);

  // Anything that carries project data goes straight to the network and is
  // never stored: the Apps Script endpoint, Google sign-in, Drive previews.
  const isLiveData =
    url.hostname.endsWith('script.google.com') ||
    url.hostname.endsWith('googleusercontent.com') ||
    url.hostname.endsWith('accounts.google.com') ||
    url.hostname.endsWith('drive.google.com') ||
    url.hostname.endsWith('gstatic.com');

  if (isLiveData) return;                              // let the browser handle it

  // The page itself: network first, so a new version is picked up as soon
  // as it is published. Falls back to cache only when genuinely offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || offlinePage_()))
    );
    return;
  }

  // Icons and the manifest: cache first, they rarely change.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});


/** Shown only when the page is requested with no network and no cached copy. */
function offlinePage_() {
  return new Response(
    `<!DOCTYPE html><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Alex — offline</title>
     <style>
       body{margin:0;height:100vh;display:grid;place-items:center;background:#f5f6f8;
            font:16px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
            color:#0d1117;text-align:center;padding:30px}
       .m{width:56px;height:56px;border-radius:15px;background:#0d1117;color:#fff;
          display:grid;place-items:center;font-size:23px;font-weight:600;margin:0 auto 16px}
       p{color:#6b7480;font-size:14px;max-width:280px;margin:8px auto 0}
     </style>
     <div>
       <div class="m">A</div>
       <b>No connection</b>
       <p>Alex reads live project figures, so he needs a connection.
          Nothing is shown from memory — yesterday's numbers would be
          worse than none.</p>
     </div>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
