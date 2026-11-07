// الاستماع إلى آية. الصوت يُبث من الإنترنت وقت الاستخدام فقط ولا يُخزَّن.
var Recite = (function () {
  var D = QD;
  var EVERYAYAH = 'https://everyayah.com/data/';
  // مهلة تحميل قبل إعلان تعذر الوصول إلى الملف
  var LOAD_TIMEOUT = 25000;

  // كل قارئ له ملف مستقل لكل آية
  var RECITERS = [
    { id: 'mansouri', name: 'كريم منصوري', note: 'إيران', base: EVERYAYAH + 'Karim_Mansoori_40kbps/' },
    { id: 'parhizgar', name: 'شهريار پرهيزگار', note: 'إيران', base: EVERYAYAH + 'Parhizgar_48kbps/' },
    { id: 'abdulbasit', name: 'عبد الباسط عبد الصمد', note: 'مصر', base: EVERYAYAH + 'Abdul_Basit_Murattal_192kbps/' },
    { id: 'minshawi', name: 'محمد صديق المنشاوي', note: 'مصر', base: EVERYAYAH + 'Minshawy_Murattal_128kbps/' }
  ];

  var audio = null;
  var bar, label, watchdog = 0, playing = false;

  function pad(n) {
    return ('00' + n).slice(-3);
  }

  function fileUrl(reciter, g) {
    var a = D.ayahOf(g);
    return reciter.base + pad(a.surah.id) + pad(a.ayah) + '.mp3';
  }

  function show(text) {
    label.textContent = text;
    bar.hidden = false;
  }

  function stop() {
    clearTimeout(watchdog);
    playing = false;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (bar) bar.hidden = true;
  }

  function fail() {
    stop();
    App.toast(navigator.onLine === false
      ? 'الاستماع يحتاج إلى اتصال بالإنترنت'
      : 'تعذر تشغيل التلاوة، حاول مرة أخرى');
  }

  function play(reciter, g) {
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('error', function () { if (playing) fail(); });
      audio.addEventListener('ended', stop);
    }
    stop();
    var a = D.ayahOf(g);
    var title = reciter.name + ' · ' + a.surah.name + ' ' + D.digits(a.ayah);
    show(title + ' · جارٍ التحميل…');
    playing = true;
    watchdog = setTimeout(fail, LOAD_TIMEOUT);

    audio.onplaying = function () {
      clearTimeout(watchdog);
      show(title);
    };
    audio.src = fileUrl(reciter, g);
    audio.play().catch(function (e) {
      if (playing && e.name !== 'AbortError') fail();
    });
  }

  function init() {
    bar = document.getElementById('player');
    label = document.getElementById('playerLabel');
    document.getElementById('playerStop').addEventListener('click', function (e) {
      e.currentTarget.blur();
      stop();
    });
  }

  return {
    init: init, play: play, stop: stop, reciters: RECITERS,
    isPlaying: function () { return playing; }
  };
})();
