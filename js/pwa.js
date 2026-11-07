// تثبيت الموقع كتطبيق وحفظ ملفاته للعمل دون إنترنت.
(function () {
  var badge = document.getElementById('offline');
  var installBtn = document.querySelector('[data-act="install"]');
  var hideTimer = 0;
  var deferred = null;

  function show(text, sticky) {
    badge.textContent = text;
    badge.hidden = false;
    clearTimeout(hideTimer);
    if (!sticky) hideTimer = setTimeout(function () { badge.hidden = true; }, 6000);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function () {
      deferred = null;
      installBtn.hidden = true;
    });
  });

  window.addEventListener('appinstalled', function () {
    installBtn.hidden = true;
  });

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

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
    navigator.serviceWorker.ready.then(function (reg) {
      // منع المتصفح من مسح الملفات عند ضيق المساحة قدر الإمكان
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      reg.active.postMessage({ type: 'cache-all' });
    });
  });
})();
