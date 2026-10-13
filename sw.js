// Service worker: network-first (luôn lấy bản mới khi có mạng), mất mạng thì dùng cache để chạy offline. Đường dẫn tương đối nên chạy được dưới mọi sub-path.
const CACHE = 'pipo-v8';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './src/main.js', './src/config.js', './src/core/spring.js', './src/core/bus.js', './src/core/store.js', './src/core/telemetry.js',
  './src/eyes/params.js', './src/eyes/mouth.js', './src/eyes/expressions.js', './src/eyes/animator.js', './src/eyes/renderer.js', './src/eyes/fx.js', './src/eyes/body.js', './src/eyes/handclips.js', './src/eyes/hands.js', './src/eyes/fall.js',
  './src/skins/index.js', './src/skins/classic.js', './src/skins/pixel.js', './src/skins/eve.js',
  './src/brain/needs.js', './src/brain/mood.js', './src/brain/reactions.js', './src/brain/rules.js', './src/brain/llm.js', './src/brain/gestures.js', './src/brain/dance.js', './src/brain/handpose.js', './src/brain/meet.js',
  './src/sensors/motion.js', './src/sensors/compass.js', './src/sensors/geo.js', './src/sensors/weather.js', './src/sensors/camera.js', './src/sensors/mic.js', './src/sensors/music.js', './src/sensors/battery.js', './src/sensors/clock.js', './src/sensors/hands.js',
  './src/audio/sounds.js', './src/audio/chirp.js', './src/audio/mimic.js', './src/audio/voice.js', './src/audio/beat.js', './src/audio/modem.js', './src/audio/meetlink.js', './src/audio/meetsession.js', './src/audio/meetio.js',
  './src/ui/dom.js', './src/ui/drawer.js', './src/ui/feed.js', './src/ui/settings.js', './src/ui/onboarding.js', './src/ui/debug.js', './src/ui/install.js',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
});
