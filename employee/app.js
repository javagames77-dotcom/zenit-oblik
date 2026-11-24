// PWA сотрудника «Зеніт-Авто.облік»
(function () {
  const C = window.ZA_CONFIG, t = k => I18N.t(k), pick = o => I18N.pick(o), esc = UI.esc;
  const app = document.getElementById('app');
  const SKEY = 'za-emp';
  UI.theme.init();
  let S = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || null; } catch (e) { return null; } })();
  const saveS = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} };
  let tab = 'code', timers = [], wakeLock = null;
  const clear = () => { timers.forEach(x => clearInterval(x)); timers = []; if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } };
  const nowSrv = () => Math.floor((Date.now() + (S && S.offset || 0)) / 1000);

  async function syncTime() {
    try { const r = await API.time(); S.offset = new Date(r.now).getTime() - Date.now(); S.syncedAt = Date.now(); saveS(); } catch (e) {}
  }

  // ---------- активация ----------
  async function renderActivate(err) {
    clear();
    const invite = new URLSearchParams(location.search).get('invite') || '';
    const demo = API.mock ? await API.pendingInvites() : [];
    app.innerHTML = `<div class="act">
      <div class="r1"><span class="brand">${UI.brandHtml('../')}</span>
        <div class="seg" role="group" aria-label="Мова"><button type="button" data-lang="uk">УКР</button><button type="button" data-lang="ru">РУС</button></div></div>
      <h1>${t('hello')}!</h1>
      <p>${t('act_text')}</p>
      <ol class="steps"><li><em>1</em><div><b>${t('act_step1')}</b><small>${t('act_step1s')}</small></div></li><li><em>2</em><div>${t('act_step2')}</div></li></ol>
      <label class="f">${t('invite_code')}<input class="in mono" id="inv" value="${esc(invite)}" autocomplete="off" autocapitalize="characters"></label>
      ${err ? `<div class="hint" style="background:var(--er-bg);color:var(--er)">${t('act_bad')}</div>` : (invite ? '' : `<p>${t('act_need_link')}</p>`)}
      <button class="btn pri big" type="button" id="go">${t('activate')}</button>
      <div class="fine">${t('act_fine')}</div>
      ${demo.length ? `<div class="demo"><b>${t('demo_invites')}:</b>${demo.map(d => `<button class="btn sm" type="button" data-code="${esc(d.code)}">${esc(pick(d.employee.name))} · ${esc(d.code)}</button>`).join('')}</div>` : ''}
    </div>`;
    I18N.apply();
    const go = async code => {
      const b = document.getElementById('go'); b.disabled = true;
      try {
        const r = await API.activate(code);
        S = { secret: r.qr_secret, token: r.api_token, employee: r.employee, offset: new Date(r.server_time).getTime() - Date.now(), syncedAt: Date.now() };
        saveS(); history.replaceState(null, '', location.pathname); tab = 'code'; renderMain();
      } catch (e) { renderActivate(true); }
    };
    document.getElementById('go').onclick = () => go(document.getElementById('inv').value);
    app.querySelectorAll('[data-code]').forEach(b => b.onclick = () => go(b.dataset.code));
  }

  // ---------- основной экран ----------
  function renderMain() {
    clear();
    app.innerHTML = `<header class="abar"><span class="brand">${UI.brandHtml('../')}</span></header>
      <main class="scr" id="scr"></main>
      <nav class="tabbar">${[['code', 'my_code'], ['hist', 'my_punches'], ['prof', 'profile']].map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'on' : ''}"><i></i>${t(l)}</button>`).join('')}</nav>`;
    app.querySelector('.tabbar').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; renderMain(); } };
    ({ code: viewCode, hist: viewHist, prof: viewProf })[tab](document.getElementById('scr'));
  }

  async function viewCode(v) {
    const e = S.employee;
    v.innerHTML = `<span class="stat off" id="st">…</span>
      <div class="qrc"><div class="nm"><b>${esc(pick(e.name))}</b><span>${t('tab_no')} ${esc(e.tab)} · ${esc(pick(e.pos))} · ${esc(pick(e.branch))}</span></div>
        <div class="qrbox" id="qr" role="img" aria-label="QR"></div>
        <div class="tm"><div class="bar"><div id="qb" style="width:100%"></div></div><div class="row"><span id="ql"></span><span class="mono" id="qn"></span></div></div></div>
      <div class="hint">${t('code_hint')}</div>
      <div class="net hidden" id="net">${t('offline_note')}</div>`;
    let ts = 0;
    const draw = async () => {
      ts = nowSrv();
      const code = await API.makeLiveCode(S.secret, e.tab, ts);
      const box = document.getElementById('qr'); if (!box) return;
      box.innerHTML = UI.qrSvg(code, { ecc: 'M', margin: 1 });
      document.getElementById('qn').textContent = '№ ' + String(ts).slice(-4);
    };
    const tick = () => {
      const left = C.QR_REFRESH_SEC - (nowSrv() - ts);
      if (left <= 0) { draw(); }
      const l = Math.max(1, Math.min(C.QR_REFRESH_SEC, left <= 0 ? C.QR_REFRESH_SEC : left));
      const ql = document.getElementById('ql'); if (!ql) return;
      ql.textContent = `${t('code_refresh')} ${l} ${t('sec')}`;
      document.getElementById('qb').style.width = (100 * l / C.QR_REFRESH_SEC) + '%';
      document.getElementById('net').classList.toggle('hidden', navigator.onLine);
    };
    await draw(); tick();
    timers.push(setInterval(tick, 1000));
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(w => { wakeLock = w; }).catch(() => {});
    if (!S.syncedAt || Date.now() - S.syncedAt > 3600e3) syncTime();
    const status = async () => {
      try {
        const r = await API.me(S.token); const st = document.getElementById('st'); if (!st) return;
        const l = r.last;
        if (l && API.IN_SET.includes(l.event)) { st.className = 'stat'; st.innerHTML = `<span class="dot"></span>${t('at_work_since')} ${I18N.hm(l.scannedAt)}`; }
        else if (l && l.event === 'BREAK_OUT') { st.className = 'stat br'; st.textContent = `${t('on_break')} ${I18N.hm(l.scannedAt)}`; }
        else { st.className = 'stat off'; st.textContent = t('not_at_work'); }
        S.employee = r.employee; saveS();
      } catch (err) { if (err.message === 'auth') { S = null; saveS(); renderActivate(); } }
    };
    status(); timers.push(setInterval(status, 5000));
  }

  async function viewHist(v) {
    v.innerHTML = `<h2 class="t">${t('my_punches')}</h2><p class="sub">${t('last7')}</p><div id="days">…</div>`;
    try {
      const rows = await API.myEvents(S.token);
      const by = {}; rows.forEach(r => { const k = new Date(r.scannedAt).toDateString(); (by[k] = by[k] || []).push(r); });
      document.getElementById('days').innerHTML = Object.keys(by).length ? Object.entries(by).map(([k, list]) => `<div class="day" style="margin-bottom:12px">
        <div class="dh"><b>${I18N.dayTitle(k)}</b><span>${esc(pick(list[0].branch))}</span></div>
        ${list.map(r => `<div class="ev"><b>${I18N.hm(r.scannedAt)}</b><span>${t('ev_' + r.event)}</span>${UI.verdictPill(r.verdict)}</div>`).join('')}</div>`).join('') : `<p class="sub" style="margin:0">${t('no_punches')}</p>`;
    } catch (e) { document.getElementById('days').innerHTML = `<div class="net">${t('offline_note')}</div>`; }
  }

  function viewProf(v) {
    const e = S.employee;
    v.innerHTML = `<h2 class="t">${t('profile')}</h2>
      <div class="card p"><div class="kv"><span>${t('employee')}</span><b>${esc(pick(e.name))}</b><span>${t('tab_no')}</span><span class="mono">${esc(e.tab)}</span>
        <span>${t('c_pos')}</span><span>${esc(pick(e.pos))}</span><span>${t('c_branch')}</span><span>${esc(pick(e.branch))}</span></div></div>
      <div class="card p" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b>${t('language')}</b>
        <div class="seg" role="group" aria-label="Мова"><button type="button" data-lang="uk">УКР</button><button type="button" data-lang="ru">РУС</button></div></div>
      <div class="card p" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b>Темна тема / Темная тема</b><button class="btn sm" type="button" id="th">◐</button></div>
      <p class="sub" style="margin:0">${t('phone_change')}</p>
      <button class="btn" type="button" id="un">${t('unlink')}</button>`;
    I18N.apply(v);
    document.getElementById('th').onclick = () => UI.theme.toggle();
    document.getElementById('un').onclick = () => { if (confirm(t('unlink_q'))) { S = null; saveS(); renderActivate(); } };
  }

  I18N.on(() => { S && S.secret ? renderMain() : renderActivate(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S && S.secret && tab === 'code') renderMain(); });
  const inv = new URLSearchParams(location.search).get('invite');
  if (S && S.secret && !inv) renderMain(); else renderActivate();
})();
