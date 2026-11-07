// يخزّن ملفات الموقع على الجهاز ليعمل دون إنترنت بعد أول فتحة.
// sw-files.js يولّده tools/build_pwa.py ويحوي بصمة كل ملف، فالتحديث لا يعيد تنزيل إلا ما تغيّر.
importScripts('sw-files.js');

var CACHE = 'majlis-files';
var SCOPE_PATH = new URL('./', self.location).pathname;
var PARALLEL = 4;

function keyOf(path) {
  return path + '?h=' + FILES[path];
}

function store(cache, path) {
  var key = keyOf(path);
  return fetch(key, { cache: 'no-cache' }).then(function (res) {
    if (!res.ok) throw new Error(path);
    return cache.put(key, res);
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(CORE.map(function (path) {
      return cache.match(keyOf(path)).then(function (hit) {
        return hit ? null : store(cache, path);
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  // حذف نسخ الملفات التي لم تعد مستخدمة
  var valid = {};
  Object.keys(FILES).forEach(function (p) { valid[new URL(keyOf(p), self.location).href] = true; });
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.keys().then(function (keys) {
      return Promise.all(keys.filter(function (r) { return !valid[r.url]; }).map(function (r) {
        return cache.delete(r);
      }));
    });
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  var path = url.pathname.slice(SCOPE_PATH.length) || 'index.html';
  if (!FILES[path]) return;
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(keyOf(path)).then(function (hit) {
      if (hit) return hit;
      return fetch(keyOf(path)).then(function (res) {
        if (res.ok) cache.put(keyOf(path), res.clone());
        return res;
      });
    });
  }));
});

// حفظ بقية الملفات في الخلفية، بعد أن يصبح الموقع قابلاً للاستخدام
var saving = null;

function saveAll(client) {
  function report(data) {
    if (client) client.postMessage(data);
  }
  return caches.open(CACHE).then(function (cache) {
    return cache.keys().then(function (keys) {
      var have = {};
      keys.forEach(function (r) { have[r.url] = true; });
      var missing = Object.keys(FILES).filter(function (p) {
        return !have[new URL(keyOf(p), self.location).href];
      });
      var total = missing.length;
      var done = 0, failed = 0;
      if (!total) return report({ type: 'cache-done', failed: 0, fresh: false });
      report({ type: 'cache-progress', done: 0, total: total });
      function worker() {
        var path = missing.shift();
        if (!path) return Promise.resolve();
        return store(cache, path).catch(function () { failed++; }).then(function () {
          done++;
          report({ type: 'cache-progress', done: done, total: total });
          return worker();
        });
      }
      var workers = [];
      for (var i = 0; i < PARALLEL; i++) workers.push(worker());
      return Promise.all(workers).then(function () {
        report({ type: 'cache-done', failed: failed, fresh: true });
      });
    });
  });
}

self.addEventListener('message', function (event) {
  if (!event.data || event.data.type !== 'cache-all') return;
  if (!saving) {
    saving = saveAll(event.source).then(function () { saving = null; }, function () { saving = null; });
  }
  event.waitUntil(saving);
});
