/* СИГНАЛЫ — вкладки «СВЯЗЬ» (чаты, В1–В3), «КАМЕРА» (снимок-улика, М8), «ЗАМЕТКИ» (М9). */
(function () {
  'use strict';
  var P = window.SGP, SG = window.SG, Net = window.SGNet, $ = P.$;

  /* ---------- связь ---------- */
  function me() { return P.state && P.state.account; }
  function C() { return (P.game && P.game.chat) || SG.DEFAULT_CHAT; }
  var BOSS = '@boss';   // мастер в чатах («Руководитель», П-40)
  /* Кто написал — так, как видит этот телефон: {acc, name, anon, sys, real}. */
  function ident(o) {
    var b = o.body || {}, f = o.from || {};
    if (o.kind === 'notify' || b.sys || f.role === 'center' || f.role === 'terminal') return { sys: true };
    if (f.role === 'master' && b.as) return { acc: b.as.acc || null, name: b.as.name || '', real: f.acc };
    if (f.role === 'master' && !f.acc) return { acc: BOSS, name: C().master };   // старый пульт без «от имени»
    if (b.anon || f.anon) return { anon: true, real: f.acc, name: f.name };
    return { acc: f.acc, name: f.name };
  }
  function own(o) { var f = o.from || {}, w = ident(o); return !!me() && (w.acc === me() || (!w.acc && f.acc === me() && f.role !== 'master') || (w.anon && w.real === me())); }
  function chanOf(o) {
    var w = ident(o);
    if (w.sys) return 'sys';
    if ((o.to || []).indexOf('all') >= 0) return 'all';
    if (!own(o)) return w.anon ? 'anon' : w.acc ? 'acc:' + w.acc : 'all';
    var t = (o.to || []).filter(function (x) { return /^acc:/.test(x); })[0];
    return t || 'all';
  }
  function store(o) {
    if (!P.acc()) return;
    var m = P.mine();
    var b = o.body || {};
    if (o.id && m.chat.some(function (x) { return x.id === o.id; })) {
      m.chat.forEach(function (x) { if (x.id === o.id) { x.seq = o.seq || x.seq; x.wait = false; x.later = 0; } });
    } else {
      var w = ident(o);
      m.chat.push({ id: o.id, seq: o.seq || 0, at: o.at ? o.at - Net.offset : Date.now(), ch: chanOf(o), own: own(o),
        from: { acc: w.acc || null, name: w.anon ? '' : w.name || '', anon: !!w.anon, role: (o.from || {}).role },
        text: o.kind === 'notify' ? [b.title, b.text].filter(Boolean).join('\n') : b.text || '', photo: b.photo || '', wait: !!o.wait, later: o.later || 0 });
      if (m.chat.length > 400) m.chat.splice(0, m.chat.length - 400);
    }
    P.saveSoon();
    render();
    if (open) drawView();
  }
  function isOwn(x) { return x.own != null ? x.own : x.from.acc === me(); }
  P.on('msg', function (o) {
    if (o.kind !== 'chat' && o.kind !== 'notify') return;
    if (!P.acc()) return;
    var mineMsg = own(o);
    if (!mineMsg && !P.toMe(o.to)) return;
    store(o);
    if (o.kind === 'chat' && !mineMsg && !(open === chanOf(o))) {
      P.sound('note');
      if (navigator.vibrate) navigator.vibrate(80);
    }
  });
  Net.on('ack', function (a) {
    if (!P.acc()) return;
    P.mine().chat.forEach(function (x) {
      if (x.id !== a.id) return;
      x.wait = false;
      if (a.later) x.later = a.at - Net.offset;
      else { x.seq = a.seq; x.later = 0; }
    });
    P.saveSoon();
    if (open) drawView();
  });
  // мастер удалил отложенное сообщение — у отправителя оно пропадает (П-43)
  Net.on('dropped', function (d) {
    if (!P.acc()) return;
    var m = P.mine(), n = m.chat.length;
    m.chat = m.chat.filter(function (x) { return x.id !== d.id; });
    if (m.chat.length !== n) { P.saveSoon(); render(); if (open) drawView(); }
  });

  function contacts() {
    var g = P.game;
    return g.accounts.filter(function (a) { return a.id !== me() && a.modules.indexOf('chat') >= 0; });
  }
  /* Каналы: общий, система, контакты; мастер — если виден игрокам или написал; «неизвестные» — если есть. */
  function channels() {
    var m = P.mine(), list = ['all', 'sys'];
    if (C().masterContact || m.chat.some(function (x) { return x.ch === 'acc:' + BOSS; })) list.push('acc:' + BOSS);
    contacts().forEach(function (a) { list.push('acc:' + a.id); });
    m.chat.forEach(function (x) { if (list.indexOf(x.ch) < 0 && x.ch !== 'acc:' + me()) list.push(x.ch); });
    return list;
  }
  function chanName(ch) {
    if (ch === 'all') return 'ОБЩИЙ КАНАЛ';
    if (ch === 'sys') return 'СИСТЕМА';
    if (ch === 'anon') return (C().anon || 'НЕИЗВЕСТНЫЙ').toUpperCase();
    if (ch === 'acc:' + BOSS) return C().master + (C().masterProf ? ' · ' + C().masterProf : '');
    var a = SG.byId(P.game.accounts, ch.slice(4));
    if (a) return a.name + (a.profession ? ' · ' + a.profession : '');
    var last = P.mine().chat.filter(function (x) { return x.ch === ch && x.from.name; }).slice(-1)[0];
    return last ? last.from.name : '?';
  }
  function unread(ch) {
    var m = P.mine(), seen = m.chatSeen[ch] || 0;
    return m.chat.filter(function (x) { return x.ch === ch && x.at > seen && !isOwn(x); }).length;
  }
  function render() {
    var box = $('tab-chat');
    if (!box || !P.acc()) return;
    var m = P.mine();
    box.innerHTML = '<p class="tab-title">СВЯЗЬ</p>';
    if (!Net.url) {
      var w = document.createElement('p');
      w.className = 'hint center-t';
      w.textContent = 'НЕТ ПОДКЛЮЧЕНИЯ К СЕТИ. Мастер подключает телефон QR-кодом «СЕТЬ».';
      box.appendChild(w);
    }
    var chs = channels();
    chs.forEach(function (ch) {
      var last = m.chat.filter(function (x) { return x.ch === ch; }).slice(-1)[0];
      var n = unread(ch);
      var el = document.createElement('button');
      el.className = 'item chan';
      el.innerHTML = '<span class="ic">' + (ch === 'sys' ? '◆' : ch === 'all' ? '≋' : ch === 'anon' ? '?' : '◉') + '</span><span class="t"><span class="cn"></span><span class="lm"></span></span>' +
        (n ? '<span class="new">' + n + '</span>' : '');
      el.querySelector('.cn').textContent = chanName(ch);
      el.querySelector('.lm').textContent = last ? (last.photo ? '[снимок]' : SG.jam(last.text, P.jamLevel(), last.seq || last.at)).slice(0, 60) : '';
      el.addEventListener('click', function () { openChan(ch); });
      box.appendChild(el);
    });
    var tab = document.querySelector('#tabs button[data-tab=chat]');
    var total = chs.reduce(function (s, ch) { return s + unread(ch); }, 0);
    tab.dataset.n = total || '';
  }
  P.renderChat = render;
  P.on('modules', render);
  P.on('route', function () { if (P.acc()) render(); });
  P.on('net', function () { if (P.acc()) render(); });

  /* ---------- отправка: анонимно (П-42) и отложенно (П-43) ---------- */
  var opt = { anon: false, delay: 0 };
  function optBar() {
    var an = $('chatview-anon'), dl = $('chatview-delay');
    var sa = P.modState('anon'), sd = P.modState('delay');
    an.hidden = sa === 'hidden' || open === 'sys' || open === 'anon';
    dl.hidden = sd === 'hidden' || open === 'sys' || open === 'anon';
    an.classList.toggle('on', opt.anon);
    an.classList.toggle('broken', sa !== 'on');
    dl.classList.toggle('on', !!opt.delay);
    dl.classList.toggle('broken', sd !== 'on');
    dl.textContent = opt.delay ? '⏱' + opt.delay : '⏱';
  }
  function modDenied(id) {
    var st = P.modState(id);
    if (st === 'on') return false;
    P.dialog({ title: st === 'broken' ? P.game.texts.broken : P.game.texts.denied, warn: true });
    P.sound('err');
    return true;
  }
  $('chatview-anon').addEventListener('click', function () {
    if (modDenied('anon')) return;
    opt.anon = !opt.anon;
    P.sound('key');
    optBar();
  });
  $('chatview-delay').addEventListener('click', function () {
    if (modDenied('delay')) return;
    var max = C().delayMax || 60;
    var row = [1, 5, 10, 15, 30, 60].filter(function (n) { return n <= max; });
    if (row.indexOf(max) < 0) row.push(max);
    var inp = document.createElement('input');
    inp.type = 'number'; inp.min = 1; inp.max = max; inp.className = 'cin'; inp.value = opt.delay || '';
    inp.placeholder = '1–' + max;
    var box = document.createElement('div');
    var hint = document.createElement('p');
    hint.textContent = 'Через сколько минут (1–' + max + ') уйдёт следующее сообщение. Его отправит центр сети — даже если этот телефон погаснет.';
    box.appendChild(hint);
    box.appendChild(inp);
    P.dialog({ title: 'ОТПРАВИТЬ ЧЕРЕЗ…', html: box,
      buttons: row.map(function (n) { return { label: n + ' мин', cls: 'dim', fn: function () { opt.delay = n; optBar(); } }; }).concat([
        { label: 'Своё число', fn: function () { var n = Math.round(+inp.value); if (n >= 1) { opt.delay = Math.min(max, n); optBar(); } } },
        { label: 'Сразу', cls: 'dim', fn: function () { opt.delay = 0; optBar(); } }]) });
  });

  var open = null;
  function openChan(ch) {
    open = ch;
    opt = { anon: false, delay: 0 };
    $('chatview-title').textContent = chanName(ch);
    $('chatview-send').style.display = ch === 'sys' || ch === 'anon' ? 'none' : '';
    optBar();
    drawView();
    P.pushLayer('chatview', function () { open = null; render(); });
  }
  P.openChan = openChan;
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function drawView() {
    var m = P.mine();
    var list = $('chatview-list');
    list.innerHTML = '';
    var jam = P.jamLevel();
    m.chat.filter(function (x) { return x.ch === open; }).forEach(function (x) {
      var d = document.createElement('div');
      var mineX = isOwn(x);
      d.className = 'msg' + (mineX ? ' own' : '') + (x.ch === 'sys' ? ' sys' : '');
      var who = mineX ? 'ВЫ' + (x.from.anon ? ' (АНОНИМНО)' : '') : x.from.anon ? (C().anon || 'НЕИЗВЕСТНЫЙ').toUpperCase() :
        (x.from.name || (x.from.role === 'master' ? C().master : '?'));
      var when = x.later ? '⏱ ' + hhmm(x.later) : hhmm(x.at) + (x.wait ? ' ⌛' : '');
      d.innerHTML = '<div class="mh"><span></span><span></span></div><div class="mt"></div>';
      d.querySelector('.mh span').textContent = open === 'sys' ? '' : who;
      d.querySelectorAll('.mh span')[1].textContent = when;
      d.querySelector('.mt').textContent = SG.jam(x.text, jam, x.seq || x.at);
      if (x.photo) {
        var im = document.createElement('img');
        im.src = x.photo;
        im.addEventListener('click', function () { P.zoom(x.photo); });
        d.appendChild(im);
      }
      list.appendChild(d);
    });
    list.scrollTop = list.scrollHeight;
    m.chatSeen[open] = Date.now();
    P.saveSoon();
  }
  function sendChat(ch, text, photo, o) {
    o = o || {};
    if (!Net.url) { P.dialog({ title: P.game.texts.offline, warn: true, text: 'Телефон не подключён к сети.' }); return false; }
    var to = ch === 'all' ? ['all'] : [ch];
    var body = { text: text || '' };
    if (photo) body.photo = photo;
    if (o.anon) body.anon = true;
    var a = P.acc();
    var at = o.delay ? Net.now() + o.delay * 60000 : 0;
    var id = Net.msg(to, 'chat', body, at ? { at: at } : null);
    store({ id: id, kind: 'chat', to: to, from: { acc: me(), name: a.name }, body: body, wait: true, later: at ? at - Net.offset : 0 });
    P.sound('key');
    return true;
  }
  P.sendChat = sendChat;
  function go() {
    var inp = $('chatview-input');
    var t = inp.value.trim();
    if (!t || !open) return;
    if (opt.anon && P.modState('anon') !== 'on') opt.anon = false;
    if (opt.delay && P.modState('delay') !== 'on') opt.delay = 0;
    if (sendChat(open, t, '', opt)) { inp.value = ''; opt = { anon: false, delay: 0 }; optBar(); }
  }
  $('chatview-go').addEventListener('click', go);
  $('chatview-input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
  $('chatview-back').addEventListener('click', function () { P.closeTop(); });

  /* ---------- только набор вручную (П-41): без вставки и копирования ---------- */
  function noPaste() { return C().noPaste !== false; }
  function refuse(e) {
    if (!noPaste()) return;
    e.preventDefault();
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = P.game.texts.noPaste;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1600);
    P.sound('err');
  }
  var ci = $('chatview-input');
  ['paste', 'drop'].forEach(function (t) { ci.addEventListener(t, refuse); });
  ci.addEventListener('beforeinput', function (e) {
    if (!noPaste()) return;
    // вставка из меню или буфера клавиатуры: длинный кусок текста разом (слово-подсказка короче)
    if (/^insertFrom(Paste|Drop|Yank)/.test(e.inputType || '') || (e.inputType === 'insertText' || e.inputType === 'insertReplacementText') && e.data && e.data.length > 14) refuse(e);
  });
  var lastVal = '';
  ci.addEventListener('input', function () {
    // запасной путь, если клавиатура вставила текст без beforeinput
    if (noPaste() && ci.value.length - lastVal.length > 14) { ci.value = lastVal; refuse({ preventDefault: function () {} }); }
    lastVal = ci.value;
  });
  ci.addEventListener('focus', function () { lastVal = ci.value; });
  $('chatview-list').addEventListener('copy', function (e) { if (noPaste()) e.preventDefault(); });
  $('chatview-list').addEventListener('contextmenu', function (e) { if (noPaste()) e.preventDefault(); });

  /* ---------- камера-улика (М8) ---------- */
  var raf = 0;
  function photoCfg() { return P.game.photo || {}; }
  function hexRgb(h) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ''); var n = m ? parseInt(m[1], 16) : 0x33ff66; return [n >> 16, (n >> 8) & 255, n & 255]; }
  function stylize(src, cv, w) {
    var cfg = photoCfg();
    var vw = src.videoWidth || src.width, vh = src.videoHeight || src.height;
    if (!vw) return false;
    var hh = Math.round(w * vh / vw);
    cv.width = w; cv.height = hh;
    var x = cv.getContext('2d', { willReadFrequently: true });
    var px = Math.max(1, +cfg.pixel || 1);
    var sw = Math.max(16, Math.round(w / px)), sh = Math.max(12, Math.round(hh / px));
    var tmp = stylize.tmp || (stylize.tmp = document.createElement('canvas'));
    tmp.width = sw; tmp.height = sh;
    var tx = tmp.getContext('2d', { willReadFrequently: true });
    tx.drawImage(src, 0, 0, sw, sh);
    var d = tx.getImageData(0, 0, sw, sh), a = d.data;
    var tint = hexRgb(cfg.tint);
    for (var i = 0; i < a.length; i += 4) {
      var l = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) / 255;
      if (cfg.grain) l = Math.max(0, Math.min(1, l + (Math.random() - 0.5) * 0.18));
      if (cfg.mono !== false) { a[i] = tint[0] * l; a[i + 1] = tint[1] * l; a[i + 2] = tint[2] * l; }
      else { a[i] = a[i] * 0.6 + tint[0] * l * 0.4; a[i + 1] = a[i + 1] * 0.6 + tint[1] * l * 0.4; a[i + 2] = a[i + 2] * 0.6 + tint[2] * l * 0.4; }
    }
    tx.putImageData(d, 0, 0);
    x.imageSmoothingEnabled = false;
    x.drawImage(tmp, 0, 0, w, hh);
    if (cfg.scan) { x.fillStyle = 'rgba(0,0,0,.28)'; for (var y = 0; y < hh; y += 3) x.fillRect(0, y, w, 1); }
    if (cfg.stamp) {
      var fs = Math.round(w / 26);
      x.font = 'bold ' + fs + 'px Consolas, monospace';
      x.fillStyle = 'rgb(' + tint.join(',') + ')';
      var dt = new Date();
      x.fillText((cfg.stampText || '') + '  ' + dt.toLocaleDateString('ru-RU') + ' ' + dt.toTimeString().slice(0, 8), fs * 0.6, hh - fs * 0.7);
      x.fillText('● REC', w - fs * 5, fs * 1.4);
      x.strokeStyle = x.fillStyle; x.lineWidth = 2;
      var c = fs * 1.2;
      [[c / 2, c / 2, 1, 1], [w - c / 2, c / 2, -1, 1], [c / 2, hh - c / 2, 1, -1], [w - c / 2, hh - c / 2, -1, -1]].forEach(function (k) {
        x.beginPath(); x.moveTo(k[0], k[1] + k[3] * c); x.lineTo(k[0], k[1]); x.lineTo(k[0] + k[2] * c, k[1]); x.stroke();
      });
    }
    return true;
  }
  P.stylize = stylize;
  function loop() {
    var v = $('photo-video');
    stylize(v, $('photo-canvas'), 360);
    raf = requestAnimationFrame(loop);
  }
  P.on('tab', function (t) {
    if (t === 'photo') { P.startCam($('photo-video'), null, null, 'photo'); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); renderPhotos(); }
    else { cancelAnimationFrame(raf); P.stopCam('photo'); }
    if (t === 'chat') render();
    if (t === 'notes') renderNotes();
  });
  $('photo-shot').addEventListener('click', function () {
    var c = document.createElement('canvas');
    if (!stylize($('photo-video'), c, 480)) { P.dialog({ title: 'КАМЕРА НЕДОСТУПНА', warn: true }); return; }
    var m = P.mine();
    m.photos.unshift({ id: SG.uid('f'), at: Date.now(), src: c.toDataURL('image/jpeg', 0.7) });
    if (m.photos.length > 20) m.photos.length = 20;
    P.save();
    P.glitch();
    P.sound('ok');
    renderPhotos();
  });
  function renderPhotos() {
    var box = $('photo-got');
    box.innerHTML = '';
    var list = P.acc() ? P.mine().photos : [];
    $('photo-got-title').style.display = list.length ? '' : 'none';
    list.forEach(function (ph) {
      var f = document.createElement('figure');
      var im = document.createElement('img');
      im.src = ph.src;
      im.addEventListener('click', function () { photoMenu(ph); });
      var cap = document.createElement('figcaption');
      cap.textContent = hhmm(ph.at);
      f.appendChild(im); f.appendChild(cap);
      box.appendChild(f);
    });
  }
  function photoMenu(ph) {
    var box = document.createElement('div');
    var im = document.createElement('img');
    im.src = ph.src;
    im.style.cssText = 'width:100%;border:1px solid var(--dim)';
    box.appendChild(im);
    var btns = [{ label: 'Во весь экран', fn: function () { P.zoom(ph.src); } }];
    if (P.hasModule('chat')) btns.push({ label: 'Отправить в «СВЯЗЬ»', fn: function () {
      P.dialog({ title: 'КОМУ ОТПРАВИТЬ', buttons: ['all'].concat(contacts().map(function (a) { return 'acc:' + a.id; })).map(function (ch) {
        return { label: chanName(ch), fn: function () { if (sendChat(ch, '', ph.src)) P.dialog({ title: 'СНИМОК ОТПРАВЛЕН' }); } };
      }).concat([{ label: 'Отмена', cls: 'dim' }]) });
    } });
    btns.push({ label: 'Удалить', cls: 'warn', fn: function () { var m = P.mine(); m.photos = m.photos.filter(function (x) { return x !== ph; }); P.save(); renderPhotos(); } });
    btns.push({ label: 'Закрыть', cls: 'dim' });
    P.dialog({ title: 'СНИМОК ' + hhmm(ph.at), html: box, buttons: btns });
  }

  /* ---------- заметки игрока (М9) ---------- */
  function renderNotes() {
    var box = $('tab-notes');
    if (!P.acc()) return;
    var m = P.mine();
    box.innerHTML = '<p class="tab-title">ЗАМЕТКИ</p>';
    var add = document.createElement('button');
    add.className = 'btn';
    add.textContent = '+ НОВАЯ ЗАМЕТКА';
    add.addEventListener('click', function () { var n = { id: SG.uid('n'), at: Date.now(), text: '' }; m.notes.unshift(n); P.save(); editNote(n); });
    box.appendChild(add);
    m.notes.forEach(function (n) {
      var el = document.createElement('button');
      el.className = 'item note';
      el.innerHTML = '<span class="ic">✎</span><span class="t"></span><span class="sm"></span>';
      el.querySelector('.t').textContent = (n.text.split('\n')[0] || '(пусто)').slice(0, 60);
      el.querySelector('.sm').textContent = hhmm(n.at);
      el.addEventListener('click', function () { editNote(n); });
      box.appendChild(el);
    });
  }
  function editNote(n) {
    var ta = document.createElement('textarea');
    ta.className = 'note-ed';
    ta.value = n.text;
    ta.rows = 10;
    ta.addEventListener('input', function () { n.text = ta.value; n.at = Date.now(); P.saveSoon(); });
    P.dialog({ title: 'ЗАМЕТКА', html: ta, buttons: [
      { label: 'Готово', fn: renderNotes },
      { label: 'Удалить', cls: 'warn', fn: function () { var m = P.mine(); m.notes = m.notes.filter(function (x) { return x !== n; }); P.save(); renderNotes(); } }] });
    setTimeout(function () { ta.focus(); }, 80);
  }
})();
