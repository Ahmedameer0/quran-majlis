// حفظ ملفات الموقع للعمل دون إنترنت.
(function () {
  var badge = document.getElementById('offline');
  var hideTimer = 0;

  function show(text, sticky) {
    badge.textContent = text;
    badge.hidden = false;
    clearTimeout(hideTimer);
    if (!sticky) hideTimer = setTimeout(function () { badge.hidden = true; }, 6000);
  }

  // لا يعمل Service Worker من file:// ولا يلزم هناك
  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;

  navigator.serviceWorker.addEventListener('message', function (e) {
    var m = e.data || {};
    if (m.type === 'cache-progress' && m.total) {
      show('جارٍ الحفظ للعمل دون إنترنت ' + QD.digits(Math.floor(m.done / m.total * 100)) + '٪', true);
    } else if (m.type === 'cache-done' && m.failed) {
      show('تعذر حفظ ' + QD.digits(m.failed) + ' ملفاً، وسيُعاد الحفظ عند الفتح القادم');
    } else if (m.type === 'cache-done' && m.fresh) {
      show('الموقع جاهز للعمل دون إنترنت');
    }
  });

  // نسخة جديدة تسلّمت الصفحة: تُعرض فوراً إن كانت الصفحة فُتحت للتو، وإلا لا يُقاطَع القارئ
  var RELOAD_WINDOW = 30000;
  var openedAt = Date.now();
  var wasControlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!wasControlled) return;  // أول تثبيت وليس تحديثاً
    if (Date.now() - openedAt < RELOAD_WINDOW) location.reload();
    else show('نسخة جديدة جاهزة، وستظهر عند فتح الموقع مرة أخرى');
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
    navigator.serviceWorker.ready.then(function (reg) {
      // منع المتصفح من مسح الملفات عند ضيق المساحة قدر الإمكان
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      reg.active.postMessage({ type: 'cache-all' });
    });
  });
})();
