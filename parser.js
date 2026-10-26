// 自動振り分け: 打った・話した言葉から 期限・優先度・取引先 を取り出す。
(function (global) {
  // 最初の取引先リストは空。社名は公開しないため、⚙設定の「読み込む」で todo-customers.json を入れる
  var DEFAULT_CUSTOMERS = [];

  var HIGH_WORDS = ['大至急', '至急', '緊急', '急ぎ'];
  var TODAY_HIGH_WORDS = ['今日中', '本日中'];
  var LOW_WORDS = ['余裕があれば', '余裕あれば', '時間があれば', '時間あれば', '暇なとき', 'ひまなとき', 'いつか'];
  var WEEKDAYS = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4, '土': 5, '日': 6 };
  // 期限のあとに付きやすい言葉（いっしょに取り除く）
  var DUE_TAIL = '(?:までに|まで|に|の|、)?';

  function normalize(s) {
    return (s || '').normalize('NFKC');
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function fmt(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function validDate(y, m, d) {
    var dt = new Date(y, m - 1, d);
    return dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  }

  // 月曜はじまりの曜日番号（月=0 … 日=6）
  function dow(d) {
    return (d.getDay() + 6) % 7;
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 期限の読み取り方。上から順に試し、最初に当たったものを使う
  var DUE_RULES = [
    { re: /(\d{1,2})月(\d{1,2})日/, fn: function (m, t) { return monthDay(+m[1], +m[2], t); } },
    { re: /(\d{1,2})\/(\d{1,2})/, fn: function (m, t) { return monthDay(+m[1], +m[2], t); } },
    { re: /来週([月火水木金土日])曜?日?/, fn: function (m, t) { return addDays(t, 7 - dow(t) + WEEKDAYS[m[1]]); } },
    { re: /来週/, fn: function (m, t) { return addDays(t, 7 - dow(t)); } },
    { re: /今週中?/, fn: function (m, t) { return addDays(t, Math.max(0, 4 - dow(t))); } },
    { re: /明後日|あさって/, fn: function (m, t) { return addDays(t, 2); } },
    { re: /明日|あした/, fn: function (m, t) { return addDays(t, 1); } },
    { re: /今日|本日/, fn: function (m, t) { return t; } },
    { re: /([月火水木金土日])曜日?/, fn: function (m, t) { return addDays(t, (WEEKDAYS[m[1]] - dow(t) + 7) % 7 || 7); } },
    { re: /(\d{1,2})日/, fn: function (m, t) {
      var d = validDate(t.getFullYear(), t.getMonth() + 1, +m[1]);
      if (d && d < t) d = validDate(t.getFullYear(), t.getMonth() + 2, +m[1]);
      return d;
    } }
  ];

  // 月日だけのときは、60日より前に過ぎていたら来年（最近の日付は今年のまま＝期限切れ）
  function monthDay(mo, d, t) {
    var dt = validDate(t.getFullYear(), mo, d);
    if (dt && dt < addDays(t, -60)) dt = validDate(t.getFullYear() + 1, mo, d);
    return dt;
  }

  function parse(input, today, customers) {
    var original = normalize(input).trim();
    var text = original;
    var t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var result = { title: '', due: null, priority: 'normal', customer: null };

    // 優先度
    var i, w, m;
    for (i = 0; i < TODAY_HIGH_WORDS.length; i++) {
      w = TODAY_HIGH_WORDS[i];
      if (text.indexOf(w) >= 0) {
        result.priority = 'high';
        result.due = fmt(t);
        text = text.replace(new RegExp(escapeRe(w) + DUE_TAIL), ' ');
        break;
      }
    }
    if (result.priority === 'normal') {
      for (i = 0; i < HIGH_WORDS.length; i++) {
        w = HIGH_WORDS[i];
        if (text.indexOf(w) >= 0) {
          result.priority = 'high';
          text = text.replace(new RegExp(escapeRe(w) + '(?:で)?'), ' ');
          break;
        }
      }
    }
    if (result.priority === 'normal') {
      for (i = 0; i < LOW_WORDS.length; i++) {
        w = LOW_WORDS[i];
        if (text.indexOf(w) >= 0) {
          result.priority = 'low';
          text = text.replace(w, ' ');
          break;
        }
      }
    }

    // 期限
    if (!result.due) {
      for (i = 0; i < DUE_RULES.length; i++) {
        m = text.match(DUE_RULES[i].re);
        if (!m) continue;
        var d = DUE_RULES[i].fn(m, t);
        if (!d) continue;
        result.due = fmt(d);
        text = text.replace(new RegExp('(?:' + DUE_RULES[i].re.source + ')' + DUE_TAIL), ' ');
        break;
      }
    }

    // 取引先（長い呼び方から順に探す）
    var names = [];
    (customers || []).forEach(function (c) {
      [c.name].concat(c.aliases || []).forEach(function (a) {
        a = normalize(a).trim();
        if (a) names.push({ alias: a, name: c.name });
      });
    });
    names.sort(function (a, b) { return b.alias.length - a.alias.length; });
    for (i = 0; i < names.length; i++) {
      if (text.indexOf(names[i].alias) >= 0) {
        result.customer = names[i].name;
        text = text.replace(new RegExp(escapeRe(names[i].alias) + '(?:さん|様)?(?:に|へ|の|と|から)?'), ' ');
        break;
      }
    }

    // 残った文が「やること」
    var title = text.replace(/\s+/g, ' ').replace(/^[\s、。,.]+|[\s、。,.]+$/g, '');
    result.title = title || original;
    return result;
  }

  // 取引先リスト ⇔ 設定画面のテキスト（1行1社「正式名: 呼び方, 呼び方」）
  function parseCustomerText(text) {
    return normalize(text).split(/\r?\n/).map(function (line) {
      line = line.trim();
      if (!line) return null;
      var idx = line.indexOf(':');
      var name = (idx >= 0 ? line.slice(0, idx) : line).trim();
      var aliases = idx >= 0 ? line.slice(idx + 1).split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
      return name ? { name: name, aliases: aliases } : null;
    }).filter(Boolean);
  }

  function customersToText(list) {
    return list.map(function (c) {
      return c.name + (c.aliases && c.aliases.length ? ': ' + c.aliases.join(', ') : '');
    }).join('\n');
  }

  // 読み込んだ取引先を今のリストに足す。同じ正式名なら呼び方だけ足す。元のリストは変えない
  function mergeCustomers(current, incoming) {
    var list = (current || []).map(function (c) { return { name: c.name, aliases: (c.aliases || []).slice() }; });
    var byName = {};
    list.forEach(function (c) { byName[c.name] = c; });
    var added = 0;
    (incoming || []).forEach(function (c) {
      if (!c || typeof c.name !== 'string' || !c.name.trim()) return;
      var name = c.name.trim();
      var aliases = Array.isArray(c.aliases) ? c.aliases.filter(function (a) { return typeof a === 'string' && a.trim(); }) : [];
      var hit = byName[name];
      if (hit) {
        aliases.forEach(function (a) { if (hit.aliases.indexOf(a) < 0) hit.aliases.push(a); });
      } else {
        hit = { name: name, aliases: aliases.slice() };
        byName[name] = hit;
        list.push(hit);
        added++;
      }
    });
    return { list: list, added: added };
  }

  global.TodoParser = {
    mergeCustomers: mergeCustomers,
    DEFAULT_CUSTOMERS: DEFAULT_CUSTOMERS,
    parse: parse,
    parseCustomerText: parseCustomerText,
    customersToText: customersToText,
    formatDate: fmt
  };
})(this);
