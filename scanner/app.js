// PWA-сканер на проходной «Зеніт-Авто.облік»
(function () {
  const C = window.ZA_CONFIG, t = k => I18N.t(k), pick = o => I18N.pick(o), esc = UI.esc;
  const app = document.getElementById('app');
  const DKEY = 'za-scanner', QKEY = 'za-scanner-queue', VERSION = '1.2.0', PIN = '1234';
  UI.theme.set('light');
  const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let D = ld(DKEY, null);
  let queue = ld(QKEY, []);
  // поправка к серверному времени: без сети время отметки берем по ней, а не по сбитым часам телефона
  let OFF = ld('za-scanner-off', 0);
  const nowIso = () => new Date(Date.now() + (OFF || 0)).toISOString();
  async function syncTime() {
    if (!isOnline()) return;
    try { const t0 = Date.now(); const r = await API.time(); const t1 = Date.now(); OFF = new Date(r.now).getTime() - (t0 + t1) / 2; sv('za-scanner-off', OFF); } catch (e) {}
  }
  // кто в коде (без сети показываем хотя бы табельный номер или код пропуска)
  const qrWho = txt => { const p = String(txt || '').split('.'); if (p[0] !== 'TT1') return ''; return p[1] === 'P' ? `${t('guest_pass')} · ${p[2]}` : (p[1] === 'D' || p[1] === 'S') ? `${t('tab_no')} ${p[2]}` : ''; };
  let event = 'AUTO', eventTimer = null, busy = false, lastText = '', lastAt = 0;
  let stream = null, detector = null, loopId = null, facing = 'user', simOffline = false, battery = null;
  const ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="#1E7B34" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="none" stroke="#EE7023" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4.5M12 17.2h.01"/></svg>',
    er: '<svg viewBox="0 0 24 24" fill="none" stroke="#B3261E" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    pass: '<svg viewBox="0 0 24 24" fill="none" stroke="#2F5BD3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 6V4h8v2M7 12h4M7 15h6"/><circle cx="16.5" cy="12.5" r="1.5"/></svg>',
    q: '<svg viewBox="0 0 24 24" fill="none" stroke="#3A3A36" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg>'
  };

  // ---------- регистрация устройства ----------
  function renderReg(err) {
    stopCam();
    app.innerHTML = `<div class="reg"><form class="card" id="rf">
      <span class="brand">${UI.brandHtml('../')}</span>
      <span class="reg-badge">${t('scan_badge')}</span>
      <h1>${t('reg_title')}</h1><p>${t('reg_enter')}</p>
      <input class="in code mono" id="rc" inputmode="numeric" maxlength="6" autocomplete="off" aria-label="${t('reg_code')}">
      ${err ? `<p style="color:var(--er)">${t('reg_bad')}</p>` : ''}
      <button class="btn pri" style="height:54px;font-size:17px" type="submit">${t('reg_btn')}</button>
      ${API.mock ? '<p>Демо-код: <b class="mono">482915</b> (або створіть новий в адмінці)</p>' : ''}
      <div class="seg" role="group" aria-label="Мова" style="align-self:flex-start"><button type="button" data-lang="uk">УКР</button><button type="button" data-lang="ru">РУС</button></div>
      <p class="reg-foot">${t('scan_foot')}</p>
    </form></div>`;
    I18N.apply();
    document.getElementById('rf').onsubmit = async e => {
      e.preventDefault();
      try { const r = await API.deviceRegister(document.getElementById('rc').value); D = { token: r.device_token, device: r.device, branch: r.branch, gate: r.gate }; sv(DKEY, D); renderMain(); }
      catch (err2) { renderReg(true); }
    };
  }

  // ---------- главный экран ----------
  async function renderMain() {
    const demoEmps = API.mock ? await API.admin.demoEmployees() : [];
    app.innerHTML = `<div class="wrap">
      <section class="cam" id="cam"><video id="vid" playsinline muted></video>
        <div class="vf"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i><div class="laser"></div></div>
        <div class="tx"><b>${t('scan_title')}</b><span>${t('scan_sub')}</span></div>
        <div class="camerr hidden" id="camerr"></div>
        <input id="usb" aria-label="USB" autocomplete="off">
      </section>
      <aside class="pane">
        <span class="brand">${UI.brandHtml('../')}</span>
        <div style="margin-top:14px;font-size:15px;color:var(--mu)">${esc(pick(D.branch))}</div>
        <div style="font-size:22px;font-weight:800">${esc(pick(D.gate))}</div>
        <div class="clock" id="clock"></div>
        <div style="font-size:16px;color:var(--mu);margin-top:6px" id="date"></div>
        <div style="font-size:15px;font-weight:700;margin:18px 0 10px">${t('event')}</div>
        <button class="auto" type="button" data-ev="AUTO">${t('ev_AUTO')}<small>${t('auto_sub')}</small></button>
        <div class="evs">${['IN', 'OUT', 'BREAK_OUT', 'BREAK_IN', 'DUTY_OUT', 'DUTY_IN'].map(e => `<button type="button" data-ev="${e}">${t('ev_' + e)}</button>`).join('')}</div>
        ${API.mock ? `<details class="demo"><summary><b>${t('demo_panel')}</b></summary>
          <select class="in" id="demp" aria-label="${t('employee')}">${demoEmps.sort((a, b) => (b.appActive - a.appActive)).map(e => `<option value="${esc(e.tab)}" ${e.appActive ? '' : 'data-noapp="1"'}>${esc(e.tab)} · ${esc(pick(e.name).split(' ').slice(0, 2).join(' '))}${e.appActive ? '' : ' (без PWA)'}</option>`).join('')}</select>
          <div class="row"><button class="btn sm" type="button" data-demo="live">${t('d_live')}</button><button class="btn sm" type="button" data-demo="screen">${t('d_screen')}</button>
          <button class="btn sm" type="button" data-demo="static">${t('d_static')}</button><button class="btn sm" type="button" data-demo="fake">${t('d_fake')}</button></div>
          <div class="row"><button class="btn sm" type="button" data-demo="noacc">${t('d_noacc')}</button><button class="btn sm" type="button" data-demo="pass">${t('d_pass')}</button><button class="btn sm" type="button" data-demo="passbad">${t('d_passbad')}</button></div>
          <span style="color:var(--mu)">${t('usb_hint')}</span></details>` : ''}
        <div class="stat"><span id="net" style="display:flex;align-items:center;gap:6px"></span><span id="qlen"></span><span id="bat"></span>
          <div class="seg" role="group" aria-label="Мова"><button type="button" data-lang="uk">УКР</button><button type="button" data-lang="ru">РУС</button></div>
          <button class="gear" type="button" id="gear" aria-label="${t('service')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg></button></div>
      </aside></div>`;
    I18N.apply();
    setEvent('AUTO');
    app.querySelector('.pane').addEventListener('click', async e => {
      const b = e.target.closest('[data-ev]'); if (b) { setEvent(b.dataset.ev); return; }
      const d = e.target.closest('[data-demo]');
      if (d) {
        let kind = d.dataset.demo, tab = document.getElementById('demp').value;
        if (kind === 'noacc') { kind = 'live'; tab = '1062'; }   // Мороз Анна, филиал Миколаїв, без профиля
        handleText(await API.admin.demoCode(kind, tab), true);
      }
    });
    document.getElementById('gear').onclick = serviceMenu;
    const usb = document.getElementById('usb');
    usb.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = usb.value.trim(); usb.value = ''; if (v) handleText(v, true); } });
    document.addEventListener('click', e => { if (!e.target.closest('input,select,.modal')) usb.focus({ preventScroll: true }); });
    usb.focus({ preventScroll: true });
    tickClock(); setInterval(tickClock, 1000);
    updStatus();
    startCam();
  }

  function setEvent(ev) {
    event = ev;
    app.querySelectorAll('[data-ev]').forEach(b => b.classList.toggle('sel', b.dataset.ev === ev));
    clearTimeout(eventTimer);
    if (ev !== 'AUTO') eventTimer = setTimeout(() => setEvent('AUTO'), 15000);
  }
  function tickClock() {
    const c = document.getElementById('clock'); if (!c) return;
    c.textContent = I18N.hm(new Date());
    document.getElementById('date').textContent = `${I18N.weekday(new Date())}, ${I18N.dateLong(new Date())}`;
  }
  const isOnline = () => navigator.onLine && !simOffline;
  function updStatus() {
    const n = document.getElementById('net'); if (!n) return;
    n.innerHTML = `<span class="dot ${isOnline() ? '' : 'off'}"></span>${isOnline() ? t('online_w') : t('offline_w')}`;
    document.getElementById('qlen').textContent = `${t('queue')}: ${queue.length}`;
    document.getElementById('bat').textContent = battery == null ? '' : `${t('c_battery')} ${battery}%`;
  }

  // ---------- камера ----------
  async function startCam() {
    const err = document.getElementById('camerr');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const v = document.getElementById('vid'); v.srcObject = stream; v.classList.toggle('back', facing === 'environment'); await v.play();
      if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
      const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
      const loop = async () => {
        if (!stream) return;
        if (!busy && v.readyState >= 2) {
          try {
            if (detector) { const r = await detector.detect(v); if (r[0]) handleText(r[0].rawValue); }
            else {
              const w = 480, h = Math.round(480 * v.videoHeight / v.videoWidth) || 270; cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h);
              const r = window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); if (r && r.data) handleText(r.data);
            }
          } catch (e) {}
        }
        loopId = setTimeout(loop, 180);
      };
      loop();
    } catch (e) {
      err.classList.remove('hidden'); err.textContent = t('cam_err');
    }
  }
  function stopCam() { clearTimeout(loopId); if (stream) stream.getTracks().forEach(x => x.stop()); stream = null; }

  // ---------- отметка ----------
  async function handleText(text, force) {
    const now = Date.now();
    if (busy || (!force && text === lastText && now - lastAt < 5000)) return;
    lastText = text; lastAt = now; busy = true;
    const body = { scan_id: API.uuid(), qr: text, event, scanned_at: nowIso(), offline: false };
    let res;
    if (!isOnline()) { body.offline = true; queue.push(body); sv(QKEY, queue); res = { status: 'queued', who: qrWho(text) }; }
    else {
      try { res = await Promise.race([API.scan(body, D.token), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 3000))]); }
      catch (e) {
        if (e.auth) { D = null; sv(DKEY, null); busy = false; renderReg(); return; }
        body.offline = true; queue.push(body); sv(QKEY, queue); res = { status: 'queued', who: qrWho(text) };
      }
    }
    updStatus();
    if (res.status === 'confirm') { showConfirm(res, body); return; }
    showResult(res); beep(res);
    setTimeout(() => { hideResult(); busy = false; if (event !== 'AUTO') setEvent('AUTO'); }, C.RESULT_SHOW_SEC * 1000);
  }
  async function flush() {
    if (!isOnline() || !queue.length || !D) return;
    const items = queue.slice();
    for (const b of items) {
      try { await API.scan(b, D.token); queue = queue.filter(x => x.scan_id !== b.scan_id); sv(QKEY, queue); }
      catch (e) {
        if (e.auth) { D = null; sv(DKEY, null); renderReg(); return; }
        // нет связи или сбой сервера — пробуем позже; ошибка в самих данных (4xx) — убираем, чтобы не держала очередь
        if (e.net || !e.status || e.status >= 500 || e.status === 429) break;
        queue = queue.filter(x => x.scan_id !== b.scan_id); sv(QKEY, queue);
      }
    }
    updStatus();
  }
  function beep(res) {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = res.verdict === 'PWA_LIVE' ? 880 : res.verdict === 'INVALID' ? 220 : 520; g.gain.value = .08;
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (res.verdict === 'PWA_LIVE' ? .15 : .4));
    } catch (e) {}
    if (navigator.vibrate) navigator.vibrate(res.verdict === 'PWA_LIVE' ? 60 : [80, 60, 80]);
  }

  function showResult(r) {
    const e = r.employee, ps = r.pass, name = e ? pick(e.name).split(' ').slice(0, 2).join(' ') : ps ? ps.name : '';
    const hm = I18N.hm(new Date());
    const top = `<div class="tp"><span class="tb">${UI.brandHtml('../')}</span><span>${esc(pick(D.branch))} · ${esc(pick(D.gate))} · ${hm}</span></div>`;
    const next = `<span>${t('r_next')} ${C.RESULT_SHOW_SEC} ${t('sec')}</span>`;
    const who = e ? `<div class="who">${esc(name)}</div><div class="t3">${t('tab_no')} ${esc(e.tab)} · ${esc(pick(e.pos))}</div>` : '';
    let cls, icon, body, foot;
    const ev = r.event ? t('ev_' + r.event) : '';
    const passWho = ps ? `<div class="who">${esc(ps.name)}</div><div class="t3">${esc(ps.company)} · ${t('r_pass_until')} ${new Date(ps.to).toDateString() === new Date().toDateString() ? '' : new Date(ps.to).toLocaleDateString('uk-UA').slice(0, 5) + ' '}${I18N.hm(ps.to)}</div>` : '';
    switch (r.status === 'queued' ? 'Q' : r.verdict) {
      case 'PASS_OK': cls = 'r-bl'; icon = `<div class="circ" style="background:#fff">${ICON.pass}</div>`;
        body = `<div class="e1">${ev} · ${hm}</div>${passWho}<div class="chip2">${t('r_pass')}</div>`; foot = `<span>${t('r_good_day')}</span>`; break;
      case 'PASS_SCREEN': cls = 'r-yl'; icon = `<div class="circ" style="background:#1B1B1B">${ICON.wa}</div>`;
        body = `<div class="e1">${ev} · ${hm} · ${t('accepted')}</div>${passWho}<div class="warnbox"><b>${t('r_pass_screen_b')}</b> ${t('r_screen_t')}</div>`; foot = `<span>${t('r_sent')}</span>`; break;
      case 'PASS_DENIED': cls = 'r-rd'; icon = `<div class="circ" style="background:#fff">${ICON.er}</div>`;
        body = `<div class="e1">${t('r_bad_ev')}</div><div class="who">${t('r_pass_bad')}</div><div class="t3">${ps ? esc(ps.name) + ' · ' : ''}${t('pr_' + (r.reason || 'invalid'))}</div><div class="chip2">${t('r_bad_help')}</div>`; foot = `<span>${t('r_bad_sb')}</span>`; break;
      case 'NO_ACCESS': cls = 'r-rd'; icon = `<div class="circ" style="background:#fff">${ICON.er}</div>`;
        body = `<div class="e1">${ev} · ${hm}</div>${who}<div class="warnbox"><b>${t('r_noacc_b')}</b> ${t('r_noacc_t')}</div>`; foot = `<span>${t('r_bad_sb')}</span>`; break;
      case 'PWA_LIVE': cls = 'r-ok'; icon = `<div class="circ" style="background:#fff">${ICON.ok}</div>`;
        body = `<div class="e1">${ev} · ${hm}</div>${who}<div class="chip2">${t('r_live')}</div>`; foot = `<span>${t('r_good_day')}</span>`; break;
      case 'PWA_SCREEN': case 'STATIC': case 'REPLAY': {
        const k = { PWA_SCREEN: 'screen', STATIC: 'static', REPLAY: 'replay' }[r.verdict];
        cls = 'r-yl'; icon = `<div class="circ" style="background:#1B1B1B">${ICON.wa}</div>`;
        body = `<div class="e1">${ev} · ${hm} · ${t('accepted')}</div>${who}<div class="warnbox"><b>${t('r_' + k + '_b')}</b> ${t('r_' + k + '_t')}</div>`; foot = `<span>${t('r_sent')}</span>`; break;
      }
      case 'CLAIM_REJECTED': cls = 'r-rd'; icon = `<div class="circ" style="background:#fff">${ICON.er}</div>`;
        body = `<div class="e1">${hm}</div><div class="who">${t('r_conf_rej')}</div>${e ? `<div class="t3">${esc(name)}</div>` : ''}<div class="chip2">${t('r_conf_rej_t')}</div>`; foot = `<span>${t('r_bad_sb')}</span>`; break;
      case 'PENDING': cls = 'r-gr'; icon = `<div class="circ" style="background:#fff">${ICON.q}</div>`;
        body = `<div class="e1">${hm}</div><div class="who">${t('r_pending')}</div>${e ? `<div class="t3">${esc(name)}</div>` : ''}<div class="chip2">${t('r_pending_t')}</div>`; foot = '<span></span>'; break;
      case 'DUPLICATE': cls = 'r-gr'; icon = `<div class="circ" style="background:#fff">${ICON.q}</div>`;
        body = `<div class="e1">${r.event ? ev : ''}</div>${e ? `<div class="who">${esc(name)}</div>` : ''}<div class="t3">${t('r_dup')}. ${t('r_dup_t')}</div>`; foot = '<span></span>'; break;
      case 'Q': cls = 'r-gr'; icon = `<div class="circ" style="background:#fff">${ICON.q}</div>`;
        body = `<div class="e1">${event === 'AUTO' ? '' : t('ev_' + event) + ' · '}${hm}</div><div class="who" style="font-size:clamp(30px,4vw,52px)">${t('r_queued')}</div>${r.who ? `<div class="t3">${esc(r.who)}</div>` : ''}`; foot = `<span>${t('queue')}: ${queue.length}</span>`; break;
      default: cls = 'r-rd'; icon = `<div class="circ" style="background:#fff">${ICON.er}</div>`;
        body = `<div class="e1">${t('r_bad_ev')}</div><div class="who">${t('r_bad')}</div><div class="t3">${t('r_bad_t')}</div><div class="chip2">${t('r_bad_help')}</div>`; foot = `<span>${t('r_bad_sb')}</span>`;
    }
    const el = document.createElement('div'); el.className = 'res ' + cls; el.id = 'res'; el.setAttribute('role', 'alert');
    el.innerHTML = `${top}<div class="mid">${icon}<div>${body}</div></div><div class="ft">${foot}${next}</div>`;
    document.body.appendChild(el);
  }
  // первый вход с телефона (установка по плакату): охранник смотрит на человека и подтверждает
  function showConfirm(r, body) {
    const e = r.employee || {}, hm = I18N.hm(new Date());
    const el = document.createElement('div'); el.className = 'res r-bl'; el.id = 'res'; el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="tp"><span class="tb">${UI.brandHtml('../')}</span><span>${esc(pick(D.branch))} · ${esc(pick(D.gate))} · ${hm}</span></div>
      <div class="mid"><div class="circ" style="background:#fff">${ICON.q}</div><div>
        <div class="e1">${t('r_conf_b')}</div>
        <div class="who">${esc(pick(e.name))}</div>
        <div class="t3">${t('tab_no')} ${esc(e.tab)} · ${esc(pick(e.pos))} · ${esc(pick(e.branch))}</div>
        <div class="warnbox">${t('r_conf_t')}</div>
        <div class="cfm"><button type="button" class="cy" id="cy">${t('r_conf_yes')}</button><button type="button" class="cn" id="cn">${t('r_conf_no')}</button></div>
      </div></div><div class="ft"><span></span><span></span></div>`;
    document.body.appendChild(el);
    try { navigator.vibrate && navigator.vibrate([60, 60, 60]); } catch (x) {}
    const auto = setTimeout(() => { hideResult(); busy = false; }, 90000);
    const send = async extra => {
      clearTimeout(auto); el.querySelectorAll('.cfm button').forEach(b => { b.disabled = true; });
      let res;
      try { res = await API.scan(Object.assign({}, body, extra), D.token); }
      catch (x) { res = { status: 'rejected', verdict: 'PENDING', employee: e }; }
      hideResult(); showResult(res); beep(res);
      setTimeout(() => { hideResult(); busy = false; if (event !== 'AUTO') setEvent('AUTO'); }, C.RESULT_SHOW_SEC * 1000);
    };
    el.querySelector('#cy').onclick = () => send({ confirm: true });
    el.querySelector('#cn').onclick = () => send({ reject: true });
  }
  function hideResult() { const r = document.getElementById('res'); if (r) r.remove(); }

  // ---------- служебное меню ----------
  function serviceMenu() {
    UI.modal(`<h2>${t('service')}</h2><label class="f">${t('pin')}<input class="in mono" id="pin" type="password" inputmode="numeric" maxlength="6"></label>
      <div id="sm" class="hidden" style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
        <label class="chk"><input type="checkbox" id="so" ${simOffline ? 'checked' : ''}> ${t('sim_offline')}</label>
        <button class="btn" type="button" id="flip">↺ ${facing === 'user' ? 'Задня камера / Задняя камера' : 'Фронтальна камера / Фронтальная камера'}</button>
        <button class="btn" type="button" id="unreg" style="color:var(--er)">${t('unregister')}</button>
        <p style="margin:0" class="mono">${esc(D.device || '')} · v${VERSION}</p></div>
      <div class="acts"><button class="btn pri" type="button" data-close>${t('close')}</button></div>`,
      (m, close) => {
        const pin = m.querySelector('#pin'), sm = m.querySelector('#sm');
        pin.oninput = () => { if (pin.value === PIN) { sm.classList.remove('hidden'); pin.closest('label').classList.add('hidden'); } };
        m.querySelector('#so').onchange = e => { simOffline = e.target.checked; updStatus(); if (!simOffline) flush(); };
        m.querySelector('#flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; stopCam(); startCam(); close(); };
        m.querySelector('#unreg').onclick = () => { D = null; sv(DKEY, null); close(); renderReg(); };
      });
  }

  // ---------- фон ----------
  async function ping() {
    if (!D || !isOnline()) return;
    syncTime();
    try { await API.devicePing(D.token, { queue: queue.length, battery, version: VERSION }); } catch (e) { if (e.auth) { D = null; sv(DKEY, null); renderReg(); } }
  }
  if (navigator.getBattery) navigator.getBattery().then(b => { const u = () => { battery = Math.round(b.level * 100); updStatus(); }; u(); b.addEventListener('levelchange', u); }).catch(() => {});
  if ('wakeLock' in navigator) { const wl = () => navigator.wakeLock.request('screen').catch(() => {}); wl(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wl(); }); }
  window.addEventListener('online', () => { updStatus(); syncTime(); flush(); });
  window.addEventListener('offline', updStatus);
  setInterval(flush, 10000);
  setInterval(ping, C.PING_SEC * 1000);
  I18N.on(() => { if (D) { stopCam(); renderMain(); } else renderReg(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  syncTime();
  if (D && D.token) { renderMain(); ping(); flush(); } else renderReg();
})();
