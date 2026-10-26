// ToDo アプリ本体。データはこの端末のブラウザ（localStorage）だけに保存する。
(function () {
  var KEY_ITEMS = 'todo.items.v1';
  var KEY_CUSTOMERS = 'todo.customers.v1';
  var KEY_TAB = 'todo.tab.v1';
  var P = TodoParser;
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

  function $(id) { return document.getElementById(id); }

  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      toast('保存できませんでした（ブラウザの保存領域を確認してください）');
      return false;
    }
  }

  var items = load(KEY_ITEMS, []);
  var customers = load(KEY_CUSTOMERS, null) || P.DEFAULT_CUSTOMERS.slice();
  var tab = load(KEY_TAB, 'today');
  var editingId = null;

  function todayStr() { return P.formatDate(new Date()); }
  function saveItems() { save(KEY_ITEMS, items); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function dueLabel(due) {
    var t = todayStr();
    var tomorrow = P.formatDate(new Date(Date.now() + 864e5));
    if (due === t) return '今日';
    if (due === tomorrow) return '明日';
    var d = new Date(due + 'T00:00:00');
    var s = (d.getMonth() + 1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')';
    return d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '/' + s : s;
  }

  // ---- 入力 ----
  var input = $('input');

  function renderPreview() {
    var box = $('preview');
    box.textContent = '';
    var text = input.value.trim();
    if (!text) return;
    var r = P.parse(text, new Date(), customers);
    if (r.due) box.appendChild(chip('📅 ' + dueLabel(r.due)));
    if (r.priority !== 'normal') box.appendChild(chip(r.priority === 'high' ? '優先度 高' : '優先度 低', r.priority));
    if (r.customer) box.appendChild(chip('🏢 ' + r.customer));
  }
  function chip(text, cls) {
    var s = document.createElement('span');
    s.className = 'chip' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }

  function addFromInput() {
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    var r = P.parse(text, new Date(), customers);
    var item = {
      id: newId(), title: r.title, due: r.due, priority: r.priority,
      customer: r.customer || '', memo: '', done: false,
      createdAt: new Date().toISOString(), doneAt: null, source: text
    };
    items.push(item);
    saveItems();
    input.value = '';
    renderPreview();
    // 入れたものが今のタブに出ないときは「すべて」へ
    if (!matchesTab(item, tab)) setTab('all'); else render();
    toast('追加しました');
    input.focus();
  }

  input.addEventListener('input', renderPreview);
  input.addEventListener('keydown', function (e) {
    // 日本語の変換中の Enter は無視。Shift+Enter は改行
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addFromInput();
    }
  });
  $('addBtn').addEventListener('click', addFromInput);

  // ---- 音声入力 ----
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, listening = false, baseText = '';
  $('micBtn').addEventListener('click', function () {
    if (!Rec) {
      toast('この画面では🎤が使えません。キーボードのマイクボタンで話してください');
      input.focus();
      return;
    }
    if (listening) { rec.stop(); return; }
    rec = new Rec();
    rec.lang = 'ja-JP';
    rec.interimResults = true;
    rec.continuous = false;
    baseText = input.value ? input.value.replace(/\s+$/, '') + ' ' : '';
    rec.onresult = function (e) {
      var s = '';
      for (var i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      input.value = baseText + s;
      renderPreview();
    };
    rec.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast('マイクが許可されていません。キーボードのマイクボタンで話してください');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        toast('音声を聞き取れませんでした（' + e.error + '）');
      }
    };
    rec.onend = function () {
      listening = false;
      $('micBtn').classList.remove('listening');
      input.focus();
    };
    try {
      rec.start();
      listening = true;
      $('micBtn').classList.add('listening');
    } catch (err) {
      toast('音声入力を始められませんでした。キーボードのマイクボタンで話してください');
    }
  });

  // ---- 一覧 ----
  function matchesTab(it, which) {
    var t = todayStr();
    if (which === 'today') return it.due === t;
    if (which === 'overdue') return !it.done && !!it.due && it.due < t;
    return true;
  }

  function sortItems(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (b.doneAt || '').localeCompare(a.doneAt || '');
    if ((a.due || '9') !== (b.due || '9')) return (a.due || '9') < (b.due || '9') ? -1 : 1;
    if (a.priority !== b.priority) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return a.createdAt.localeCompare(b.createdAt);
  }

  function setTab(which) {
    tab = which;
    save(KEY_TAB, tab);
    render();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
    b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
  });

  function render() {
    var t = todayStr();
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    $('cToday').textContent = items.filter(function (x) { return !x.done && x.due === t; }).length || '';
    $('cOverdue').textContent = items.filter(function (x) { return matchesTab(x, 'overdue'); }).length || '';
    $('cAll').textContent = items.filter(function (x) { return !x.done; }).length || '';

    var shown = items.filter(function (x) { return matchesTab(x, tab); }).sort(sortItems);
    var list = $('list');
    list.textContent = '';
    shown.forEach(function (it) { list.appendChild(renderItem(it, t)); });

    var empty = $('empty');
    empty.hidden = shown.length > 0;
    empty.textContent = { today: '今日が期限のものはありません', overdue: '期限切れはありません', all: 'まだ何もありません。上の欄に入れてみましょう' }[tab];
  }

  function renderItem(it, t) {
    var li = document.createElement('li');
    li.className = 'item' + (it.done ? ' done' : '') + (!it.done && it.priority === 'high' ? ' high' : '');

    var check = document.createElement('button');
    check.className = 'check';
    check.setAttribute('aria-label', it.done ? '未完了に戻す' : '完了にする');
    check.textContent = it.done ? '✓' : '';
    check.addEventListener('click', function () { toggleDone(it.id); });

    var body = document.createElement('div');
    body.className = 'body';
    var title = document.createElement('div');
    title.className = 'title';
    title.textContent = it.title;
    var meta = document.createElement('div');
    meta.className = 'meta';
    if (it.due) {
      var d = document.createElement('span');
      d.textContent = '📅 ' + dueLabel(it.due);
      if (!it.done && it.due < t) d.className = 'over';
      meta.appendChild(d);
    }
    if (it.priority !== 'normal') {
      var p = document.createElement('span');
      p.textContent = it.priority === 'high' ? '優先度 高' : '優先度 低';
      if (it.priority === 'high') p.className = 'high';
      meta.appendChild(p);
    }
    if (it.customer) {
      var c = document.createElement('span');
      c.textContent = '🏢 ' + it.customer;
      meta.appendChild(c);
    }
    if (it.memo) {
      var m = document.createElement('span');
      m.textContent = '📝 メモあり';
      meta.appendChild(m);
    }
    body.appendChild(title);
    if (meta.childNodes.length) body.appendChild(meta);
    body.addEventListener('click', function () { openEdit(it.id); });

    li.appendChild(check);
    li.appendChild(body);
    return li;
  }

  function find(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function toggleDone(id) {
    var it = find(id);
    if (!it) return;
    it.done = !it.done;
    it.doneAt = it.done ? new Date().toISOString() : null;
    saveItems();
    render();
    if (it.done) toast('完了にしました', '元に戻す', function () { toggleDone(id); });
  }

  // ---- 編集 ----
  var ePriority = 'normal';
  function setSeg(p) {
    ePriority = p;
    Array.prototype.forEach.call($('ePriority').children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-p') === p);
    });
  }
  Array.prototype.forEach.call($('ePriority').children, function (b) {
    b.addEventListener('click', function () { setSeg(b.getAttribute('data-p')); });
  });

  function openEdit(id) {
    var it = find(id);
    if (!it) return;
    editingId = id;
    $('eTitle').value = it.title;
    $('eDue').value = it.due || '';
    setSeg(it.priority);
    $('eCustomer').value = it.customer || '';
    $('eMemo').value = it.memo || '';
    $('editDlg').hidden = false;
  }
  function closeEdit() {
    $('editDlg').hidden = true;
    editingId = null;
  }
  $('eDueClear').addEventListener('click', function () { $('eDue').value = ''; });
  $('eCancel').addEventListener('click', closeEdit);
  $('editDlg').addEventListener('click', function (e) { if (e.target === $('editDlg')) closeEdit(); });
  $('eSave').addEventListener('click', function () {
    var it = find(editingId);
    if (!it) return closeEdit();
    it.title = $('eTitle').value.trim() || it.title;
    it.due = $('eDue').value || null;
    it.priority = ePriority;
    it.customer = $('eCustomer').value.trim();
    it.memo = $('eMemo').value;
    saveItems();
    closeEdit();
    render();
  });
  $('eDelete').addEventListener('click', function () {
    var idx = items.findIndex(function (x) { return x.id === editingId; });
    if (idx < 0) return closeEdit();
    var removed = items.splice(idx, 1)[0];
    saveItems();
    closeEdit();
    render();
    toast('削除しました', '元に戻す', function () {
      items.splice(Math.min(idx, items.length), 0, removed);
      saveItems();
      render();
    });
  });

  function renderCustomerList() {
    var dl = $('customerList');
    dl.textContent = '';
    customers.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.name;
      dl.appendChild(o);
    });
  }

  // ---- 設定 ----
  $('settingsBtn').addEventListener('click', function () {
    $('sCustomers').value = P.customersToText(customers);
    $('setDlg').hidden = false;
  });
  $('sClose').addEventListener('click', function () { $('setDlg').hidden = true; });
  $('setDlg').addEventListener('click', function (e) { if (e.target === $('setDlg')) $('setDlg').hidden = true; });
  $('sCustomersSave').addEventListener('click', function () {
    customers = P.parseCustomerText($('sCustomers').value);
    save(KEY_CUSTOMERS, customers);
    $('sCustomers').value = P.customersToText(customers);
    renderCustomerList();
    renderPreview();
    toast('取引先を保存しました（' + customers.length + '社）');
  });

  $('sExport').addEventListener('click', function () {
    var data = { app: 'todo', version: 1, exportedAt: new Date().toISOString(), items: items, customers: customers };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'todo-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('sImport').addEventListener('click', function () { $('sImportFile').click(); });
  $('sImportFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!data || data.app !== 'todo') throw new Error('形式');
      // 今のデータは残したまま、無いものだけ足す
      var ids = {};
      items.forEach(function (x) { ids[x.id] = true; });
      var added = (Array.isArray(data.items) ? data.items : []).filter(function (x) { return x && x.id && !ids[x.id]; });
      items = items.concat(added);
      saveItems();
      var m = P.mergeCustomers(customers, data.customers);
      customers = m.list;
      save(KEY_CUSTOMERS, customers);
      $('sCustomers').value = P.customersToText(customers);
      renderCustomerList();
      render();
      toast('読み込みました（ToDo ' + added.length + '件・取引先 ' + m.added + '社を追加）');
    }).catch(function () {
      toast('読み込めませんでした（このアプリで書き出したファイルを選んでください）');
    });
  });

  // ---- お知らせ ----
  var toastTimer = null;
  function toast(msg, actionLabel, action) {
    var el = $('toast');
    el.textContent = '';
    var s = document.createElement('span');
    s.textContent = msg;
    el.appendChild(s);
    if (actionLabel) {
      var b = document.createElement('button');
      b.textContent = actionLabel;
      b.addEventListener('click', function () { el.hidden = true; action(); });
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, actionLabel ? 5000 : 2000);
  }

  // 日付が変わっても正しく出るよう、画面に戻ったら描き直す
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  // 保存したデータをブラウザに消されにくくする
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  // ネットが無くても開けるようにする（https か localhost のときだけ動く）
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  renderCustomerList();
  render();
  input.focus();
})();
