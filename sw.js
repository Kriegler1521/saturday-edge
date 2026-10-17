
const CACHE='se-static-v2';

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll([
      './',
      './index.html',
      './app.js',
      './style.css',
      './icon.svg'
    ]))
  );
  self.skipWaiting();
});

self.addEventListener('activate',e=>
  e.waitUntil(self.clients.claim())
);

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);

  if(u.pathname.endsWith('/data/games.json')) return;

  e.respondWith(
    fetch(e.request).catch(()=>caches.match(e.request))
  );
});
