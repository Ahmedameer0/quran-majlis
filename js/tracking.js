// تتبع موضع القراءة من صوت القارئ (تجريبي). يعمل في متصفح Chrome فقط ويحتاج إلى الإنترنت،
// لأن التفريغ يتم عبر Web Speech API. الأسهم تبقى للتصحيح في كل وقت.
var Tracking = (function () {
  var D = QD;
  var LAST_WORDS = 7;          // آخر الكلمات المسموعة التي تُطابق
  var MATCH_FLOOR = 0.55;      // تشابه كلمتين أقل منه يُعدّ اختلافاً
  var GAP = 0.45;              // عقوبة كلمة زائدة أو ناقصة
  var NEAR_BONUS = 0.6;        // ترجيح موضع قريب بعد الموضع الحالي
  var NEAR_BEFORE = 6, NEAR_AFTER = 45;
  var MIN_SCORE = 1.4;         // أقل درجة لقبول موضع قريب
  var FIRST_SCORE = 3.5;       // أول موضع أو قفزة بعيدة تحتاج تطابقاً أوضح
  var HEARD_KEEP = 40;
  // الاستعاذة والبسملة ليستا من نص السورة (عدا الفاتحة)، فلا تُطابقان
  var OPENERS = ['اعوذ بالله من الشيطان الرجيم', 'بسم الله الرحمن الرحيم'];

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognizer = null, listening = false, heard = '';
  var words = [], wordsKey = '', position = -1;
  var hooks = {};

  function skeleton(word) {
    return word
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ؤئ]/g, 'ء')
      .replace(/[^ء-ي]/g, '')
      .replace(/(?!^)[اوي]/g, '');
  }

  function distance(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev.push(j);
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function similar(a, b) {
    if (!a || !b) return 0;
    return 1 - distance(a, b) / Math.max(a.length, b.length);
  }

  var OPENER_SKELETONS = OPENERS.map(function (t) { return t.split(' ').map(skeleton); });

  // يحذف الاستعاذة والبسملة من الكلمات المسموعة إن وردتا كاملتين أو شبه كاملتين
  function dropOpeners(q, keepBasmala) {
    OPENER_SKELETONS.forEach(function (op, n) {
      if (keepBasmala && n === 1) return;
      for (var i = 0; i + op.length <= q.length; i++) {
        var hit = 0;
        for (var k = 0; k < op.length; k++) if (similar(q[i + k], op[k]) >= 0.7) hit++;
        if (hit >= op.length - 1) {
          q.splice(i, op.length);
          i--;
        }
      }
    });
    return q;
  }

  // كلمات السورة الحالية والتالية، كي يستمر التتبع عند الانتقال إلى سورة جديدة
  function loadWords(g) {
    var surah = D.ayahOf(g).surah;
    var key = String(surah.id);
    if (key === wordsKey) return;
    wordsKey = key;
    words = [];
    [surah, D.surahs[surah.id]].forEach(function (s) {
      if (!s) return;
      D.surahAyahs(s).forEach(function (item) {
        item.words.forEach(function (w) {
          var sk = skeleton(w);
          if (sk) words.push({ sk: sk, g: item.g });
        });
      });
    });
    position = -1;
  }

  // محاذاة محلية تنتهي عند آخر كلمة مسموعة؛ الكلمات الأحدث أثقل وزناً كي يُعرف بدء الآية الجديدة بسرعة
  function locate(text) {
    var q = text.split(/\s+/).map(skeleton).filter(Boolean);
    q = dropOpeners(q, D.ayahOf(hooks.current()).surah.id === 1).slice(-LAST_WORDS);
    if (!q.length) return null;
    var n = words.length, k = q.length;
    var prev = new Float32Array(n + 1), cur;
    var best = { score: 0, end: -1, near: false };
    for (var a = 1; a <= k; a++) {
      cur = new Float32Array(n + 1);
      var weight = 0.7 + 0.6 * a / k;
      for (var b = 1; b <= n; b++) {
        var s = similar(q[a - 1], words[b - 1].sk);
        var m = prev[b - 1] + (s >= MATCH_FLOOR ? s * weight : s - 1);
        cur[b] = Math.max(0, m, prev[b] - GAP, cur[b - 1] - GAP);
        if (a === k) {
          var score = cur[b], end = b - 1;
          var near = position >= 0 && end >= position - NEAR_BEFORE && end <= position + NEAR_AFTER;
          if (near) score += NEAR_BONUS;
          if (score > best.score) best = { score: score, end: end, near: near };
        }
      }
      prev = cur;
    }
    if (best.end < 0 || best.score < (best.near ? MIN_SCORE : FIRST_SCORE)) return null;
    position = best.end;
    return words[best.end].g;
  }

  function onText(text, interim) {
    var g = locate(text);
    hooks.status(text.split(/\s+/).slice(-8).join(' '), interim);
    if (g !== null && g !== undefined && g !== hooks.current()) hooks.move(g);
  }

  function start() {
    if (!Recognition || listening) return;
    loadWords(hooks.current());
    syncTo(hooks.current());
    recognizer = new Recognition();
    recognizer.lang = 'ar-SA';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          heard = (heard + ' ' + t).split(/\s+/).filter(Boolean).slice(-HEARD_KEEP).join(' ');
          onText(heard, false);
        } else {
          interim += t;
        }
      }
      // النتائج المؤقتة أسرع، والنهائية تصححها
      if (interim) onText(heard + ' ' + interim, true);
    };
    recognizer.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stop();
        hooks.error('لم يُسمح باستخدام الميكروفون');
      }
    };
    // Chrome يوقف الاستماع بعد صمت أو انقطاع، فيُعاد ما دام التتبع مفعّلاً
    recognizer.onend = function () {
      if (listening) {
        try { recognizer.start(); } catch (err) { /* بدأ بالفعل */ }
      }
    };
    listening = true;
    heard = '';
    recognizer.start();
    hooks.status('', false);
  }

  function stop() {
    listening = false;
    if (recognizer) recognizer.stop();
    hooks.stopped();
  }

  // بعد تنقل يدوي بالأسهم يبدأ البحث من الموضع الجديد
  function syncTo(g) {
    loadWords(g);
    for (var i = 0; i < words.length; i++) {
      if (words[i].g === g) {
        position = i;
        return;
      }
    }
  }

  return {
    // في تطبيق التلفزيون لا يُعرض حتى تثبت التجارب دقته
    supported: !!Recognition && !window.AndroidApp,
    init: function (h) { hooks = h; },
    start: start,
    stop: stop,
    syncTo: function (g) { if (listening) syncTo(g); },
    isListening: function () { return listening; },
    // للاختبار دون ميكروفون
    _test: { locate: locate, loadWords: loadWords, reset: function () { position = -1; wordsKey = ''; } }
  };
})();
