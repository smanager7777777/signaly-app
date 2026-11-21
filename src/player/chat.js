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
        text: o.kind === 'notify' ? [b.title, b.text].filter(Boolean).join('\n') : b.text || '', photo: b.photo || '', color: SG.hexOk(b.color), wait: !!o.wait, later: o.later || 0,
        enc: o.kind === 'chat' && !b.sys && decodeSec() > 0 });   // глава с «расшифровкой» (П-56)
      if (m.chat.length > 400) m.chat.splice(0, m.chat.length - 400);
    }
    P.saveSoon();
    render();
    if (open) drawView();
  }
  function decodeSec() { var ch = P.game && P.game.chapters[(P.state.chapter || 1) - 1]; return ch ? ch.decode || 0 : 0; }
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
  // мастер удалил отложенное сообщение — у отправителя оно «висит» с ⏱, как будто ещё уйдёт: удаление тайное (П-57, ответ Ч2)
  Net.on('dropped', function (d) {
    if (!P.acc()) return;
    P.mine().chat.forEach(function (x) { if (x.id === d.id) x.dropped = true; });
    P.saveSoon();
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
      el.querySelector('.lm').textContent = last ? (last.photo ? '[снимок]' : last.enc && !last.dec ? bits(last.text, 0, last.id) : SG.jam(last.text, P.jamLevel(), last.seq || last.at)).slice(0, 60) : '';
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
    var cam = $('chatview-cam'), sp = P.modState('photo');
    cam.hidden = sp === 'hidden' || open === 'sys' || open === 'anon';
    cam.classList.toggle('broken', sp !== 'on');
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
    if (P.kbdMode() !== 'sys') {
      inp.type = 'text'; inp.maxLength = 3;
      var k = P.attachKbd(inp, inp, { start: 'sym', open: false });
      if (k) k.classList.add('kbd-sym');
    }
    P.dialog({ title: 'ОТПРАВИТЬ ЧЕРЕЗ…', html: box,
      buttons: row.map(function (n) { return { label: n + ' мин', cls: 'dim', fn: function () { opt.delay = n; optBar(); } }; }).concat([
        { label: 'Своё число', fn: function () { var n = Math.round(+inp.value); if (n >= 1) { opt.delay = Math.min(max, n); optBar(); } } },
        { label: 'Сразу', cls: 'dim', fn: function () { opt.delay = 0; optBar(); } }]) });
  });

  var open = null, chatKbd = null, chatKbdMode = '';
  function openChan(ch) {
    open = ch;
    opt = { anon: false, delay: 0 };
    // своя клавиатура (П-54): создаётся при первом открытии и при смене настройки в пакете
    if (chatKbdMode !== P.kbdMode()) {
      if (chatKbd) chatKbd.remove();
      chatKbdMode = P.kbdMode();
      chatKbd = P.attachKbd($('chatview-input'), $('chatview-send'), { auto: true, enter: go,
        onShow: function () { var l = $('chatview-list'); setTimeout(function () { l.scrollTop = l.scrollHeight; }, 0); } });
    }
    if (chatKbd) chatKbd.hidden = true;
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
    dec.list = [];
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
      var real = SG.jam(x.text, jam, x.seq || x.at);
      d.querySelector('.mt').textContent = real;
      if (x.enc && !x.dec && real) decoding(x, d.querySelector('.mt'), real);
      // цвет в чужих чатах (П-51): закреплённый у отправителя; Руководитель и анонимные — цветом из «Связи»; иначе — цвет читающего
      var col = !mineX && msgColor(x);
      if (col) {
        d.classList.add('tinted');
        if (dark(col)) d.classList.add('inv');
        d.style.borderColor = col;
        if (!dark(col)) { d.querySelector('.mh span').style.color = col; d.querySelector('.mt').style.color = col; }
      }
      if (x.photo) {
        var im = document.createElement('img');
        P.tintPhoto(im, x.photo, col && !dark(col) ? col : '');
        if (col) im.style.borderColor = col;
        im.addEventListener('click', function () { P.zoom(im.src); });
        d.appendChild(im);
      }
      list.appendChild(d);
    });
    list.scrollTop = list.scrollHeight;
    m.chatSeen[open] = Date.now();
    P.saveSoon();
  }
  function msgColor(x) {
    var c = C();
    if (x.from.anon) return SG.paletteColor(P.game, c.anonColor) || '';
    if (x.from.acc === BOSS || (x.ch === 'sys' && x.from.role === 'master')) return SG.paletteColor(P.game, c.bossColor) || x.color;
    return x.color;
  }
  function dark(hex) { var c = SG.rgbOf(hex); return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11 < 60; }
  /* «Расшифровка» (П-56): текст сначала из 0 и 1, буквы проступают по одной за N секунд; один раз на сообщение. */
  var dec = { list: [], t: 0, start: {} };
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul ? Math.imul(h, 16777619) : (h * 16777619) | 0; } return h >>> 0; }
  function bits(text, p, id) {
    var r = '', seed = hash(String(id || ''));
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (/\s/.test(c)) { r += c; continue; }
      var th = ((seed ^ Math.imul(i + 1, 2654435761)) >>> 0) / 4294967296;   // когда проступает эта буква (0…1)
      r += p >= 0.15 + th * 0.85 ? c : Math.random() < 0.5 ? '0' : '1';
    }
    return r;
  }
  function decoding(x, el, real) {
    var now = Date.now();
    if (!dec.start[x.id]) dec.start[x.id] = now;
    dec.list.push({ x: x, el: el, real: real });
    el.textContent = bits(real, (now - dec.start[x.id]) / (decodeSec() * 1000 || 1), x.id);
    el.classList.add('enc');
    if (!dec.t) dec.t = setInterval(decTick, 90);
  }
  function decTick() {
    var T = (decodeSec() || 8) * 1000, now = Date.now(), left = [];
    dec.list.forEach(function (d) {
      var p = (now - dec.start[d.x.id]) / T;
      if (p >= 1 || !d.el.isConnected) {
        if (p >= 1) { d.el.textContent = d.real; d.el.classList.remove('enc'); d.x.dec = true; P.saveSoon(); }
        return;
      }
      d.el.textContent = bits(d.real, p, d.x.id);
      left.push(d);
    });
    dec.list = left;
    if (!left.length) { clearInterval(dec.t); dec.t = 0; }
  }
  function sendChat(ch, text, photo, o) {
    o = o || {};
    if (!Net.url) { P.dialog({ title: P.game.texts.offline, warn: true, text: 'Телефон не подключён к сети.' }); return false; }
    var to = ch === 'all' ? ['all'] : [ch];
    var body = { text: text || '' };
    if (photo) body.photo = photo;
    if (o.anon) body.anon = true;
    var col = P.sendHex();
    if (col && !o.anon) body.color = col;   // анонимное — без цвета: по нему узнали бы отправителя
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

  /* ---------- камера-улика (М8): вкладка, галерея, кнопка ▣ в чате (П-47), фронтальная камера (П-48) ---------- */
  var raf = 0, facing = 'environment';
  function photoCfg() { return P.game.photo || {}; }
  function hexRgb(h) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ''); var n = m ? parseInt(m[1], 16) : 0x33ff66; return [n >> 16, (n >> 8) & 255, n & 255]; }
  /* Оттенок снимка: цвет персонажа (П-50), если он задан, иначе — из «Общее» → «Камера-улика». */
  function tintNow() {
    var g = P.game;
    var id = P.acc() ? SG.effColor(g, P.acc(), P.state.chapter, { color: P.mine().color, colorCh: P.mine().colorCh, colorBy: P.mine().colorBy }) : '';
    return SG.paletteColor(g, id) || photoCfg().tint;
  }
  function stylize(src, cv, w, mirror, opts) {
    opts = opts || {};
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
    if (mirror) { tx.save(); tx.translate(sw, 0); tx.scale(-1, 1); tx.drawImage(src, 0, 0, sw, sh); tx.restore(); }
    else tx.drawImage(src, 0, 0, sw, sh);
    var d = tx.getImageData(0, 0, sw, sh), a = d.data;
    // одноцветный снимок хранится без оттенка (П-49), оттенок — при показе; цветной режим — как раньше
    var tint = cfg.mono !== false && !opts.colored ? [255, 255, 255] : hexRgb(tintNow());
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
  function shoot(video) {
    var c = document.createElement('canvas');
    if (!stylize(video, c, 480, facing === 'user')) return null;
    var ph = { id: SG.uid('f'), at: Date.now(), src: c.toDataURL('image/jpeg', 0.7), gray: photoCfg().mono !== false };
    var m = P.mine();
    m.photos.unshift(ph);
    if (m.photos.length > 20) m.photos.length = 20;
    P.save();
    P.hook('photo', ph.id);   // П16: событие телефона «сделан снимок»
    return ph;
  }
  function sendPhoto(ch, ph, o) { return Promise.resolve(sendChat(ch, '', ph.src, o)); }
  function loop() {
    var v = $('photo-video');
    stylize(v, $('photo-canvas'), 360, facing === 'user', { colored: true });
    raf = requestAnimationFrame(loop);
  }
  function camStart() { P.startCam($('photo-video'), null, null, 'photo', facing); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
  P.on('tab', function (t) {
    if (t === 'photo') { camStart(); renderPhotos(); }
    else { cancelAnimationFrame(raf); P.stopCam('photo'); }
    if (t === 'chat') render();
    if (t === 'notes') renderNotes();
  });
  $('photo-flip').addEventListener('click', function () {
    facing = facing === 'user' ? 'environment' : 'user';
    P.sound('key');
    camStart();
  });
  $('photo-shot').addEventListener('click', function () {
    if (!shoot($('photo-video'))) { P.dialog({ title: 'КАМЕРА НЕДОСТУПНА', warn: true }); return; }
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
      if (ph.gray) P.tintPhoto(im, ph.src); else im.src = ph.src;
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
    if (ph.gray) P.tintPhoto(im, ph.src); else im.src = ph.src;
    im.style.cssText = 'width:100%;border:1px solid var(--dim)';
    box.appendChild(im);
    var btns = [{ label: 'Во весь экран', fn: function () { P.zoom(im.src); } }];
    if (P.hasModule('chat')) btns.push({ label: 'Отправить в «СВЯЗЬ»', fn: function () {
      P.dialog({ title: 'КОМУ ОТПРАВИТЬ', buttons: ['all'].concat(contacts().map(function (a) { return 'acc:' + a.id; })).map(function (ch) {
        return { label: chanName(ch), fn: function () { sendPhoto(ch, ph).then(function (ok) { if (ok) P.dialog({ title: 'СНИМОК ОТПРАВЛЕН' }); }); } };
      }).concat([{ label: 'Отмена', cls: 'dim' }]) });
    } });
    btns.push({ label: 'Удалить', cls: 'warn', fn: function () { var m = P.mine(); m.photos = m.photos.filter(function (x) { return x !== ph; }); P.save(); renderPhotos(); } });
    btns.push({ label: 'Закрыть', cls: 'dim' });
    P.dialog({ title: 'СНИМОК ' + hhmm(ph.at), html: box, buttons: btns });
  }

  /* Кнопка ▣ в чате: сразу камера; «СНИМОК» — снято и отправлено в этот чат (с «?» и «⏱», если они включены). */
  var lay = { raf: 0 };
  function layLoop() {
    stylize($('camlay-video'), $('camlay-canvas'), 360, facing === 'user', { colored: true });
    lay.raf = requestAnimationFrame(layLoop);
  }
  function layLive() {
    P.startCam($('camlay-video'), null, null, 'chatcam', facing);
    cancelAnimationFrame(lay.raf);
    lay.raf = requestAnimationFrame(layLoop);
  }
  function layStop() { cancelAnimationFrame(lay.raf); P.stopCam('chatcam'); }
  $('chatview-cam').addEventListener('click', function () {
    if (modDenied('photo')) return;
    P.sound('key');
    $('camlay-title').textContent = 'СНИМОК → ' + chanName(open);
    $('camlay-hint').textContent = 'Снимок сразу уйдёт в этот чат' + (opt.anon ? ', анонимно' : '') + (opt.delay ? ', через ' + opt.delay + ' мин' : '') + '. Он сохранится и во вкладке «КАМЕРА».';
    P.pushLayer('camlay', layStop);
    layLive();
  });
  $('camlay-back').addEventListener('click', function () { P.closeTop(); });
  $('camlay-flip').addEventListener('click', function () { facing = facing === 'user' ? 'environment' : 'user'; P.sound('key'); layLive(); });
  // мгновенный снимок (П-47): нажали — снято и отправлено в этот чат; выбрать из галереи — во вкладке «КАМЕРА»
  $('camlay-take').addEventListener('click', function () {
    var ph = shoot($('camlay-video'));
    if (!ph) { P.dialog({ title: 'КАМЕРА НЕДОСТУПНА', warn: true }); return; }
    if (!open) return;
    P.glitch();
    var ch = open, o = opt;
    if (o.anon && P.modState('anon') !== 'on') o.anon = false;
    if (o.delay && P.modState('delay') !== 'on') o.delay = 0;
    P.closeTop();
    sendPhoto(ch, ph, o).then(function (ok) { if (ok) { opt = { anon: false, delay: 0 }; optBar(); } });
  });

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
      el.addEventListener('click', function () { if (n.pack) viewNote(n); else editNote(n); });
      box.appendChild(el);
    });
  }
  /* П17: заметка из пакета (длинная памятка) — сначала читать, править — кнопкой. */
  function viewNote(n) {
    var v = document.createElement('div');
    v.className = 'note-view';
    v.textContent = n.text;
    var bt = [{ label: 'Готово', fn: renderNotes }, { label: 'Править', cls: 'dim', fn: function () { setTimeout(function () { editNote(n); }, 0); } }];
    // П20 (Т9-6 Б, Т11-5 А, Т16): у тестировщика — «Отправить мастеру»: весь текст + сборка, персонаж, время → «ПЕРЕПИСКА» пульта
    var a = P.acc();
    if (a && a.tester) {
      var st = document.createElement('p');
      st.className = 'hint rep-state';
      st.textContent = repText(n);
      v.appendChild(st);
      bt.splice(1, 0, { label: 'Отправить мастеру', cls: 'dim', fn: function () { sendReport(n); setTimeout(function () { viewNote(n); }, 0); } });
    }
    P.dialog({ title: (n.text.split('\n')[0] || 'ЗАМЕТКА').slice(0, 40), html: v, buttons: bt });
  }
  function repText(n) {
    var r = n.rep;
    if (!r) return 'Мастеру ещё не отправлялась.';
    return (r.ok ? 'Отправлено мастеру ✓ ' : 'Ждёт связи… (отправится сама) ') + hhmm(r.at);
  }
  function sendReport(n) {
    var a = P.acc();
    var body = { text: n.text, report: { build: window.SG_APP_VERSION || '', title: (n.text.split('\n')[0] || '').slice(0, 80), acc: P.state.account, name: a ? a.name : '', at: Date.now() } };
    n.rep = { at: Date.now(), ok: false, body: body };
    if (Net.url) n.rep.id = Net.msg(['role:master'], 'report', body);
    P.save();
  }
  Net.on('welcome', function () {
    // без связи кнопку нажали — отправить, как только центр на связи
    if (!P.acc()) return;
    (P.mine().notes || []).forEach(function (n) { if (n.rep && !n.rep.ok && !n.rep.id && n.rep.body) { n.rep.id = Net.msg(['role:master'], 'report', n.rep.body); P.saveSoon(); } });
  });
  Net.on('ack', function (ak) {
    if (!P.acc()) return;
    (P.mine().notes || []).forEach(function (n) {
      if (!n.rep || n.rep.id !== ak.id) return;
      n.rep.ok = true; n.rep.at = Date.now(); P.saveSoon();
      var st = document.querySelector('#dlg.on .rep-state');
      if (st) st.textContent = repText(n);
    });
  });
  function editNote(n) {
    var ta = document.createElement('textarea');
    ta.className = 'note-ed';
    ta.value = n.text;
    ta.rows = P.kbdMode() === 'sys' ? 10 : 6;
    ta.addEventListener('input', function () { n.text = ta.value; n.at = Date.now(); P.saveSoon(); });
    var wrap = document.createElement('div');
    wrap.appendChild(ta);
    P.attachKbd(ta, ta, { auto: true, open: true, newline: true });
    P.dialog({ title: 'ЗАМЕТКА', html: wrap, buttons: [
      { label: 'Готово', fn: renderNotes },
      { label: 'Удалить', cls: 'warn', fn: function () { var m = P.mine(); m.notes = m.notes.filter(function (x) { return x !== n; }); if (n.pack) { m.packGone = m.packGone || {}; m.packGone[n.pack] = true; } P.save(); renderNotes(); } }] });
    setTimeout(function () { ta.focus(); }, 80);
  }
})();
