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

  // ---------- установка и активация ----------
  // Два пути: 1) плакат филиала (?b=ключ) — табельный №, первый проход подтверждает охранник; 2) личное посилання (?invite=код).
  const UA = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(UA);
  const standalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  // браузеры, где Android-установка невозможна (встроенные в мессенджеры, Firefox и т.п.)
  const isChrome = isAndroid && /Chrome\/\d/.test(UA) && !/EdgA|OPR|SamsungBrowser|YaBrowser|Firefox|; wv\)|FB_IAB|FBAV|Instagram|Viber|Telegram|MiuiBrowser|HeyTap|UCBrowser/.test(UA);
  const iosInApp = isIOS && (/FBAN|FBAV|Instagram|Line\/|Telegram|Viber|GSA\//.test(UA) || !/Safari\//.test(UA));
  const P = new URLSearchParams(location.search);
  const BKEY = 'za-emp-b';
  const posterKey = () => P.get('b') || (() => { try { return localStorage.getItem(BKEY) || ''; } catch (e) { return ''; } })();
  if (P.get('b')) { try { localStorage.setItem(BKEY, P.get('b')); } catch (e) {} }
  let installEvt = null, installed = false, waited = false, forceHere = false;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!(S && S.secret)) renderActivate(); });
  window.addEventListener('appinstalled', () => { installed = true; installEvt = null; if (!(S && S.secret)) renderActivate(); });
  setTimeout(() => { waited = true; if (!(S && S.secret) && isAndroid && !installEvt) renderActivate(); }, 1800);

  const head = () => `<div class="r1"><span class="kick">${t('emp_kicker')}</span>
      <div class="seg" role="group" aria-label="Мова"><button type="button" data-lang="uk">УКР</button><button type="button" data-lang="ru">РУС</button></div></div>
    <div class="act-ico"><img src="../shared/logo.svg" alt="Зеніт-Авто"></div>`;
  const foot = () => { const h = new URL(window.ZA_CONFIG.ADMIN_URL || '../admin/index.html', location.href).href;
    return `<div class="act-foot">${t('emp_foot')} <a href="${esc(h)}">${esc(h.replace(/^https?:\/\//, ''))}</a></div>`; };
  const here = () => `<div class="fine"><a href="#" id="here">${t('inst_here')}</a></div>`;
  const IC = {
    dl: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>',
    ch: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5h8.2M8.9 13.8 4.8 6.7M15 13.8l-4.1 7.1"/></svg>',
    sh: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>'
  };
  // ссылка «открыть эту же страницу в Chrome»; если Chrome нет — вернемся сюда с nochrome=1
  const chromeIntent = () => {
    const back = new URL(location.href); back.searchParams.set('nochrome', '1');
    return `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(back.href)};end`;
  };
  const mount = (html, after) => {
    app.innerHTML = `<div class="act on-dark">${head()}${html}${foot()}</div>`;
    I18N.apply();
    const h = document.getElementById('here'); if (h) h.onclick = e => { e.preventDefault(); forceHere = true; renderActivate(); };
    if (after) after();
  };

  function renderActivate(err) {
    clear();
    const invite = P.get('invite') || '', bkey = posterKey();
    if (!standalone() && (isIOS || isAndroid) && !forceHere && (invite || bkey)) return renderInstall(invite);
    if (bkey && !invite) return renderWho(bkey);
    renderInvite(invite, err);
  }

  // ---- установка ----
  function renderInstall(invite) {
    const codeBox = invite ? `<div class="ios-code"><small>${t('invite_code')}</small><b class="mono">${esc(invite)}</b></div>` : '';
    if (isIOS && iosInApp) return mount(`<h1>${t('ios_safari_t')}</h1><p>${t('ios_safari_p')}</p>
      <ol class="steps big-steps"><li><em>1</em><div><b>${t('ios_safari_s1')}</b></div></li><li><em>2</em><div><b>${t('ios_safari_s2')}</b></div></li></ol>
      <button class="btn pri big" type="button" id="cp">${t('copy_link')}</button>${here()}`,
      () => { document.getElementById('cp').onclick = () => UI.copy(location.href, t('copied_sf')); });
    if (isIOS) return mount(`<h1>${t('ios_title')}</h1>
      <div class="iosdemo" aria-hidden="true">
        <div class="fr f1"><div class="sfbar"><div class="url">🔒 ${esc(location.host)}</div><div class="tb"><span>‹</span><span>›</span><span class="hl">${IC.sh}</span><span>▢</span><span>⧉</span></div></div></div>
        <div class="fr f2"><ul class="sheet"><li>Копіювати <span>⧉</span></li><li>Додати в закладки <span>☆</span></li><li class="go">На екран «Додому» <span>⊞</span></li></ul></div>
        <div class="fr f3"><div class="hs"><i></i><i></i><i></i><i></i><i></i><i class="za"><img src="../shared/logo.svg" alt=""><span class="tap"></span></i><i></i><i></i></div></div>
      </div>
      <ol class="steps big-steps anim">
        <li><em>1</em><div><b>${t('ios_s1')}</b><span class="share-ico">${IC.sh}</span><small>${t('ios_s1s')}</small></div></li>
        <li><em>2</em><div><b>${t('ios_s2')}</b><small>${t('ios_s2s')}</small></div></li>
        <li><em>3</em><div><b>${t('ios_s3')}</b><small>${t('ios_s3s')}</small></div></li>
      </ol>${codeBox}<div class="fine">${t('ios_fine')} <a href="#" id="here">${t('ios_here')}</a></div>`);
    // Android
    if (installed) return mount(`<h1>${t('inst_done_t')}</h1><p>${t('inst_done_p')}</p>${here()}`);
    if (installEvt) return mount(`<h1>${t('inst_title')}</h1><p>${t('inst_text')}</p>${codeBox}
      <button class="btn pri big inst pulse" type="button" id="inst">${IC.dl} ${t('inst_btn')}</button>
      <div class="fine">${t('inst_small')}</div>${here()}`, () => {
      document.getElementById('inst').onclick = async () => {
        const ev = installEvt; if (!ev) return;
        ev.prompt();
        try { const c = await ev.userChoice; if (c && c.outcome === 'accepted') { installed = true; installEvt = null; renderActivate(); } } catch (e) {}
      };
    });
    if (!waited) return mount(`<h1>${t('inst_title')}</h1><p>${t('inst_wait')}</p>`);
    if (P.get('nochrome')) return mount(`<h1>${t('inst_menu_t')}</h1><p>${t('inst_menu_p')}</p>
      <ol class="steps big-steps"><li><em>⋮</em><div><b>${t('inst_menu_s1')}</b></div></li><li><em>+</em><div><b>${t('inst_menu_s2')}</b></div></li><li><em>3</em><div><b>${t('inst_menu_s3')}</b></div></li></ol>${codeBox}${here()}`);
    if (isChrome) return mount(`<h1>${t('inst_open_ico')}</h1><p>${t('inst_open_ico_p')}</p><p>${t('inst_no_ico')}</p>${codeBox}${here()}`);
    return mount(`<h1>${t('inst_chrome_t')}</h1><p>${t('inst_chrome_p')}</p>${codeBox}
      <a class="btn pri big inst pulse" id="toch" href="${esc(chromeIntent())}">${IC.ch} ${t('inst_chrome_btn')}</a>
      <div class="fine">${t('inst_chrome_small')}</div>
      <button class="btn big" type="button" id="cp">${t('copy_link')}</button>${here()}`,
      () => { document.getElementById('cp').onclick = () => UI.copy(location.href.replace(/[?&]nochrome=1/, ''), t('copied_ch')); });
  }

  // ---- плакат: «Хто ви?» ----
  function renderWho(bkey, msg, found, tabv) {
    clear();
    if (found) return mount(`<h1>${t('who_is')}</h1>
      <div class="emp"><b>${esc(pick(found.name))}</b>${esc(pick(found.pos) || '')} · ${esc(pick(found.branch) || '')}<br>${t('tab_no')} <span class="mono">${esc(found.tab)}</span></div>
      ${msg ? `<div class="hint" style="background:var(--er-bg);color:var(--er)">${esc(msg)}</div>` : ''}
      <button class="btn pri big" type="button" id="yes">${t('who_yes')}</button>
      <button class="btn big" type="button" id="no">${t('who_no')}</button>
      <div class="fine">${t('who_fine')}</div>`, () => {
      document.getElementById('no').onclick = () => renderWho(bkey);
      document.getElementById('yes').onclick = async ev => {
        ev.target.disabled = true;
        try {
          const r = await API.claim(bkey, found.tab, true);
          S = { secret: r.qr_secret, token: r.api_token, employee: r.employee, pending: true, offset: new Date(r.server_time).getTime() - Date.now(), syncedAt: Date.now() };
          saveS(); history.replaceState(null, '', location.pathname); tab = 'code'; renderMain();
        } catch (e) { renderWho(bkey, e.net ? t('offline_note') : e.message, found); }
      };
    });
    mount(`<h1>${t('who_title')}</h1><p>${t('who_text')}</p>
      <label class="f">${t('who_tab')}<input class="in mono tabin" id="tabn" inputmode="numeric" autocomplete="off" value="${esc(tabv || '')}"></label>
      ${msg ? `<div class="hint" style="background:var(--er-bg);color:var(--er)">${esc(msg)}</div>` : ''}
      <button class="btn pri big" type="button" id="go">${t('who_next')}</button>`, () => {
      const inp = document.getElementById('tabn'), go = document.getElementById('go');
      const next = async () => {
        const v = inp.value.trim(); if (!v) { inp.focus(); return; }
        go.disabled = true;
        try { const r = await API.claim(bkey, v, false); renderWho(bkey, '', r.employee); }
        catch (e) { renderWho(bkey, e.net ? t('offline_note') : e.message, null, v); }
      };
      go.onclick = next; inp.onkeydown = e => { if (e.key === 'Enter') next(); };
    });
  }

  // ---- личное посилання ----
  async function renderInvite(invite, err) {
    const demo = API.mock ? await API.pendingInvites() : [];
    mount(`<h1>${t('hello')}!</h1>
      <p>${t('act_text')}</p>
      <label class="f">${t('invite_code')}<input class="in mono" id="inv" value="${esc(invite)}" autocomplete="off" autocapitalize="characters"></label>
      ${err ? `<div class="hint" style="background:var(--er-bg);color:var(--er)">${t('act_bad')}</div>` : (invite ? '' : `<p>${t('act_need_link')}</p>`)}
      <button class="btn pri big" type="button" id="go">${t('activate')}</button>
      <div class="fine">${t('act_fine')}</div>
      ${demo.length ? `<div class="demo"><b>${t('demo_invites')}:</b>${demo.map(d => `<button class="btn sm" type="button" data-code="${esc(d.code)}">${esc(pick(d.employee.name))} · ${esc(d.code)}</button>`).join('')}</div>` : ''}`, () => {
      const go = async code => {
        const b = document.getElementById('go'); b.disabled = true;
        try {
          const r = await API.activate(code);
          S = { secret: r.qr_secret, token: r.api_token, employee: r.employee, offset: new Date(r.server_time).getTime() - Date.now(), syncedAt: Date.now() };
          saveS(); history.replaceState(null, '', location.pathname); tab = 'code'; renderMain();
        } catch (e) { console.error(e); renderActivate(true); }
      };
      document.getElementById('go').onclick = () => go(document.getElementById('inv').value);
      app.querySelectorAll('[data-code]').forEach(b => b.onclick = () => go(b.dataset.code));
    });
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

  // ---------- выбор события ----------
  const PICK = ['IN', 'BREAK_OUT', 'BREAK_IN', 'DUTY_OUT', 'DUTY_IN', 'OUT'];
  let day = { last: null, today: [] }, choice = null;
  const lastKey = () => (day.last ? day.last.id || day.last.scannedAt : '');
  const curEv = () => (choice ? choice.ev : suggest());
  const hmNow = () => { const d = new Date(nowSrv() * 1000); return d.getHours() * 60 + d.getMinutes(); };
  const toMin = x => { const [h, m] = String(x).split(':'); return +h * 60 + (+m || 0); };
  const lunchWin = () => { const sc = day.schedule; return [sc && sc.lunchFrom || C.LUNCH_FROM || '11:00', sc && sc.lunchTo || C.LUNCH_TO || '13:00']; };
  const inLunch = () => hmNow() >= toMin(lunchWin()[0]) && hmNow() < toMin(lunchWin()[1]);
  const state = () => { const l = day.last && day.last.event; return !l || l === 'OUT' ? 'off' : l === 'BREAK_OUT' ? 'break' : l === 'DUTY_OUT' ? 'duty' : 'work'; };
  function suggest() {
    const st = state();
    if (st === 'off') return 'IN';
    if (st === 'break') return 'BREAK_IN';
    if (st === 'duty') return 'DUTY_IN';
    return inLunch() && !day.today.includes('BREAK_OUT') ? 'BREAK_OUT' : 'OUT';
  }
  // почему выбор выглядит странно (пусто — всё нормально)
  function doubt(k) {
    const st = state(), since = day.last ? I18N.hm(day.last.scannedAt) : '';
    if (st === 'off' && k !== 'IN') return t('pk_r_off');
    if (st === 'work' && k === 'IN') return `${t('pk_r_atwork')} ${since}.`;
    if (st === 'work' && (k === 'BREAK_IN' || k === 'DUTY_IN')) return `${t('pk_r_atwork')} ${since}.`;
    if (st === 'break' && k !== 'BREAK_IN') return `${t('pk_r_break')} ${since}.`;
    if (st === 'duty' && k !== 'DUTY_IN') return `${t('pk_r_duty')} ${since}.`;
    if (k === 'BREAK_OUT' && day.today.includes('BREAK_OUT')) return t('pk_r_lunchdone');
    if (k === 'BREAK_OUT' && !inLunch() && !(day.schedule && day.schedule.noControl)) { const d = new Date(nowSrv() * 1000); return `${t('pk_now')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}. ${t('pk_r_lunchtime')} ${lunchWin()[0]}–${lunchWin()[1]}.`; }
    return '';
  }

  async function viewCode(v) {
    const e = S.employee;
    v.innerHTML = `<span class="stat off" id="st">…</span>
      ${S.pending ? `<div class="pend" id="pend"><b>${t('pend_b')}</b> ${t('pend_t')}</div>` : ''}
      <div class="pick"><div class="pick-h">${t('pk_title')}</div><div class="pick-g" id="pk">${PICK.map(k => `<button type="button" data-ev="${k}">${t('pk_' + k)}<small>${t('pk_auto')}</small></button>`).join('')}</div></div>
      <div class="qrc"><div class="nm"><b>${esc(pick(e.name))}</b><span>${t('tab_no')} ${esc(e.tab)} · ${esc(pick(e.pos))} · ${esc(pick(e.branch))}</span></div>
        <div class="qrbox" id="qr" role="img" aria-label="QR"></div>
        <div class="tm"><div class="bar"><div id="qb" style="width:100%"></div></div><div class="row"><span id="ql"></span><span class="mono" id="qn"></span></div></div></div>
      <div class="hint">${t('code_hint')}</div>
      <div class="net hidden" id="net">${t('offline_note')}</div>`;
    let ts = 0;
    // ---- выбор события: подсказка по времени и последней отметке, сотрудник может сменить ----
    const paint = () => {
      const auto = suggest();
      v.querySelectorAll('#pk [data-ev]').forEach(b => { b.classList.toggle('on', b.dataset.ev === curEv()); b.classList.toggle('auto', b.dataset.ev === auto); });
    };
    v.querySelector('#pk').onclick = ev => {
      const b = ev.target.closest('[data-ev]'); if (!b) return;
      const k = b.dataset.ev; if (k === curEv()) return;
      const why = doubt(k);
      const apply = () => { choice = { ev: k, at: Date.now(), last: lastKey() }; paint(); draw(); };
      if (!why) return apply();
      const auto = suggest();
      UI.modal(`<h2>${t('pk_sure')}</h2><p>${t('pk_chose')} <b>«${t('pk_' + k)}»</b>. ${why}</p>
        <div class="acts" style="flex-direction:column;align-items:stretch"><button class="btn pri big" type="button" id="pkno">${t('pk_back')} «${t('pk_' + auto)}»</button>
        <button class="btn big" type="button" id="pkyes">${t('pk_yes')}</button></div>`, (m, close) => {
        m.querySelector('#pkno').onclick = () => { choice = null; close(); paint(); draw(); };
        m.querySelector('#pkyes').onclick = () => { close(); apply(); };
      });
    };
    const draw = async () => {
      ts = nowSrv();
      const code = await API.makeLiveCode(S.secret, e.tab, ts, curEv());
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
        const before = curEv(); day = { last: l, today: r.today || [], schedule: r.schedule || null };
        if (choice && (choice.last !== lastKey() || Date.now() - choice.at > 10 * 60e3)) choice = null; // отметились или прошло 10 минут — снова подсказка
        paint(); if (curEv() !== before) draw();
        if (l && API.IN_SET.includes(l.event)) { st.className = 'stat'; st.innerHTML = `<span class="dot"></span>${t('at_work_since')} ${I18N.hm(l.scannedAt)}`; }
        else if (l && l.event === 'BREAK_OUT') { st.className = 'stat br'; st.textContent = `${t('on_break')} ${I18N.hm(l.scannedAt)}`; }
        else { st.className = 'stat off'; st.textContent = t('not_at_work'); }
        S.employee = r.employee;
        if (S.pending && r.pending === false) { S.pending = false; saveS(); UI.toast(t('pend_ok'), 5000); const pd = document.getElementById('pend'); if (pd) pd.remove(); }
        saveS();
      } catch (err) { if (err.auth) { S = null; saveS(); renderActivate(); } }
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
    document.getElementById('un').onclick = () => { if (confirm(t('unlink_q'))) { if (S.pending) API.unclaim(S.token).catch(() => {}); S = null; saveS(); renderActivate(); } };
  }

  I18N.on(() => { S && S.secret ? renderMain() : renderActivate(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S && S.secret && tab === 'code') renderMain(); });
  // уже активирован — код в адресе игнорируем (на iPhone значок «Домой» всегда стартует с ним)
  if (S && S.secret) renderMain(); else renderActivate();
})();
