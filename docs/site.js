/* Erika Brentar portfolio: interactions and case study unlock.
   Case studies are stored encrypted (AES-256-GCM). The password is turned into a key in the
   visitor's browser (PBKDF2-SHA256), and nothing readable ships until it is entered. */
(function () {
  'use strict';
  var root = document.querySelector('.eb');
  var ORDER = [];
  var CFG = null;           // site.json: salt, iterations, studies
  var KEY = null;           // CryptoKey once unlocked
  var cache = {};           // decrypted study payloads
  var imgCache = {};        // image id -> blob URL
  var ov = null, current = null, rect = null, quick = false, glowSeen = false, closeT = 0;
  var PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function ub64(u) { var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- crypto ---------- */
  function config() {
    if (CFG) return Promise.resolve(CFG);
    return fetch('site.json', { cache: 'no-cache' }).catch(function () { throw new Error('load'); }).then(function (r) { if (!r.ok) throw new Error('load'); return r.json(); }).then(function (c) { CFG = c; ORDER = c.studies; return c; });
  }
  function deriveKey(pw) {
    return config().then(function (c) {
      var enc = new TextEncoder();
      return crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveKey']).then(function (base) {
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(c.salt), iterations: c.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
      });
    });
  }
  function decryptBytes(buf) {
    var u = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, KEY, u.slice(12));
  }
  function loadStudy(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    return fetch('cs/' + id + '.bin', { cache: 'no-cache' }).catch(function () { throw new Error('load'); }).then(function (r) { if (!r.ok) throw new Error('load'); return r.arrayBuffer(); })
      .then(function (buf) { return decryptBytes(buf).catch(function () { throw new Error('password'); }); }).then(function (plain) { cache[id] = JSON.parse(new TextDecoder().decode(plain)); return cache[id]; });
  }
  function mimeOf(u) {
    if (u[0] === 0x89 && u[1] === 0x50) return 'image/png';
    if (u[0] === 0x47 && u[1] === 0x49) return 'image/gif';
    if (u[0] === 0x52 && u[1] === 0x49) return 'image/webp';
    return 'image/jpeg';
  }
  function loadImg(id) {
    if (imgCache[id]) return Promise.resolve(imgCache[id]);
    imgCache[id] = fetch('cs/img/' + id + '.bin').then(function (r) { return r.arrayBuffer(); }).then(decryptBytes).then(function (plain) {
      var u = new Uint8Array(plain);
      return URL.createObjectURL(new Blob([u], { type: mimeOf(u) }));
    });
    return imgCache[id];
  }
  function fillImages(scope) {
    scope.querySelectorAll('img[data-img]').forEach(function (img) {
      loadImg(img.getAttribute('data-img')).then(function (url) { img.src = url; }).catch(function () {});
    });
  }
  function restoreKey() {
    var raw = ss('eb-key');
    if (!raw || KEY) return Promise.resolve(!!KEY);
    return crypto.subtle.importKey('raw', b64(raw), { name: 'AES-GCM' }, true, ['decrypt']).then(function (k) { KEY = k; return true; }, function () { ss('eb-key', null); return false; });
  }

  /* ---------- overlay ---------- */
  function clipFor(r) {
    if (!r) return 'inset(0px 0px 0px 0px round 0px)';
    return 'inset(' + r.top + 'px ' + (innerWidth - r.right) + 'px ' + (innerHeight - r.bottom) + 'px ' + r.left + 'px round 28px)';
  }
  function setClip(v, animate) {
    ov.style.transition = animate && !reduced() ? 'clip-path .68s cubic-bezier(.76,0,.24,1), -webkit-clip-path .68s cubic-bezier(.76,0,.24,1)' : 'none';
    ov.style.clipPath = v; ov.style.webkitClipPath = v;
  }
  function cardRect(id) {
    var c = document.getElementById('card-' + id); if (!c) return null;
    var b = c.getBoundingClientRect(); return { top: b.top, right: b.right, bottom: b.bottom, left: b.left };
  }
  function publicTitle(id) { var c = document.querySelector('#card-' + id + ' .ctitle'); return c ? c.textContent.trim() : ''; }

  function open(id) {
    clearTimeout(closeT);
    current = id; quick = false;
    rect = cardRect(id);
    document.querySelectorAll('.card.is-active').forEach(function (c) { c.classList.remove('is-active'); });
    var card = document.getElementById('card-' + id); if (card) card.classList.add('is-active');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'cs-ov'; ov.className = 'ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', publicTitle(id));
    root.appendChild(ov);
    setClip(clipFor(rect), false);
    document.documentElement.classList.add('ov-lock');
    var glow = !glowSeen; glowSeen = true;
    restoreKey().then(function () {
      if (KEY) return loadStudy(id).then(function (d) { renderStudy(d, glow); }, function () { KEY = null; ss('eb-key', null); renderGate(glow); });
      renderGate(glow);
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () { setClip('inset(0px 0px 0px 0px round 0px)', true); }); });
    ov.addEventListener('scroll', onScroll, { passive: true });
    ov.addEventListener('click', onOvClick);
  }

  function close() {
    if (!ov) return;
    clearInterval(coinT); coinT = null;
    var id = current, card = document.getElementById('card-' + id);
    if (card) { try { card.scrollIntoView({ block: 'center' }); } catch (e) {} }
    rect = cardRect(id) || rect;
    var c = ov.querySelector('.ov-content'); if (c) { c.classList.remove('in'); c.classList.add('out'); }
    setClip(clipFor(rect), true);
    closeLightbox();
    var el = ov;
    closeT = setTimeout(function () {
      el.remove(); if (ov === el) ov = null;
      document.documentElement.classList.remove('ov-lock');
      if (card) card.classList.remove('is-active');
      if (card) card.focus({ preventScroll: true });
    }, reduced() ? 0 : 700);
  }

  function shell(bar, dock, content) {
    ov.innerHTML = bar + (dock || '') + '<div class="ov-content out">' + content + '</div>';
    var c = ov.querySelector('.ov-content');
    requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.remove('out'); c.classList.add('in'); }); });
  }

  function renderGate(glow) {
    var g = window.EB_GATE;
    shell(g.bar, '', g.gate);
    var t = ov.querySelector('.bar-title'); if (t) t.textContent = publicTitle(current);
    var input = ov.querySelector('#pw'), btn = ov.querySelector('.gate .pill');
    var submit = function (e) {
      if (e) e.preventDefault();
      var val = input.value || '';
      if (!val) return;
      btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      deriveKey(val).then(function (k) {
        KEY = k;
        return loadStudy(current).then(function (d) {
          return crypto.subtle.exportKey('raw', k).then(function (raw) { ss('eb-key', ub64(new Uint8Array(raw))); return d; });
        });
      }).then(function (d) { renderStudy(d, glow); }, function (err) {
        KEY = null; btn.disabled = false; btn.removeAttribute('aria-busy');
        var gate = ov.querySelector('.gate');
        var old = ov.querySelector('.gate .err'); if (old) old.remove();
        var msg = 'That’s not quite it. Try again?';
        if (err && err.message === 'load') msg = location.protocol === 'file:'
          ? 'Case studies can’t load from a file opened on your computer. View the site from its web address instead.'
          : 'The case study couldn’t load. Check your connection and try again.';
        var p = document.createElement('p'); p.className = 'err'; p.setAttribute('role', 'alert'); p.textContent = msg;
        gate.insertBefore(p, gate.querySelector('.small'));
        gate.classList.remove('shake'); void gate.offsetWidth; gate.classList.add('shake');
        input.select();
      });
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(e); });
    input.addEventListener('input', function () { var er = ov.querySelector('.gate .err'); if (er) er.remove(); });
    setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) {} }, 400);
  }

  function renderStudy(d, glow) {
    shell(d.bar, d.dock, d.content);
    ov.setAttribute('aria-label', d.title);
    // 20-second panel goes in after the summary, hidden until asked for
    var sum = ov.querySelector('#cs-sum');
    if (sum && d.quick) { sum.insertAdjacentHTML('afterend', d.quick); ov.querySelector('.qk').hidden = true; }
    // accordions start the way they were designed
    ov.querySelectorAll('.tl-i').forEach(function (el) { setAcc(el, el.getAttribute('data-def') === 'open'); });
    var btn = ov.querySelector('.qk-btn');
    if (btn) { btn.classList.remove('on', 'glow'); if (glow) btn.classList.add('glow'); }
    fillImages(ov);
    startCoins();
    ov.scrollTop = 0;
    onScroll();
  }

  /* credits hero: one coin flips at random every 5 seconds */
  var coinT = null, coinLast = -1, coinN = 0;
  function startCoins() {
    clearInterval(coinT); coinT = null;
    var coins = ov.querySelectorAll('.hero-coins .hc');
    coins.forEach(function (c) { c.classList.remove('spin', 'spin2'); });
    if (!coins.length || reduced()) return;
    coinT = setInterval(function () {
      if (!document.body.contains(coins[0])) { clearInterval(coinT); coinT = null; return; }
      var i;
      do { i = Math.floor(Math.random() * 5) * 8 + 3 + Math.floor(Math.random() * 5); } while (i === coinLast || i >= coins.length);
      if (coinLast >= 0 && coins[coinLast]) coins[coinLast].classList.remove('spin', 'spin2');
      coinN++; coins[i].classList.add(coinN % 2 ? 'spin' : 'spin2'); coinLast = i;
    }, 5000);
  }

  function setAcc(el, on) {
    el.classList.toggle('open', on);
    var h = el.querySelector('.tl-head'); if (h) h.setAttribute('aria-expanded', on ? 'true' : 'false');
    var r = el.querySelector('.tl-res'); if (r) r.hidden = !on;
  }

  function setQuick(on) {
    quick = on;
    var qk = ov.querySelector('.qk'), grid = ov.querySelector('.cs-grid'), dock = ov.querySelector('.qk-dock');
    if (qk) qk.hidden = !on;
    if (grid) grid.hidden = on;
    if (dock) dock.hidden = on;
    var b = ov.querySelector('.qk-btn'); if (b) b.classList.remove('glow');
  }

  function targetTop(el) {
    var bar = ov.querySelector('.ov-bar');
    var barH = bar ? bar.getBoundingClientRect().height : 68;
    return Math.max(0, Math.round(el.getBoundingClientRect().top - ov.getBoundingClientRect().top + ov.scrollTop - barH - 24));
  }
  function pinTo(id) {
    var t0 = performance.now(), stable = 0, stop = false;
    var quit = function () { stop = true; };
    addEventListener('wheel', quit, { once: true, passive: true, capture: true });
    addEventListener('touchmove', quit, { once: true, passive: true, capture: true });
    (function step() {
      var el = document.getElementById(id);
      if (stop || !el || !ov) return;
      var top = targetTop(el);
      if (Math.abs(ov.scrollTop - top) > 2) { ov.scrollTop = top; stable = 0; } else stable++;
      if (stable < 24 && performance.now() - t0 < 3000) requestAnimationFrame(step);
    })();
  }
  function goTo(id) {
    var el = document.getElementById(id); if (!el) return;
    ov.scrollTo({ top: targetTop(el), behavior: reduced() ? 'auto' : 'smooth' });
  }

  var ticking = false;
  var lastActive = -1;
  function onScroll() {
    if (ticking || !ov) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false; if (!ov) return;
      var base = ov.getBoundingClientRect().top, a = 0;
      var items = ov.querySelectorAll('.ri[data-go]');
      items.forEach(function (b, i) { var el = document.getElementById(b.getAttribute('data-go')); if (el && el.getBoundingClientRect().top - base < 220) a = i; });
      items.forEach(function (b, i) { b.classList.toggle('on', i === a); });
      // phones: the section chips scroll sideways, so keep the active one in view
      var rl = ov.querySelector('.rail'), ab = items[a];
      if (rl && ab && rl.scrollWidth > rl.clientWidth + 2 && a !== lastActive) {
        var want = ab.offsetLeft - (rl.clientWidth - ab.offsetWidth) / 2;
        try { rl.scrollTo({ left: Math.max(0, want), behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { rl.scrollLeft = Math.max(0, want); }
      }
      lastActive = a;
      var ind = ov.querySelector('.rail-ind'); if (ind) ind.style.transform = 'translateY(' + (a * 40) + 'px)';
      var max = ov.scrollHeight - ov.clientHeight;
      var prog = ov.querySelector('.prog'); if (prog) prog.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, ov.scrollTop / max) : 0) + ')';
      var bt = ov.querySelector('.bar-title'); if (bt) bt.classList.toggle('on', ov.scrollTop > 260);
    });
  }

  function goNext() {
    var i = ORDER.indexOf(current), n = ORDER[(i + 1) % ORDER.length];
    current = n;
    document.querySelectorAll('.card.is-active').forEach(function (c) { c.classList.remove('is-active'); });
    var card = document.getElementById('card-' + n); if (card) card.classList.add('is-active');
    loadStudy(n).then(function (d) { renderStudy(d, false); });
  }

  function onOvClick(e) {
    var t = e.target.closest('button, a'); if (!t || !ov.contains(t)) return;
    if (t.closest('.qk') && t.matches('.back-all')) { goNext(); return; }
    if (t.matches('.back, .back-all')) { e.preventDefault(); close(); return; }
    if (t.matches('.qk-btn')) { setQuick(true); requestAnimationFrame(function () { pinTo('qk-top'); }); return; }
    if (t.matches('.qk-full')) { setQuick(false); requestAnimationFrame(function () { pinTo('cs-sum'); }); return; }
    if (t.matches('.qk-go')) { setQuick(false); var g = t.getAttribute('data-go'); requestAnimationFrame(function () { pinTo(g); }); return; }
    if (t.matches('.next-cs')) { goNext(); return; }
    if (t.matches('.ri')) { goTo(t.getAttribute('data-go')); return; }
    if (t.matches('.tl-head')) { var it = t.closest('.tl-i'); setAcc(it, !it.classList.contains('open')); return; }
    if (t.matches('.view-full')) { var hi = ov.querySelector('.cs-hero-bg img'); if (hi) openLightbox(hi.src, hi.getAttribute('alt') || ov.getAttribute('aria-label'), null, ''); return; }
    if (t.matches('.n2-pause')) {
      var fr = t.closest('.n2-frame'), on = !fr.classList.contains('paused');
      fr.classList.toggle('paused', on);
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
      t.setAttribute('aria-label', on ? 'Play animation' : 'Pause animation');
      t.innerHTML = on
        ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 2.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L4.9 2.1a.6.6 0 0 0-.9.5Z" fill="currentColor"></path></svg>'
        : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="3" y="2.5" width="2.6" height="9" rx="1" fill="currentColor"></rect><rect x="8.4" y="2.5" width="2.6" height="9" rx="1" fill="currentColor"></rect></svg>';
      return;
    }
    if (t.matches('.shot')) {
      var img = t.querySelector('img:not(.ovl-gif)'), gif = t.querySelector('.ovl-gif');
      if (img) openLightbox(img.src, img.getAttribute('alt') || '', gif ? gif.src : null, gif ? (gif.classList.contains('ovl-ext') ? 'ovl-ext' : 'ovl-inc') : '');
    }
  }

  /* ---------- lightbox ---------- */
  var lb = null;
  function openLightbox(src, alt, gif, gifCls) {
    closeLightbox();
    lb = document.createElement('div');
    lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Enlarged image');
    lb.innerHTML = '<button class="lb-scrim" aria-label="Close image"></button><figure class="lb-fig"><button class="lb-x" aria-label="Close image"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg></button><span class="lb-ovl"><img alt=""></span><figcaption class="lb-cap"></figcaption></figure>';
    var im = lb.querySelector('.lb-ovl img'); im.src = src; im.alt = alt;
    lb.querySelector('.lb-cap').textContent = alt;
    if (gif) { var g = document.createElement('img'); g.className = 'lb-gif ' + gifCls; g.src = gif; g.alt = ''; lb.querySelector('.lb-ovl').appendChild(g); }
    lb.addEventListener('click', function (e) { if (e.target.closest('.lb-scrim, .lb-x')) closeLightbox(); });
    (ov || root).appendChild(lb);
    lb.querySelector('.lb-x').focus({ preventScroll: true });
  }
  function closeLightbox() { if (lb) { lb.remove(); lb = null; } }

  /* ---------- homepage ---------- */
  ['credits', 'ai', 'pricing', 'cancel'].forEach(function (id) {
    var c = document.getElementById('card-' + id); if (c) c.addEventListener('click', function () { open(id); });
  });

  // contact menu
  var cm = document.querySelector('.cmenu'), cmBtn = cm && cm.querySelector('.pill');
  function menuOpen(on) {
    var m = cm.querySelector('.menu'), sc = root.querySelector('.scrim');
    if (on && !m) { cm.insertAdjacentHTML('beforeend', window.EB_MENU.menu); if (window.EB_MENU.scrim) root.insertAdjacentHTML('afterbegin', window.EB_MENU.scrim); }
    if (!on) { if (m) m.remove(); if (sc) sc.remove(); }
    cmBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    var ch = cmBtn.querySelector('.chev'); if (ch) ch.classList.toggle('up', on);
  }
  if (cmBtn) cmBtn.addEventListener('click', function () { menuOpen(!cm.querySelector('.menu')); });
  document.addEventListener('click', function (e) {
    if (e.target.closest('.scrim') || (e.target.closest('.menu .mi'))) menuOpen(false);
  });

  // copy email
  var CHECK = '<svg class="ck" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.cp'); if (!b) return;
    var done = function () {
      document.querySelectorAll('.cp').forEach(function (x) {
        if (!x._icon) x._icon = x.querySelector('svg').outerHTML;
        x.classList.add('done'); x.setAttribute('aria-label', 'Email copied');
        x.querySelector('svg').outerHTML = CHECK; var tip = x.querySelector('.tip'); if (tip) tip.textContent = 'Email copied';
        setTimeout(function () { x.classList.remove('done'); x.setAttribute('aria-label', 'Copy email'); x.querySelector('svg').outerHTML = x._icon; if (tip) tip.textContent = 'Copy email'; }, 1800);
      });
    };
    try { navigator.clipboard.writeText('erika.brentar@gmail.com').then(done, function () {}); } catch (err) {}
  });

  // metric count-up when the work section comes into view
  var metrics = [].slice.call(document.querySelectorAll('.card .metric'));
  var finals = metrics.map(function (m) {
    var t = m.textContent.trim(), mt = t.match(/^([^0-9]*)([0-9.]+)(.*)$/);
    return mt ? { pre: mt[1], num: parseFloat(mt[2]), dec: (mt[2].split('.')[1] || '').length, suf: mt[3], text: t } : null;
  });
  function paint(p) {
    metrics.forEach(function (m, i) { var f = finals[i]; if (!f) return; m.textContent = p >= 1 ? f.text : f.pre + (f.num * p).toFixed(Math.max(f.dec, f.suf === '×' ? 1 : f.dec)) + f.suf; });
  }
  if (!reduced() && 'IntersectionObserver' in window) {
    paint(0);
    var io = new IntersectionObserver(function (es) {
      if (!es.some(function (x) { return x.isIntersecting; })) return;
      io.disconnect();
      var t0 = performance.now();
      (function tick(now) { var p = Math.min(1, (now - t0) / 1600); paint(1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(tick); })(t0);
    }, { threshold: 0.2 });
    io.observe(document.getElementById('work'));
  }

  // keyboard
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (lb) { closeLightbox(); return; }
    if (cm && cm.querySelector('.menu')) { menuOpen(false); cmBtn.focus(); return; }
    if (ov) close();
  });

  config().catch(function () {});
})();
