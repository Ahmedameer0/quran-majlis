// الاستماع إلى آية. الصوت يُبث من الإنترنت وقت الاستخدام فقط ولا يُخزَّن.
var Recite = (function () {
  var D = QD;
  var ARCHIVE = 'https://archive.org/download/';
  var EVERYAYAH = 'https://everyayah.com/data/';
  var KARBALAI = 'alfirdwsiy1433_g365877434355467646573466576m429._201801/';
  var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  // مهلة تحميل قبل إعلان تعذر الوصول إلى الملف
  var LOAD_TIMEOUT = 25000;

  // ayah: ملف لكل آية. surah أو juz: ملف كامل وبداية الآية فيه تقريبية
  var RECITERS = [
    { id: 'mansouri', name: 'كريم منصوري', note: 'إيران', mode: 'ayah', base: EVERYAYAH + 'Karim_Mansoori_40kbps/' },
    { id: 'parhizgar', name: 'شهريار پرهيزگار', note: 'إيران', mode: 'ayah', base: EVERYAYAH + 'Parhizgar_48kbps/' },
    { id: 'abdulbasit', name: 'عبد الباسط عبد الصمد', note: 'مصر', mode: 'ayah', base: EVERYAYAH + 'Abdul_Basit_Murattal_192kbps/' },
    { id: 'minshawi', name: 'محمد صديق المنشاوي', note: 'مصر', mode: 'ayah', base: EVERYAYAH + 'Minshawy_Murattal_128kbps/' },
    { id: 'shakernejad', name: 'حامد شاكر نجاد', note: 'مشهد', mode: 'surah', base: ARCHIVE + 'hamed-shaker-nejad/' },
    { id: 'karbalai', name: 'أسامة الكربلائي', note: 'كربلاء', mode: 'juz', base: ARCHIVE + KARBALAI }
  ];

  var audio = null;
  var bar, label, stopAt = 0, watchdog = 0, playing = false;

  function pad(n, size) {
    return ('00' + n).slice(-size);
  }

  function textLength(g) {
    return D.surahAyahs(D.ayahOf(g).surah)[g - D.ayahOf(g).surah.start].text.replace(/\s/g, '').length;
  }

  // موضع الآية داخل مجموعة آيات متتالية، بنسبة عدد الحروف
  var BASMALA_LENGTH = 19;

  function fractionIn(first, last, g) {
    var before = 0, total = 0;
    for (var i = first; i <= last; i++) {
      var a = D.ayahOf(i);
      var n = textLength(i);
      if (a.ayah === 1 && a.surah.id !== 1 && a.surah.id !== 9) n += BASMALA_LENGTH;
      if (i < g) before += n;
      total += n;
      if (i === g) var own = n;
    }
    return { start: before / total, end: (before + own) / total };
  }


  function juzFile(j) {
    var two = pad(j, 2);
    var arabic = two.replace(/\d/g, function (d) { return ARABIC_DIGITS[d]; });
    return encodeURIComponent(two + '.القرآن الكريم - الجزء ' + arabic + ' - الحاج اسامة الكربلائي.mp3');
  }

  function source(reciter, g) {
    var a = D.ayahOf(g);
    if (reciter.mode === 'ayah') {
      return { url: reciter.base + pad(a.surah.id, 3) + pad(a.ayah, 3) + '.mp3' };
    }
    if (reciter.mode === 'surah') {
      return {
        url: reciter.base + pad(a.surah.id, 3) + '.mp3',
        range: fractionIn(a.surah.start, a.surah.start + a.surah.ayahs - 1, g)
      };
    }
    var j = D.juzOf(g), r = D.juzRange(j);
    return { url: reciter.base + juzFile(j), range: fractionIn(r[0], r[1], g) };
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
      audio.addEventListener('timeupdate', function () {
        if (stopAt && audio.currentTime >= stopAt) stop();
      });
    }
    stop();
    var src = source(reciter, g);
    var a = D.ayahOf(g);
    var title = reciter.name + ' · ' + a.surah.name + ' ' + D.digits(a.ayah);
    show(title + ' · جارٍ التحميل…');
    playing = true;
    stopAt = 0;
    watchdog = setTimeout(fail, LOAD_TIMEOUT);

    audio.onloadedmetadata = function () {
      if (src.range && isFinite(audio.duration)) {
        audio.currentTime = audio.duration * src.range.start;
        stopAt = audio.duration * src.range.end;
      }
    };
    audio.onplaying = function () {
      clearTimeout(watchdog);
      show(title + (src.range ? ' · بداية تقريبية' : ''));
    };
    audio.src = src.url;
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
