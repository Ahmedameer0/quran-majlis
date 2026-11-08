// تتبع موضع القراءة من صوت القارئ (تجريبي). يعمل في متصفح Chrome فقط ويحتاج إلى الإنترنت،
// لأن التفريغ يتم عبر Web Speech API. الأسهم تبقى للتصحيح في كل وقت.
var Tracking = (function () {
  var D = QD;
  var LAST_WORDS = 7;          // آخر الكلمات المسموعة التي تُطابق
  var MATCH_FLOOR = 0.55;      // تشابه كلمتين أقل منه يُعدّ اختلافاً
  var GAP = 0.45;              // عقوبة كلمة زائدة أو ناقصة
  var NEAR_BONUS = 0.6;        // ترجيح موضع قريب بعد الموضع الحالي
  var NEAR_BEFORE = 1, NEAR_AFTER = 45;
  var MIN_SCORE = 1.4;         // أقل درجة لقبول موضع قريب
  var FIRST_SCORE = 3.5;       // قفزة بعيدة أو رجوع يحتاج تطابقاً أوضح
  var CONFIRM_SPAN = 3;        // القفزة البعيدة تُقبل إذا تكررت في الموضع نفسه تقريباً
  var LOST_AFTER = 3;          // نتائج نهائية متتالية بلا تطابق قبل البحث في القرآن كله
  var GLOBAL_SCORE = 4.5;
  var GLOBAL_SEED_WORDS = 4;   // آخر الكلمات التي يُبحث عن مواضعها الحرفية
  var GLOBAL_SEED_MAX = 60;    // كلمة تتكرر أكثر من هذا لا تصلح دليلاً على الموضع
  var PAUSE_AFTER_AUDIO = 1500;
  var HEARD_KEEP = 40;
  var LOG_KEEP = 600;
  // الاستعاذة والبسملة ليستا من نص السورة (عدا الفاتحة)، فلا تُطابقان
  var OPENERS = ['اعوذ بالله من الشيطان الرجيم', 'بسم الله الرحمن الرحيم'];
  // حروف يخلط بينها التفريغ كثيراً، فاستبدال أحدها بالآخر خطأ نصف كامل
  var NEAR_LETTERS = ['قك', 'ذزظض', 'ثسص', 'طت', 'حه', 'عءا', 'دض'];

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognizer = null, listening = false, heard = '';
  var words = [], wordsKey = '', position = -1, pending = null, misses = 0;
  var allWords = null, allIndex = null, quietUntil = 0, log = [];
  var SK_IDS = {}, SK_LIST = [];   // رقم ثابت لكل هيكل كلمة، لتخزين نتائج المقارنة
  var hooks = {};

  function skeleton(word) {
    return word
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ؤئ]/g, 'ء')
      .replace(/[^ء-ي]/g, '')
      .replace(/(?!^)[اوي]/g, '');
  }

  // لكل حرف قناع بالمجموعات التي ينتمي إليها، فيُعرف تقارب حرفين بعملية واحدة
  var nearMask = {};
  NEAR_LETTERS.forEach(function (group, n) {
    for (var i = 0; i < group.length; i++) nearMask[group[i]] = (nearMask[group[i]] || 0) | (1 << n);
  });

  function distance(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev.push(j);
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var x = a[i - 1], mx = nearMask[x] || 0;
      for (j = 1; j <= b.length; j++) {
        var y = b[j - 1];
        var sub = x === y ? 0 : mx & (nearMask[y] || 0) ? 0.5 : 1;
        cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function similar(a, b) {
    if (!a || !b) return 0;
    var longer = Math.max(a.length, b.length);
    var gapLen = Math.abs(a.length - b.length);
    // فرق الطول وحده يكفي أحياناً لمعرفة أن الكلمتين مختلفتان، فلا داعي للحساب الكامل
    if (gapLen / longer > 0.5) return 1 - gapLen / longer;
    return 1 - distance(a, b) / longer;
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

  function surahWords(s) {
    var list = [];
    D.surahAyahs(s).forEach(function (item) {
      item.words.forEach(function (w, n) {
        var sk = skeleton(w);
        if (!sk) return;
        if (SK_IDS[sk] === undefined) SK_IDS[sk] = SK_LIST.push(sk) - 1;
        list.push({ sk: sk, id: SK_IDS[sk], g: item.g, i: n + 1 });
      });
    });
    return list;
  }

  // كلمات السورة الحالية والتالية، كي يستمر التتبع عند الانتقال إلى سورة جديدة
  function loadWords(g) {
    var surah = D.ayahOf(g).surah;
    var key = String(surah.id);
    if (key === wordsKey) return;
    wordsKey = key;
    words = surahWords(surah);
    if (D.surahs[surah.id]) words = words.concat(surahWords(D.surahs[surah.id]));
    position = -1;
    pending = null;
  }

  // محاذاة محلية تنتهي عند آخر كلمة مسموعة. الكلمات الأحدث أثقل وزناً،
  // وتُقبل كلمتان مسموعتان مقابل كلمة واحدة في الرسم مثل «يا أيها» و«يأيها»
  function align(q, list, from) {
    var n = list.length, k = q.length;
    var prev2 = null, prev = new Float32Array(n + 1), cur;
    var best = { score: 0, end: -1, last: 0 };
    // كلمات السورة تتكرر كثيراً، فيُحسب تشابه كل كلمة مسموعة مع كل هيكل مرة واحدة بحسب رقمه
    var single = new Float32Array(SK_LIST.length), pair = new Float32Array(SK_LIST.length);
    for (var a = 1; a <= k; a++) {
      cur = new Float32Array(n + 1);
      var weight = 0.7 + 0.6 * a / k;
      var joined = a > 1 && prev2 ? q[a - 2] + q[a - 1] : null;
      single.fill(-2);
      pair.fill(-2);
      for (var b = 1; b <= n; b++) {
        var id = list[b - 1].id;
        var s = single[id];
        if (s === -2) s = single[id] = similar(q[a - 1], SK_LIST[id]);
        var v = Math.max(0, prev[b - 1] + (s >= MATCH_FLOOR ? s * weight : s - 1), prev[b] - GAP, cur[b - 1] - GAP);
        var sj = 0;
        // دمج كلمتين مسموعتين لا يفيد إلا إذا بدأ بالحرف نفسه
        if (joined && joined[0] === SK_LIST[id][0]) {
          sj = pair[id];
          if (sj === -2) sj = pair[id] = similar(joined, SK_LIST[id]);
          if (sj >= 0.75) v = Math.max(v, prev2[b - 1] + sj * weight * 1.6);
        }
        cur[b] = v;
        if (a === k && (from === undefined || b - 1 >= from) && v > best.score) {
          best = { score: v, end: b - 1, last: Math.max(s, sj) };
        }
      }
      prev2 = prev;
      prev = cur;
    }
    return best;
  }

  function maxScore(k) {
    var sum = 0;
    for (var a = 1; a <= k; a++) sum += 0.7 + 0.6 * a / k;
    return sum;
  }

  function prepare(text) {
    var q = text.split(/\s+/).map(skeleton).filter(Boolean);
    return dropOpeners(q, D.ayahOf(hooks.current()).surah.id === 1).slice(-LAST_WORDS);
  }

  // البحث في القرآن كله حين يضيع الموضع، لقارئ انتقل إلى سورة بعيدة.
  // لا يُحاذى النص كاملاً، بل نوافذ صغيرة حول المواضع التي تطابق فيها كلمة مسموعة حرفياً
  function searchEverywhere(q) {
    if (!allWords) {
      allWords = [];
      allIndex = {};
      D.surahs.forEach(function (s) { allWords = allWords.concat(surahWords(s)); });
      allWords.forEach(function (w, n) { (allIndex[w.sk] = allIndex[w.sk] || []).push(n); });
    }
    var seeds = [];
    q.slice(-GLOBAL_SEED_WORDS).forEach(function (sk) {
      if (sk.length >= 3 && allIndex[sk] && allIndex[sk].length <= GLOBAL_SEED_MAX) seeds = seeds.concat(allIndex[sk]);
    });
    var best = { score: 0, end: -1, last: 0 }, from = 0;
    seeds.forEach(function (n) {
      var lo = Math.max(0, n - LAST_WORDS * 2), hi = Math.min(allWords.length, n + LAST_WORDS * 2);
      var r = align(q, allWords.slice(lo, hi));
      if (r.score > best.score) {
        best = r;
        from = lo;
      }
    });
    if (best.end < 0 || best.score < GLOBAL_SCORE || best.last < MATCH_FLOOR) return null;
    var w = allWords[from + best.end];
    loadWords(w.g);
    for (var i = 0; i < words.length; i++) {
      if (words[i].g === w.g && words[i].i === w.i) {
        position = i;
        return { word: words[i], score: best.score, conf: best.score / maxScore(q.length), kind: 'global' };
      }
    }
    return null;
  }

  function locate(text, final) {
    var q = prepare(text);
    if (!q.length) return null;
    var best = align(q, words);
    var conf = best.score / maxScore(q.length);
    // لا يتحرك إن لم تطابق آخر كلمة مسموعة شيئاً: صمت أو كلام جانبي
    if (best.end < 0 || best.last < MATCH_FLOOR) return lost(q, final, conf);
    var near = position >= 0 && best.end >= position - NEAR_BEFORE && best.end <= position + NEAR_AFTER;
    var score = best.score + (near ? NEAR_BONUS : 0);
    if (near && score >= MIN_SCORE) return accept(best.end, score, conf, 'near');
    if (!near && best.score >= FIRST_SCORE) {
      // القفزة البعيدة والرجوع لا يُقبلان إلا إذا تكررا، فالقارئ نادراً ما يرجع
      if (pending !== null && Math.abs(pending - best.end) <= CONFIRM_SPAN) return accept(best.end, score, conf, 'jump');
      pending = best.end;
      return { held: true, conf: conf };
    }
    return lost(q, final, conf);
  }

  function accept(end, score, conf, kind) {
    position = end;
    pending = null;
    misses = 0;
    return { word: words[end], score: score, conf: conf, kind: kind };
  }

  function lost(q, final, conf) {
    if (final && q.length >= 4 && ++misses >= LOST_AFTER) {
      misses = 0;
      var found = searchEverywhere(q);
      if (found) return found;
    }
    return { held: true, conf: Math.min(conf, 0.3) };
  }

  function record(text, result) {
    var w = result && result.word;
    var a = w ? D.ayahOf(w.g) : null;
    log.push({
      t: Date.now(),
      heard: text.split(/\s+/).slice(-LAST_WORDS).join(' '),
      at: a ? a.surah.name + ' ' + a.ayah + ':' + w.i : '—',
      kind: result ? result.kind || 'ثابت' : 'لا شيء',
      conf: result ? Math.round(result.conf * 100) : 0
    });
    if (log.length > LOG_KEEP) log.shift();
  }

  function onText(text, interim) {
    // أثناء تشغيل تلاوة من «استمع» يسمع الميكروفون صوت التلفزيون لا القارئ
    if (hooks.paused()) {
      quietUntil = Date.now() + PAUSE_AFTER_AUDIO;
      hooks.status('متوقف مؤقتاً أثناء تشغيل التلاوة', true, 'off');
      return;
    }
    if (Date.now() < quietUntil) return;
    var result = locate(text, !interim);
    if (!interim) record(text, result);
    var level = !result ? 'low' : result.conf >= 0.7 ? 'high' : result.conf >= 0.45 ? 'mid' : 'low';
    hooks.status(text.split(/\s+/).slice(-8).join(' '), interim, level);
    if (result && result.word) hooks.move(result.word.g, result.word.i);
  }

  function start() {
    if (!Recognition || listening) return;
    loadWords(hooks.current());
    syncTo(hooks.current());
    log = [];
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
    hooks.status('', false, 'mid');
  }

  function stop() {
    listening = false;
    if (recognizer) recognizer.stop();
    hooks.stopped();
  }

  // بعد تنقل يدوي بالأسهم يبدأ البحث من أول الآية الجديدة
  function syncTo(g) {
    loadWords(g);
    pending = null;
    for (var i = 0; i < words.length; i++) {
      if (words[i].g === g) {
        position = i;
        return;
      }
    }
  }

  function logText() {
    var start = log.length ? log[0].t : 0;
    return log.map(function (e) {
      return ((e.t - start) / 1000).toFixed(1) + 's\t' + e.at + '\t' + e.kind + '\t' + e.conf + '%\t' + e.heard;
    }).join('\n');
  }

  return {
    // في تطبيق التلفزيون لا يُعرض حتى تثبت التجارب دقته
    supported: !!Recognition && !window.AndroidApp,
    init: function (h) { hooks = h; },
    start: start,
    stop: stop,
    syncTo: function (g) { if (listening) syncTo(g); },
    isListening: function () { return listening; },
    hasLog: function () { return log.length > 0; },
    logText: logText,
    // للاختبار دون ميكروفون
    _test: {
      locate: locate, loadWords: loadWords, syncTo: syncTo,
      reset: function () { position = -1; wordsKey = ''; pending = null; misses = 0; }
    }
  };
})();
