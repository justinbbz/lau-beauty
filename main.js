/* Lau'Beauty — comportements de la page : défilement fluide, film d'ouverture lu au défilement, animations d'apparition,
   galerie horizontale, carte des soins (onglets), horaires en direct, menu mobile. La réservation est dans booking.js. */
(() => {
  'use strict';

  const CFG = window.LAU || {};
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const reduce = root.classList.contains('reduce');
  const gsap = window.gsap, ST = window.ScrollTrigger;
  if (gsap && ST) gsap.registerPlugin(ST);

  const head = $('#head');
  const headH = () => (head ? head.offsetHeight : 76);

  /* ---------- défilement fluide ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
    if (gsap && ST) {
      lenis.on('scroll', ST.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const loop = t => { lenis.raf(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }
  window.CSX = { lenis };
  const scrollY = () => (lenis ? lenis.scroll : window.scrollY);
  function scrollToTarget(target, offset = 0) {
    if (lenis) lenis.scrollTo(target, { offset, duration: 1.5, easing: t => 1 - Math.pow(1 - t, 4) });
    else { const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY; window.scrollTo({ top: y + offset, behavior: reduce ? 'auto' : 'smooth' }); }
  }

  /* ---------- fenêtre de réservation : on fige la page derrière ---------- */
  root.addEventListener('lau:dialog', e => {
    root.classList.toggle('is-locked', !!e.detail);
    if (lenis) (e.detail ? lenis.stop() : lenis.start());
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-open-booking]');
    if (!b) return;
    e.preventDefault();
    if (window.LAUBooking) window.LAUBooking.open({ trigger: b, family: b.dataset.family, service: b.dataset.service });
  });

  /* ---------- film d'ouverture ---------- */
  const film = $('#top'), canvas = $('#filmCanvas'), stage = $('#filmStage');
  const N = (CFG.HERO && CFG.HERO.frames) || 0;
  const caps = $$('.cap', film), rail = $$('#filmRail li'), line = $('#filmLine');
  const boot = $('#boot'), bootBar = $('#bootBar');
  let bootDone = false;
  function finishBoot() {
    if (bootDone) return; bootDone = true;
    if (boot) { boot.classList.add('is-off'); setTimeout(() => boot.remove(), 1100); }
    root.classList.remove('is-loading');
  }

  function setCaps(p) {
    caps.forEach(c => { const on = p >= +c.dataset.from && p < +c.dataset.to; if (on !== c.classList.contains('is-on')) c.classList.toggle('is-on', on); });
    rail.forEach(li => li.classList.toggle('is-on', p >= +li.dataset.from && p < +li.dataset.from + 0.26));
    film.classList.toggle('is-past-intro', p > 0.03);
    if (line) line.style.transform = 'scaleY(' + clamp(p, 0, 1).toFixed(3) + ')';
  }

  if (film && canvas && N && !reduce) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const mq = matchMedia('(max-width: 860px), (max-aspect-ratio: 1/1)');
    let dir = mq.matches ? CFG.HERO.mobile : CFG.HERO.ordinateur;
    let frames = new Array(N), nLoaded = 0, token = 0;
    const src = i => dir + 'f' + String(i + 1).padStart(3, '0') + '.webp';

    function loadFrame(i, tk) {
      return new Promise(res => {
        if (frames[i]) return res(frames[i]);
        const im = new Image(); im.decoding = 'async';
        im.onload = () => { if (tk !== token) return res(null); frames[i] = im; nLoaded++; res(im); };
        im.onerror = () => res(null);
        im.src = src(i);
      });
    }
    async function loadAll() {
      const tk = ++token; frames = new Array(N); nLoaded = 0;
      // ordre : première image, puis une sur huit (défilement rapide possible tout de suite), puis une sur deux, puis le reste
      const order = [0]; const seen = new Set([0]);
      for (const pas of [8, 2, 1]) for (let i = 0; i < N; i += pas) if (!seen.has(i)) { seen.add(i); order.push(i); }
      const coarse = Math.ceil(N / 8) + 1;
      const start = performance.now();
      const queue = order.slice();
      const worker = async () => {
        while (queue.length && tk === token) {
          const i = queue.shift();
          await loadFrame(i, tk);
          if (bootBar) bootBar.style.transform = 'scaleX(' + clamp(nLoaded / coarse, 0.05, 1) + ')';
          if (nLoaded >= coarse && !film.classList.contains('is-ready')) { film.classList.add('is-ready'); render(shown); finishBoot(); }
          if (nLoaded > coarse && queue.length && performance.now() - start > 400) await new Promise(r => setTimeout(r, 0));
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      render(shown);
    }
    function drawImage(img, alpha) {
      const cw = canvas.width, ch = canvas.height;
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.globalAlpha = alpha; ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    }
    const nearest = i => { for (let d = 0; d < N; d++) { if (frames[i - d]) return frames[i - d]; if (frames[i + d]) return frames[i + d]; } return null; };
    function render(p) {
      const f = clamp(p, 0, 1) * (N - 1), i0 = Math.floor(f), t = f - i0;
      const a = nearest(i0); if (!a) return;
      drawImage(a, 1);
      if (t > 0.04 && i0 + 1 < N) { const b = nearest(i0 + 1); if (b && b !== a) drawImage(b, t); }
    }

    // progression de défilement lissée
    let target = 0, shown = 0, raf = 0;
    const progress = () => { const total = film.offsetHeight - innerHeight; return total > 0 ? clamp((scrollY() - film.offsetTop) / total, 0, 1) : 0; };
    function tick() {
      shown += (target - shown) * 0.17;
      if (Math.abs(target - shown) < 0.0003) shown = target;
      render(shown);
      stage.style.transform = 'scale(' + (1 + shown * 0.12).toFixed(4) + ')';
      setCaps(shown);
      raf = shown !== target ? requestAnimationFrame(tick) : 0;
    }
    const onScroll = () => { target = progress(); if (!raf) raf = requestAnimationFrame(tick); };
    if (lenis) lenis.on('scroll', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { resize(); onScroll(); });
    mq.addEventListener('change', () => { dir = mq.matches ? CFG.HERO.mobile : CFG.HERO.ordinateur; film.classList.remove('is-ready'); loadAll(); });
    resize(); onScroll(); setCaps(shown);
    loadAll();
    setTimeout(finishBoot, 3200); // en cas de réseau lent : le site s'affiche, le film suivra
  } else {
    // sans film (mouvement réduit, pas de canvas) : image fixe, première accroche + appel à réserver
    film && film.classList.add('is-static');
    caps.forEach((c, i) => c.classList.toggle('is-on', i === 0));
    finishBoot();
  }

  /* ---------- en-tête ---------- */
  let lastY = 0;
  function onHead() {
    const y = scrollY();
    head.classList.toggle('is-solid', y > 40);
    const past = film ? film.offsetTop + film.offsetHeight - innerHeight * 0.5 : 0;
    head.classList.toggle('is-hidden', y > past && y > lastY + 4 && !drawer.classList.contains('is-open'));
    if (y < lastY - 4) head.classList.remove('is-hidden');
    lastY = y;
  }
  const drawer = $('#drawer'), burger = $('#burger');
  if (lenis) lenis.on('scroll', onHead);
  window.addEventListener('scroll', onHead, { passive: true });
  onHead();

  function setDrawer(open) {
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    if (lenis) (open ? lenis.stop() : lenis.start());
    root.classList.toggle('is-locked', open);
  }
  burger.addEventListener('click', () => setDrawer(!drawer.classList.contains('is-open')));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) { setDrawer(false); burger.focus(); } });

  /* ---------- ancres ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = id === '#top' ? null : $(id);
    if (id !== '#top' && !el) return;
    e.preventDefault();
    if (drawer.classList.contains('is-open')) setDrawer(false);
    if (a.dataset.tab) selectTab(a.dataset.tab, false);
    setTimeout(() => { if (id === '#top') scrollToTarget(0); else scrollToTarget(el, id === '#soins' ? -4 : -headH() + 2); }, drawer.classList.contains('is-open') ? 60 : 0);
    history.replaceState(null, '', id === '#top' ? location.pathname : id);
  });
  // lien actif dans le menu
  const sections = ['soins', 'galerie', 'avis', 'salon', 'faq'].map(id => $('#' + id)).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      $$('.nav a').forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + en.target.id)));
    }), { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => io.observe(s));
  }

  /* ---------- mots qui apparaissent ---------- */
  function split(el) {
    if (el.dataset.splitDone) return; el.dataset.splitDone = '1';
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    let i = 0;
    const walk = (node, parent) => node.childNodes.forEach(ch => {
      if (ch.nodeType === 3) {
        ch.textContent.split(/(\s+)/).forEach(tok => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { parent.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
          const s = document.createElement('span'); s.style.setProperty('--i', i++); s.textContent = tok;
          w.appendChild(s); parent.appendChild(w);
        });
      } else if (ch.nodeType === 1) { const c = ch.cloneNode(false); parent.appendChild(c); walk(ch, c); }
    });
    const frag = document.createDocumentFragment(); walk(el, frag);
    el.replaceChildren(frag); el.setAttribute('aria-label', label); el.classList.add('is-split');
  }
  $$('[data-split]').forEach(split);

  /* ---------- apparitions au défilement ---------- */
  const revealEls = $$('[data-reveal], [data-split]');
  if (reduce || !('IntersectionObserver' in window)) revealEls.forEach(el => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    revealEls.forEach(el => {
      const sibs = el.parentElement ? Array.from(el.parentElement.children).filter(c => c.hasAttribute('data-reveal')) : [];
      const k = sibs.indexOf(el); if (k > 0) el.style.setProperty('--d', (Math.min(k, 6) * 0.08).toFixed(2) + 's');
      io.observe(el);
    });
  }

  /* ---------- galerie horizontale ---------- */
  const track = $('#galerieTrack'), view = $('#galerieView'), bar = $('#galerieBar');
  if (track && gsap && ST && !reduce) {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 861px)', () => {
      const gutter = () => parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const dist = () => Math.max(0, track.scrollWidth - innerWidth + gutter() + 8);
      const tw = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: view, start: () => 'center ' + Math.round(innerHeight / 2 + headH() / 2), end: () => '+=' + dist(), pin: true, scrub: 0.7, invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: s => { if (bar) bar.style.transform = 'scaleX(' + s.progress.toFixed(3) + ')'; } }
      });
      return () => { tw.kill(); gsap.set(track, { clearProps: 'transform' }); };
    });
    mm.add('(max-width: 860px)', () => {
      const f = () => { if (bar) bar.style.transform = 'scaleX(' + clamp(track.scrollLeft / Math.max(1, track.scrollWidth - track.clientWidth), 0, 1).toFixed(3) + ')'; };
      track.addEventListener('scroll', f, { passive: true }); f();
      return () => track.removeEventListener('scroll', f);
    });
  } else if (track && bar) {
    const f = () => { bar.style.transform = 'scaleX(' + clamp(track.scrollLeft / Math.max(1, track.scrollWidth - track.clientWidth), 0, 1).toFixed(3) + ')'; };
    track.addEventListener('scroll', f, { passive: true }); f();
  }

  /* ---------- carte des soins : onglets ---------- */
  const tabs = $$('.tab'), panels = $$('.panel');
  function selectTab(id, focus = true) {
    tabs.forEach(t => { const on = t.dataset.family === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus({ preventScroll: true }); });
    panels.forEach(p => { p.hidden = p.id !== 'panel-' + id; });
    const t = $('#tab-' + id); if (t && t.scrollIntoView) { try { t.parentElement.scrollTo({ left: t.offsetLeft - 20, behavior: 'smooth' }); } catch (e) { /* ancien navigateur */ } }
    if (ST) setTimeout(() => ST.refresh(), 60);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t.dataset.family, false));
    t.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (k) { e.preventDefault(); selectTab(tabs[(i + k + tabs.length) % tabs.length].dataset.family); }
      if (e.key === 'Home') { e.preventDefault(); selectTab(tabs[0].dataset.family); }
      if (e.key === 'End') { e.preventDefault(); selectTab(tabs[tabs.length - 1].dataset.family); }
    });
  });
  // ajouter / retirer un soin depuis la carte
  document.addEventListener('click', async e => {
    const b = e.target.closest('.row__add'); if (!b || !window.LAUBooking) return;
    const on = await window.LAUBooking.toggle(b.dataset.serviceId);
    b.setAttribute('aria-pressed', String(!!on));
    const u = b.querySelector('use'); if (u) u.setAttribute('href', on ? '#i-check' : '#i-plus');
    const li = b.closest('.row'); if (li) li.classList.toggle('is-on', !!on);
  });
  // état initial des boutons (sélection gardée dans la session)
  window.addEventListener('load', () => { if (window.LAUBooking) window.LAUBooking.ready().then(() => $$('.row__add').forEach(b => { const on = window.LAUBooking.has(b.dataset.serviceId); b.setAttribute('aria-pressed', String(on)); const u = b.querySelector('use'); if (u) u.setAttribute('href', on ? '#i-check' : '#i-plus'); b.closest('.row').classList.toggle('is-on', on); })).catch(() => {}); });

  /* ---------- horaires en direct ---------- */
  fetch('reglages.json').then(r => r.json()).then(reg => {
    const tz = reg.fuseau, JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map(x => [x.type, x.value]));
    const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const p = parts(new Date()), today = `${p.year}-${p.month}-${p.day}`, wd = WD[p.weekday], now = (+p.hour) * 60 + (+p.minute);
    const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const fr = t => { const [h, m] = t.split(':').map(Number); return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; };
    const plages = (date, dayIdx) => (reg.fermetures || []).includes(date) ? [] : (reg.horaires[JOURS[dayIdx]] || []);
    const row = $('tr[data-jour="' + JOURS[wd] + '"]'); if (row) row.classList.add('is-today');
    const badge = $('#ouvert'); if (!badge) return;
    const cur = plages(today, wd).find(([a, b]) => now >= mins(a) && now < mins(b));
    let txt;
    if (cur) { badge.classList.add('is-open'); txt = `Ouvert · jusqu'à ${fr(cur[1])}`; }
    else {
      const later = plages(today, wd).find(([a]) => now < mins(a));
      if (later) txt = `Fermé · ouvre à ${fr(later[0])}`;
      else {
        let found = '';
        for (let k = 1; k <= 8 && !found; k++) {
          const d = new Date(Date.now() + k * 86400000), q = parts(d), ds = `${q.year}-${q.month}-${q.day}`, w = WD[q.weekday], pl = plages(ds, w);
          if (pl.length) found = `${k === 1 ? 'demain' : JOURS[w]} à ${fr(pl[0][0])}`;
        }
        txt = found ? `Fermé · ouvre ${found}` : 'Fermé';
      }
    }
    $('span', badge).textContent = txt;
  }).catch(() => {});

  /* ---------- carte Google : chargée à la demande ---------- */
  const carteBtn = $('#carteBtn'), carte = $('#carte');
  if (carteBtn) carteBtn.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = 'https://www.google.com/maps?q=43.8296508,5.796088&z=16&output=embed';
    f.title = "Plan d'accès à Lau'Beauty, 341 avenue du Moulin Neuf, Manosque"; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade'; f.setAttribute('allowfullscreen', '');
    carte.appendChild(f); $('.carte__load', carte).remove();
  });

  /* ---------- carte de fidélité : légère inclinaison ---------- */
  const fid = $('#fidCard');
  if (fid && !reduce && matchMedia('(hover: hover)').matches) {
    const img = $('img', fid);
    fid.addEventListener('pointermove', e => { const r = fid.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; img.style.transform = `rotateY(${(x * 14).toFixed(1)}deg) rotateX(${(-y * 10).toFixed(1)}deg) rotate(${(-2 + x * 2).toFixed(1)}deg)`; });
    fid.addEventListener('pointerleave', () => { img.style.transform = ''; });
  }

  /* ---------- bandeau démonstration ---------- */
  if (CFG.DEMO_MODE !== false) { const b = $('#demoBar'); if (b) { b.hidden = false; document.body.style.paddingBottom = b.offsetHeight + 'px'; } }

  /* ---------- rafraîchissements ---------- */
  window.addEventListener('load', () => { if (ST) { ST.refresh(); setTimeout(() => ST.refresh(), 800); } });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ST && ST.refresh());
  // lien direct vers une section au chargement
  if (location.hash && $(location.hash)) window.addEventListener('load', () => setTimeout(() => scrollToTarget($(location.hash), -headH() + 2), 400));
})();
