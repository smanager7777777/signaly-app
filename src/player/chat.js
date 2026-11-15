/* СИГНАЛЫ — вкладки «СВЯЗЬ» (чаты, В1–В3), «КАМЕРА» (снимок-улика, М8), «ЗАМЕТКИ» (М9). */
(function () {
  'use strict';
  var P = window.SGP, SG = window.SG, Net = window.SGNet, $ = P.$;

  /* ---------- связь ---------- */
  function me() { return P.state && P.state.account; }
  function chanOf(o) {
    var b = o.body || {}, f = o.from || {};
    if (o.kind === 'notify' || b.sys || f.role === 'master' || f.role === 'center' || f.role === 'terminal') return 'sys';
    if ((o.to || []).indexOf('all') >= 0) return 'all';
    if (f.acc && f.acc !== me()) return 'acc:' + f.acc;
    var t = (o.to || []).filter(function (x) { return /^acc:/.test(x); })[0];
    return t || 'all';
  }
  function store(o) {
    if (!P.acc()) return;
    var m = P.mine();
    var b = o.body || {};
    if (o.id && m.chat.some(function (x) { return x.id === o.id; })) {
      m.chat.forEach(function (x) { if (x.id === o.id) { x.seq = o.seq || x.seq; x.wait = false; } });
    } else {
      m.chat.push({ id: o.id, seq: o.seq || 0, at: o.at ? o.at - Net.offset : Date.now(), ch: chanOf(o), from: o.from || {},
        text: o.kind === 'notify' ? [b.title, b.text].filter(Boolean).join('\n') : b.text || '', photo: b.photo || '', wait: !!o.wait });
      if (m.chat.length > 400) m.chat.splice(0, m.chat.length - 400);
    }
    P.saveSoon();
    render();
    if (open) drawView();
  }
  P.on('msg', function (o) {
    if (o.kind !== 'chat' && o.kind !== 'notify') return;
    if (!P.acc()) return;
    var mineMsg = o.from && o.from.acc === me();
    if (!mineMsg && !P.toMe(o.to)) return;
    store(o);
    if (o.kind === 'chat' && !mineMsg && !(open === chanOf(o))) {
      P.sound('note');
      if (navigator.vibrate) navigator.vibrate(80);
    }
  });
  Net.on('ack', function (a) {
    if (!P.acc()) return;
    P.mine().chat.forEach(function (x) { if (x.id === a.id) { x.wait = false; x.seq = a.seq; } });
    if (open) drawView();
  });

  function contacts() {
    var g = P.game;
    return g.accounts.filter(function (a) { return a.id !== me() && a.modules.indexOf('chat') >= 0; });
  }
  function chanName(ch) {
    if (ch === 'all') return 'ОБЩИЙ КАНАЛ';
    if (ch === 'sys') return 'СИСТЕМА';
    var a = SG.byId(P.game.accounts, ch.slice(4));
    return a ? a.name + (a.profession ? ' · ' + a.profession : '') : '?';
  }
  function unread(ch) {
    var m = P.mine(), seen = m.chatSeen[ch] || 0;
    return m.chat.filter(function (x) { return x.ch === ch && x.at > seen && x.from.acc !== me(); }).length;
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
    ['all', 'sys'].concat(contacts().map(function (a) { return 'acc:' + a.id; })).forEach(function (ch) {
      var last = m.chat.filter(function (x) { return x.ch === ch; }).slice(-1)[0];
      var n = unread(ch);
      var el = document.createElement('button');
      el.className = 'item chan';
      el.innerHTML = '<span class="ic">' + (ch === 'sys' ? '◆' : ch === 'all' ? '≋' : '◉') + '</span><span class="t"><span class="cn"></span><span class="lm"></span></span>' +
        (n ? '<span class="new">' + n + '</span>' : '');
      el.querySelector('.cn').textContent = chanName(ch);
      el.querySelector('.lm').textContent = last ? (last.photo ? '[снимок]' : SG.jam(last.text, P.jamLevel(), last.seq || last.at)).slice(0, 60) : '';
      el.addEventListener('click', function () { openChan(ch); });
      box.appendChild(el);
    });
    var tab = document.querySelector('#tabs button[data-tab=chat]');
    var total = ['all', 'sys'].concat(contacts().map(function (a) { return 'acc:' + a.id; })).reduce(function (s, ch) { return s + unread(ch); }, 0);
    tab.dataset.n = total || '';
  }
  P.renderChat = render;
  P.on('modules', render);
  P.on('route', function () { if (P.acc()) render(); });
  P.on('net', function () { if (P.acc()) render(); });

  var open = null;
  function openChan(ch) {
    open = ch;
    $('chatview-title').textContent = chanName(ch);
    $('chatview-send').style.display = ch === 'sys' ? 'none' : '';
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
      d.className = 'msg' + (x.from.acc === me() ? ' own' : '') + (x.ch === 'sys' ? ' sys' : '');
      var who = x.from.acc === me() ? 'ВЫ' : (x.from.name || (x.from.role === 'master' ? 'СИСТЕМА' : '?'));
      d.innerHTML = '<div class="mh"><span></span><span>' + hhmm(x.at) + (x.wait ? ' ⌛' : '') + '</span></div><div class="mt"></div>';
      d.querySelector('.mh span').textContent = open === 'sys' ? '' : who;
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
  function sendChat(ch, text, photo) {
    if (!Net.url) { P.dialog({ title: P.game.texts.offline, warn: true, text: 'Телефон не подключён к сети.' }); return false; }
    var to = ch === 'all' ? ['all'] : [ch];
    var body = { text: text || '' };
    if (photo) body.photo = photo;
    var a = P.acc();
    var id = Net.msg(to, 'chat', body);
    store({ id: id, kind: 'chat', to: to, from: { acc: me(), name: a.name }, body: body, wait: true });
    P.sound('key');
    return true;
  }
  P.sendChat = sendChat;
  function go() {
    var inp = $('chatview-input');
    var t = inp.value.trim();
    if (!t || !open) return;
    if (sendChat(open, t)) inp.value = '';
  }
  $('chatview-go').addEventListener('click', go);
  $('chatview-input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
  $('chatview-back').addEventListener('click', function () { P.closeTop(); });

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
