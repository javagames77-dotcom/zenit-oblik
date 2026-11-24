// Адмінка «Зеніт-Авто.облік»
(function () {
  const { t, pick } = { t: k => I18N.t(k), pick: o => I18N.pick(o) };
  const esc = UI.esc;
  const app = document.getElementById('app');
  const state = { branchId: 0, feedFilter: 'all', branches: [], lastFeedTop: null, timer: null, user: null };
  UI.theme.init();

  // токен админки хранится отдельно от токена PWA (za-emp) — не путаются даже в одном браузере
  const tokenGet = () => { try { return localStorage.getItem('za-admin-token'); } catch (e) { return null; } };
  const userGet = () => { try { return JSON.parse(localStorage.getItem('za-admin-user') || 'null'); } catch (e) { return null; } };
  const tokenSet = (tk, user) => { try { localStorage.setItem('za-admin-token', tk); localStorage.setItem('za-admin-user', JSON.stringify(user || {})); } catch (e) {} };
  const userSet = user => { try { localStorage.setItem('za-admin-user', JSON.stringify(user || {})); } catch (e) {} };
  const tokenDrop = () => { try { localStorage.removeItem('za-admin-token'); localStorage.removeItem('za-admin-user'); } catch (e) {} };
  const nameGet = () => { const u = userGet(); return (u && (u.name || u.login)) || 'admin'; };

  const ROUTES = [
    ['today', 'nav_today'], ['punches', 'nav_punches'], ['sb', 'nav_sb'], ['emps', 'nav_emps'],
    ['access', 'nav_access'], ['passes', 'nav_passes'], ['branches', 'nav_branches'], ['devices', 'nav_devices'], ['reports', 'nav_reports']
  ];
  const route = () => (location.hash.replace('#', '') || 'today').split('?')[0];
  const initials = n => n.split(' ').slice(0, 2).map(w => w[0]).join('');
  const today = () => new Date().toISOString().slice(0, 10);
  const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const placeTxt = r => `${esc(pick(r.branch))} · ${esc(pick(r.gate))}`;
  const evTxt = e => e ? t('ev_' + e) : '—';
  const minAgo = iso => Math.round((Date.now() - new Date(iso)) / 60e3);

  // ---------- вход ----------
  // Светлая карточка со значком «Адмінка» — специально не похожа на тёмный вход PWA.
  const langSeg = '<div class="seg" role="group" aria-label="Мова"><button type="button" data-lang="uk">УКР</button><button type="button" data-lang="ru">РУС</button></div>';
  const errText = err => err && err.net ? t('login_net') : err && err.status === 401 ? t('login_bad') : (err && err.message && !/^HTTP|^auth$/.test(err.message) ? err.message : t('login_bad'));

  function renderLogin(msg) {
    clearInterval(state.timer);
    app.innerHTML = `<div class="login"><form class="auth-card" id="lf" autocomplete="on">
      <div class="ac-top"><span class="brand">${UI.brandHtml('../')}</span>${langSeg}</div>
      <span class="ac-badge" data-i18n="login_badge"></span>
      <h1 data-i18n="login_title"></h1>
      <p class="ac-sub" data-i18n="login_sub"></p>
      <label class="f"><span data-i18n="login"></span><input class="in" id="lu" name="username" autocomplete="section-admin username" autocapitalize="off" spellcheck="false" required></label>
      <label class="f"><span data-i18n="password"></span><input class="in" id="lp" name="password" type="password" autocomplete="section-admin current-password" required></label>
      <div class="ac-err" id="le" ${msg ? '' : 'hidden'}>${esc(msg || '')}</div>
      <button class="btn pri ac-btn" type="submit" id="lb" data-i18n="login_btn"></button>
      ${API.mock && !API.live('admin.login') ? '<p class="ac-demo" data-i18n="demo_login"></p>' : ''}
      <p class="ac-foot"><span data-i18n="login_foot"></span></p>
    </form></div>`;
    I18N.apply();
    const lu = document.getElementById('lu'); lu.focus();
    document.getElementById('lf').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('lb'), le = document.getElementById('le');
      btn.disabled = true; btn.textContent = t('login_checking'); le.hidden = true;
      try {
        const r = await API.admin.login(lu.value.trim(), document.getElementById('lp').value);
        tokenSet(r.token, r.user);
        if (r.user && r.user.must_change) renderPassword(document.getElementById('lp').value); else boot();
      } catch (err) {
        le.textContent = errText(err); le.hidden = false;
        btn.disabled = false; btn.textContent = t('login_btn');
        document.getElementById('lp').select();
      }
    });
  }

  function renderPassword(oldPw) {
    app.innerHTML = `<div class="login"><form class="auth-card" id="pf">
      <div class="ac-top"><span class="brand">${UI.brandHtml('../')}</span>${langSeg}</div>
      <span class="ac-badge" data-i18n="login_badge"></span>
      <h1 data-i18n="pw_title"></h1>
      <p class="ac-sub" data-i18n="pw_sub"></p>
      <input type="text" name="username" autocomplete="section-admin username" value="${esc((userGet() || {}).login || '')}" hidden>
      ${oldPw ? '' : '<label class="f"><span data-i18n="pw_old"></span><input class="in" id="po" type="password" autocomplete="section-admin current-password" required></label>'}
      <label class="f"><span data-i18n="pw_new"></span><input class="in" id="pn" type="password" minlength="8" autocomplete="section-admin new-password" required></label>
      <label class="f"><span data-i18n="pw_new2"></span><input class="in" id="pn2" type="password" minlength="8" autocomplete="section-admin new-password" required></label>
      <div class="ac-err" id="pe" hidden></div>
      <button class="btn pri ac-btn" type="submit" id="pb" data-i18n="pw_btn"></button>
      <p class="ac-foot"><a href="#" id="pcancel" data-i18n="logout"></a></p>
    </form></div>`;
    I18N.apply();
    document.getElementById('pcancel').onclick = e => { e.preventDefault(); logout(); };
    document.getElementById('pf').addEventListener('submit', async e => {
      e.preventDefault();
      const pe = document.getElementById('pe'), pn = document.getElementById('pn').value, pn2 = document.getElementById('pn2').value;
      const show = m => { pe.textContent = m; pe.hidden = false; };
      if (pn.length < 8) return show(t('pw_short'));
      if (pn !== pn2) return show(t('pw_mismatch'));
      const btn = document.getElementById('pb'); btn.disabled = true;
      try {
        const r = await API.admin.password(oldPw || document.getElementById('po').value, pn);
        userSet(r.user); boot();
      } catch (err) {
        if (err.auth) { tokenDrop(); renderLogin(t('session_end')); return; }
        show(errText(err)); btn.disabled = false;
      }
    });
  }

  async function logout() {
    try { await API.admin.logout(); } catch (e) {}
    tokenDrop(); renderLogin();
  }

  // любой 401 из разделов админки — назад на вход
  window.addEventListener('unhandledrejection', ev => {
    if (ev.reason && ev.reason.auth) { ev.preventDefault(); tokenDrop(); renderLogin(t('session_end')); }
  });

  // ---------- каркас ----------
  function shell() {
    app.innerHTML = `
      <header class="hdr">
        <a class="brand" href="#today">${UI.brandHtml('../')}</a>
        <span class="sp"></span>
        <input class="in" type="search" id="gq" data-i18n-ph="search_emp" aria-label="Пошук">
        <div class="seg" role="group" aria-label="Мова"><button type="button" data-lang="uk">УКР</button><button type="button" data-lang="ru">РУС</button></div>
        <button class="moon" type="button" id="themeBtn" aria-label="Тема"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/></svg></button>
        <span class="user"><b>${esc(nameGet())}</b> · ${esc(roleTxt())}</span>
        <button class="btn" type="button" id="logoutBtn" data-i18n="logout"></button>
      </header>
      ${API.mock ? `<div class="demo-bar"><b data-i18n="demo_mode"></b><span>MOCK · localStorage</span><button type="button" id="resetBtn" data-i18n="reset_demo"></button>
        <a href="../employee/index.html" target="_blank">PWA</a><a href="../scanner/index.html" target="_blank">Scanner</a></div>` : ''}
      <div class="layout">
        <nav class="side" aria-label="Меню">${ROUTES.map(([r, k]) => `<a class="si" href="#${r}" data-r="${r}"><span data-i18n="${k}"></span>${r === 'sb' ? '<span class="b p-wa" id="sbBadge"></span>' : ''}${r === 'devices' ? '<span class="b p-er" id="devBadge"></span>' : ''}</a>`).join('')}
          <div class="ver"><span data-i18n="version"></span> 1.0</div></nav>
        <main class="main" id="view"></main>
      </div>`;
    I18N.apply();
    document.getElementById('themeBtn').onclick = () => UI.theme.toggle();
    document.getElementById('logoutBtn').onclick = logout;
    const rb = document.getElementById('resetBtn');
    if (rb) rb.onclick = async () => { await API.admin.reset(); UI.toast('OK'); render(); };
    document.getElementById('gq').addEventListener('keydown', e => { if (e.key === 'Enter') { location.hash = 'emps?q=' + encodeURIComponent(e.target.value); } });
  }

  async function render() {
    clearInterval(state.timer);
    document.querySelectorAll('.modal-bg').forEach(x => x.remove());
    const r = route();
    document.querySelectorAll('.si').forEach(a => a.classList.toggle('on', a.dataset.r === r));
    const v = document.getElementById('view');
    const fn = VIEWS[r] || VIEWS.today;
    await fn(v);
    I18N.apply(v);
    badges();
  }
  async function badges() {
    try {
      const d = await API.admin.dashboard(0);
      const sb = document.getElementById('sbBadge'), dv = document.getElementById('devBadge');
      if (sb) { sb.textContent = d.alertsOpen || ''; sb.classList.toggle('hidden', !d.alertsOpen); }
      const offN = d.devices.filter(x => !x.online).length;
      if (dv) { dv.textContent = offN || ''; dv.classList.toggle('hidden', !offN); }
    } catch (e) {}
  }
  const branchSelect = (id, val, allKey) => `<select class="in" id="${id}" aria-label="${t('c_branch')}"><option value="0">${esc(t(allKey || 'all_branches'))} (${state.branches.length})</option>${state.branches.map(b => `<option value="${b.id}" ${+val === b.id ? 'selected' : ''}>${esc(pick(b.name))}</option>`).join('')}</select>`;

  const rowPunch = (r, isNew) => `<tr class="${isNew ? 'new' : ''}">
    <td class="t">${I18N.hm(r.scannedAt)}${r.offline ? '<small>офлайн</small>' : ''}</td>
    <td>${r.employee ? `<b>${esc(pick(r.employee.name).split(' ').slice(0, 2).join(' '))}</b><small>${t('tab_no')} ${esc(r.employee.tab)}</small>` : r.guest ? `<b>${esc(r.guest.name)}</b><small>${t('guest_pass')} · ${esc(r.guest.code)}</small>` : `<b>${t('unknown_code')}</b><small class="mono">${esc((r.raw || '').slice(0, 22))}</small>`}</td>
    <td>${r.employee ? esc(pick(r.employee.pos)) : r.guest ? esc(r.guest.company) : '—'}</td>
    <td>${placeTxt(r)}</td>
    <td>${evTxt(r.event)}</td>
    <td>${UI.verdictPill(r.verdict)}${r.verdict === 'PWA_SCREEN' && r.codeAge ? `<small>${Math.round(r.codeAge / 60)} ${t('ago_min')}</small>` : ''}${r.reason ? `<small>${t('pr_' + r.reason)}</small>` : ''}</td></tr>`;
  const punchHead = () => `<thead><tr><th>${t('c_time')}</th><th>${t('c_emp')}</th><th>${t('c_pos')}</th><th>${t('c_place')}</th><th>${t('c_event')}</th><th>${t('c_code')}</th></tr></thead>`;

  // ---------- экраны ----------
  const VIEWS = {
    async today(v) {
      state.branches = await API.admin.branches();
      v.innerHTML = `<div class="mh"><div><h1>${t('today')}, ${I18N.dateLong(new Date())}</h1><p id="upd"></p></div>
        <div class="ctl">${branchSelect('bsel', state.branchId)}<button class="btn pri" id="xls" type="button">${t('export_excel')}</button></div></div>
        <div class="kpis" id="kpis"></div>
        <div class="cols">
          <section class="card feed"><div class="ch"><h2>${t('feed')}</h2><div class="tabsl" id="ff">
            <button type="button" data-f="all">${t('f_all')}</button><button type="button" data-f="flag">${t('f_flag')}</button><button type="button" data-f="rej">${t('f_rej')}</button></div></div>
            <div class="tw"><table>${punchHead()}<tbody id="feedB"></tbody></table></div></section>
          <div class="rcol"><section class="card rc"><h2>${t('sb_title')}</h2><p>${t('sb_sub')}</p><div id="watch"></div><a href="#sb" style="display:inline-block;margin-top:14px;font-weight:700">${t('sb_all')}</a></section>
            <section class="card rc"><h2>${t('devices')}</h2><div id="devs"></div></section></div>
        </div>`;
      document.getElementById('bsel').onchange = e => { state.branchId = +e.target.value; state.lastFeedTop = null; load(); };
      document.getElementById('ff').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { state.feedFilter = b.dataset.f; load(); } };
      document.getElementById('xls').onclick = async () => exportPunches({ from: today(), to: today(), branchId: state.branchId });
      async function load() {
        const d = await API.admin.dashboard(state.branchId);
        if (route() !== 'today') return;
        document.getElementById('upd').textContent = `${t('updated_at')} ${I18N.hm(new Date())}`;
        document.getElementById('kpis').innerHTML = `
          <div class="card kpi"><div class="l">${t('on_site')}</div><div class="v">${d.onSite} <span style="font-size:17px;font-weight:500;color:var(--mu)">${t('of')} ${d.total}</span></div><div class="bar"><div style="width:${d.total ? Math.round(100 * d.onSite / d.total) : 0}%"></div></div>
            <a class="s" href="#passes" style="display:block;color:#2350B8;text-decoration:none">${t('guests')}: ${d.guestsOnSite} · ${d.passesActive} ${t('passes_active')}</a></div>
          <a class="card kpi" href="#punches"><div class="l">${t('punches_today')}</div><div class="v">${d.today}</div><div class="s" style="color:var(--ok)">${d.liveShare}% — ${t('live_share')}</div></a>
          <a class="card kpi w" href="#sb"><div class="l">${t('k_screen')}</div><div class="v">${d.screen}</div><div class="s">${d.screenEmps} ${t('emps_n')}</div></a>
          <a class="card kpi w" href="#sb"><div class="l">${t('k_static')}</div><div class="v">${d.static}</div><div class="s">${t('static_sub')}</div></a>
          <a class="card kpi e" href="#sb"><div class="l">${t('k_noaccess')}</div><div class="v">${d.noAccess}</div><div class="s">${t('noaccess_sub')}</div></a>
          <a class="card kpi e" href="#sb"><div class="l">${t('k_rejected')}</div><div class="v">${d.rejected + d.replay}</div><div class="s">${t('rejected_sub')}</div></a>`;
        document.querySelectorAll('#ff button').forEach(b => b.classList.toggle('on', b.dataset.f === state.feedFilter));
        const feed = d.feed.filter(r => state.feedFilter === 'all' || (state.feedFilter === 'flag' ? !['PWA_LIVE', 'PASS_OK'].includes(r.verdict) : ['INVALID', 'REPLAY', 'NO_ACCESS', 'PASS_DENIED'].includes(r.verdict)));
        const top = feed[0] && feed[0].id;
        document.getElementById('feedB').innerHTML = feed.length ? feed.map((r, i) => rowPunch(r, state.lastFeedTop && i === 0 && top !== state.lastFeedTop)).join('') : `<tr><td colspan="6" class="empty">—</td></tr>`;
        state.lastFeedTop = top;
        document.getElementById('watch').innerHTML = d.watch.length ? d.watch.map(w => `<div class="wl"><div class="av">${esc(initials(pick(w.employee.name)))}</div>
          <div class="n">${esc(pick(w.employee.name).split(' ').slice(0, 2).join(' '))}<small>${esc(pick(w.employee.pos))} · ${esc(pick(w.employee.branch))}</small>${UI.verdictPill(w.verdict).replace('</span>', ` · ${w.count}</span>`)}</div></div>`).join('') : '<p>—</p>';
        const off = d.devices.filter(x => !x.online);
        document.getElementById('devs').innerHTML = `<div class="st"><div style="background:var(--ok-bg);color:var(--ok)"><b>${d.devices.length - off.length}</b>${t('online')}</div>
          <div style="background:var(--er-bg);color:var(--er)"><b>${off.length}</b>${t('offline')}</div></div>
          ${off.map(x => `<div class="off"><b>${esc(pick(x.branch))} · ${esc(pick(x.gate))}</b><small>${t('no_link_min')} ${minAgo(x.lastSeen)} ${t('min')} · ${t('in_queue')} ${x.queue} ${t('punches_w')} · ${x.battery}%</small></div>`).join('')}`;
        badges();
      }
      await load();
      state.timer = setInterval(load, 4000);
    },

    async punches(v) {
      state.branches = await API.admin.branches();
      v.innerHTML = `<div class="mh"><div><h1>${t('punches_page')}</h1><p id="cnt"></p></div></div>
        <div class="card" style="padding:16px 20px"><div class="ctl">
          <label class="f"><span>${t('date_from')}</span><input class="in" type="date" id="pf" value="${daysAgo(6)}"></label>
          <label class="f"><span>${t('date_to')}</span><input class="in" type="date" id="pt" value="${today()}"></label>
          <label class="f"><span>${t('c_branch')}</span>${branchSelect('pb', state.branchId)}</label>
          <label class="f"><span>${t('f_verdict')}</span><select class="in" id="pv"><option value="">${t('any')}</option><option value="flag">${t('f_flag')}</option>
            ${['PWA_LIVE', 'PWA_SCREEN', 'STATIC', 'NO_ACCESS', 'REPLAY', 'INVALID', 'PASS_OK', 'PASS_SCREEN', 'PASS_DENIED'].map(x => `<option value="${x}">${t('v_' + x)}</option>`).join('')}</select></label>
          <label class="f" style="flex:1 1 200px"><span>${t('c_emp')}</span><input class="in" id="pq" data-i18n-ph="search_emp"></label>
          <button class="btn pri" type="button" id="pcsv">${t('export_csv')}</button></div></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table>${punchHead()}<tbody id="pB"></tbody></table></div></section>`;
      const f = () => ({ from: pf.value, to: pt.value, branchId: +pb.value, verdict: pv.value, q: pq.value });
      const pf = v.querySelector('#pf'), pt = v.querySelector('#pt'), pb = v.querySelector('#pb'), pv = v.querySelector('#pv'), pq = v.querySelector('#pq');
      const load = async () => {
        const rows = await API.admin.punches(f());
        v.querySelector('#cnt').textContent = `${t('found')}: ${rows.length}`;
        v.querySelector('#pB').innerHTML = rows.slice(0, 400).map(r => rowPunch(r).replace(`<td class="t">`, `<td class="t">${new Date(r.scannedAt).toLocaleDateString('uk-UA').slice(0, 5)} `)).join('') || `<tr><td colspan="6" class="empty">—</td></tr>`;
      };
      [pf, pt, pb, pv].forEach(x => x.onchange = load); pq.oninput = load;
      v.querySelector('#pcsv').onclick = () => exportPunches(f());
      await load();
    },

    async sb(v) {
      v.innerHTML = `<div class="mh"><div><h1>${t('sb_page')}</h1><p>${t('sb_page_sub')}</p></div>
        <div class="ctl"><label class="chk"><input type="checkbox" id="unc" checked> ${t('f_unchecked')}</label></div></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th>${t('c_date')}</th><th>${t('c_emp')}</th><th>${t('c_place')}</th><th>${t('c_event')}</th><th>${t('c_code')}</th><th></th></tr></thead><tbody id="sbB"></tbody></table></div></section>`;
      const load = async () => {
        const rows = await API.admin.punches({ from: daysAgo(30), to: today(), verdict: 'flag', unchecked: v.querySelector('#unc').checked });
        v.querySelector('#sbB').innerHTML = rows.map(r => `<tr><td class="t">${new Date(r.scannedAt).toLocaleDateString('uk-UA').slice(0, 5)} ${I18N.hm(r.scannedAt)}</td>
          <td>${r.employee ? `<b>${esc(pick(r.employee.name))}</b><small>${t('tab_no')} ${esc(r.employee.tab)} · ${esc(pick(r.employee.pos))}</small>` : r.guest ? `<b>${esc(r.guest.name)}</b><small>${t('guest_pass')} · ${esc(r.guest.company)}</small>` : `<b>${t('unknown_code')}</b>`}</td>
          <td>${placeTxt(r)}</td><td>${evTxt(r.event)}</td><td>${UI.verdictPill(r.verdict)}${r.codeAge && r.verdict === 'PWA_SCREEN' ? `<small>${Math.round(r.codeAge / 60)} ${t('ago_min')}</small>` : ''}${r.reason ? `<small>${t('pr_' + r.reason)}</small>` : ''}</td>
          <td>${r.checked ? `<span class="pill p-mu">${t('checked')}</span>` : `<button class="btn sm" type="button" data-chk="${r.id}">${t('mark_checked')}</button>`}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">—</td></tr>`;
      };
      v.querySelector('#unc').onchange = load;
      v.addEventListener('click', async e => { const b = e.target.closest('[data-chk]'); if (b) { await API.admin.check(b.dataset.chk); load(); badges(); } });
      await load();
    },

    async emps(v) {
      state.branches = await API.admin.branches();
      const q0 = decodeURIComponent((location.hash.split('q=')[1] || ''));
      const sel = new Set();
      v.innerHTML = `<div class="mh"><div><h1>${t('emps_page')}</h1><p id="ecnt"></p></div>
        <div class="ctl"><input class="in" id="eq" style="width:260px" value="${esc(q0)}" data-i18n-ph="search_emp"><button class="btn pri" type="button" id="eadd">${t('add_emp')}</button></div></div>
        <div class="bulk hidden" id="bulk"><b id="bn"></b>
          <button class="btn sm" type="button" data-bulk="open">${t('open_access')}</button><button class="btn sm" type="button" data-bulk="close">${t('close_access')}</button>
          <button class="btn sm" type="button" data-bulk="profile">${t('assign_profile')}</button><button class="btn sm" type="button" data-bulk="block" style="color:var(--er)">${t('block_all')}</button>
          <button class="lnk" type="button" data-bulk="clear">${t('clear_sel')}</button></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th><input type="checkbox" id="eall" aria-label="all"></th><th>${t('c_tab')}</th><th>${t('c_name')}</th><th>${t('c_pos')}</th><th>${t('c_branch')}</th><th>${t('c_access')}</th><th>${t('c_phone')}</th><th>${t('c_actions')}</th></tr></thead><tbody id="eB"></tbody></table></div></section>`;
      let list = [];
      const accCell = e => e.blocked ? `<span class="pill p-er">${t('src_blocked')}</span>` :
        `${e.profile ? `<span class="pill p-bl">${esc(pick(e.profile))}</span>` : `<span class="pill p-mu">${t('src_home')}</span>`}${e.extra ? `<small>+${e.extra} ${t('extra_n')}</small>` : ''}`;
      const bulkUpd = () => { const b = v.querySelector('#bulk'); b.classList.toggle('hidden', !sel.size); v.querySelector('#bn').textContent = `${t('selected')}: ${sel.size}`; };
      const load = async () => {
        list = await API.admin.employees(v.querySelector('#eq').value);
        v.querySelector('#ecnt').textContent = `${t('found')}: ${list.length}`;
        v.querySelector('#eB').innerHTML = list.map(e => `<tr>
          <td><input type="checkbox" data-sel="${e.id}" ${sel.has(e.id) ? 'checked' : ''} aria-label="${esc(e.tab)}"></td>
          <td class="t mono">${esc(e.tab)}</td><td><button class="namebtn" type="button" data-ed="${e.id}">${esc(pick(e.name))}</button>${e.active ? '' : `<small style="color:var(--er)">${t('fired')}</small>`}</td><td>${esc(pick(e.pos))}</td><td>${esc(pick(e.branch))}</td>
          <td>${accCell(e)}</td>
          <td>${e.appActive ? `<span class="pill p-ok">${t('app_on')}</span>` : `<span class="pill p-mu">${t('app_off')}</span>`}</td>
          <td><div class="acts"><button class="btn sm" type="button" data-acc="${e.id}">${t('tab_access')}</button><button class="btn sm" type="button" data-inv="${e.id}" ${e.active ? '' : 'disabled'}>${t('invite')}</button>
            <button class="btn sm" type="button" data-st="${e.id}" ${e.active ? '' : 'disabled'}>${t('static_qr')}</button></div></td></tr>`).join('') || `<tr><td colspan="8" class="empty">—</td></tr>`;
        bulkUpd();
      };
      v.querySelector('#eq').oninput = load;
      v.querySelector('#eadd').onclick = () => editEmp(null, load);
      v.querySelector('#eall').onchange = e => { list.forEach(x => e.target.checked ? sel.add(x.id) : sel.delete(x.id)); load(); };
      v.addEventListener('change', e => { const c = e.target.closest('[data-sel]'); if (c) { c.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); bulkUpd(); } });
      v.addEventListener('click', async e => {
        const bb = e.target.closest('[data-bulk]');
        if (bb) {
          const ids = [...sel], k = bb.dataset.bulk;
          if (k === 'clear') { sel.clear(); load(); }
          if (k === 'open' || k === 'close') accessBulkModal(ids, k === 'open', () => { load(); });
          if (k === 'profile') profileBulkModal(ids, load);
          if (k === 'block') { await API.admin.setBlocked(ids, true); UI.toast(`${t('src_blocked')}: ${ids.length}`); load(); }
          return;
        }
        const b = e.target.closest('button'); if (!b) return;
        const id = +(b.dataset.inv || b.dataset.st || b.dataset.ed || b.dataset.acc); const emp = list.find(x => x.id === id);
        if (b.dataset.inv) inviteModal(emp, load);
        if (b.dataset.st) staticModal(emp);
        if (b.dataset.ed) editEmp(emp, load);
        if (b.dataset.acc) editEmp(emp, load, 'access');
      });
      await load();
    },

    async access(v) {
      const bs = await API.admin.branches();
      const sub = (location.hash.split('?')[1] || 'profiles');
      v.innerHTML = `<div class="mh"><div><h1>${t('acc_page')}</h1><p>${t('acc_page_sub')}</p></div></div>
        <div class="tabs2"><button type="button" data-t="profiles" class="${sub === 'profiles' ? 'on' : ''}">${t('profiles')}</button><button type="button" data-t="gates" class="${sub !== 'profiles' ? 'on' : ''}">${t('by_gate')}</button></div>
        <div id="ab"></div>`;
      v.querySelector('.tabs2').onclick = e => { const b = e.target.closest('[data-t]'); if (b) location.hash = 'access?' + b.dataset.t; };
      const box = v.querySelector('#ab');
      if (sub === 'profiles') {
        const ps = await API.admin.profiles();
        box.innerHTML = `<div class="ctl" style="margin-bottom:14px"><button class="btn pri" type="button" id="padd">${t('add_profile')}</button></div>
          <div class="bcards">${ps.map(p => `<section class="card bc"><h3>${esc(pick(p.name))}</h3><p>${p.staff} ${t('emps_n')} · ${p.gateIds.length} ${t('gates')}</p>
            <div class="chips">${p.places.map(x => `<span class="pill p-mu">${esc(pick(x.branch))} · ${esc(pick(x.gate))}</span>`).join('')}</div>
            <button class="btn sm" type="button" data-pe="${p.id}" style="margin-top:12px">${t('edit')}</button></section>`).join('')}</div>`;
        const edit = p => UI.modal(`<h2>${p ? esc(pick(p.name)) : t('add_profile')}</h2>
          <div class="grid2"><label class="f">${t('profile_name')} (УКР)<input class="in" id="nu" value="${p ? esc(p.name.uk) : ''}"></label><label class="f">${t('profile_name')} (РУС)<input class="in" id="nr" value="${p ? esc(p.name.ru) : ''}"></label></div>
          <p style="margin:16px 0 8px;font-weight:700;color:var(--ink)">${t('choose_locs')}</p>${UI.gateTree(bs, p ? p.gateIds : [])}
          <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ok">${t('save')}</button></div>`,
          (m, close) => { const get = UI.bindTree(m); m.querySelector('#ok').onclick = async () => { const uk = m.querySelector('#nu').value.trim(); if (!uk) return;
            await API.admin.saveProfile({ id: p && p.id, name: { uk, ru: m.querySelector('#nr').value.trim() || uk }, gateIds: get() }); close(); render(); }; });
        box.querySelector('#padd').onclick = () => edit(null);
        box.addEventListener('click', e => { const b = e.target.closest('[data-pe]'); if (b) edit(ps.find(x => x.id === +b.dataset.pe)); });
      } else {
        const gid = +(sessionStorage.getItem('za-gate') || bs[0].gates[0].id);
        box.innerHTML = `<div class="ctl" style="margin-bottom:14px"><label class="f"><span>${t('c_gate')}</span><select class="in" id="gsel">${bs.map(b => `<optgroup label="${esc(pick(b.name))}">${b.gates.map(g => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${esc(pick(b.name))} · ${esc(pick(g.name))}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <button class="btn pri" type="button" id="gadd">${t('add_person')}</button></div>
          <section class="card" style="overflow:hidden"><div class="ch"><h2>${t('who_access')}</h2><span id="gcnt" style="color:var(--mu)"></span></div><div class="tw"><table><thead><tr><th>${t('c_tab')}</th><th>${t('c_name')}</th><th>${t('c_pos')}</th><th>${t('c_branch')}</th><th>${t('c_access')}</th><th></th></tr></thead><tbody id="gB"></tbody></table></div></section>`;
        const gsel = box.querySelector('#gsel');
        const load = async () => {
          const g = +gsel.value; sessionStorage.setItem('za-gate', g);
          const rows = await API.admin.gateAccess(g);
          box.querySelector('#gcnt').textContent = `${rows.filter(r => r.allowed).length} ${t('emps_n')}`;
          box.querySelector('#gB').innerHTML = rows.sort((a, b) => b.allowed - a.allowed).map(r => `<tr style="${r.allowed ? '' : 'opacity:.6'}"><td class="t mono">${esc(r.employee.tab)}</td><td><b>${esc(pick(r.employee.name))}</b></td><td>${esc(pick(r.employee.pos))}</td><td>${esc(pick(r.employee.branch))}</td>
            <td>${srcPill(r)}</td><td>${r.allowed ? `<button class="btn sm" type="button" data-cl="${r.employee.id}">${t('close_access')}</button>` : r.src === 'deny' ? `<button class="btn sm" type="button" data-rs="${r.employee.id}">${t('open_access')}</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">—</td></tr>`;
        };
        gsel.onchange = load;
        box.addEventListener('click', async e => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.cl) { await API.admin.setAccess([+b.dataset.cl], [+gsel.value], false); load(); }
          if (b.dataset.rs) { await API.admin.resetAccess(+b.dataset.rs, +gsel.value); load(); }
          if (b.id === 'gadd') pickPeopleModal(+gsel.value, load);
        });
        await load();
      }
    },

    async passes(v) {
      const bs = await API.admin.branches();
      v.innerHTML = `<div class="mh"><div><h1>${t('passes_page')}</h1><p>${t('passes_sub')}</p></div>
        <div class="ctl"><label class="chk"><input type="checkbox" id="pact" checked> ${t('f_active_only')}</label><button class="btn pri" type="button" id="pnew">${t('new_pass')}</button></div></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th>${t('c_guest')}</th><th>${t('pp_where')}</th><th>${t('c_valid')}</th><th>${t('c_status')}</th><th>${t('entries')}</th><th>${t('issued_by')}</th><th></th></tr></thead><tbody id="psB"></tbody></table></div></section>`;
      let rows = [];
      const leftTxt = p => { const ms = new Date(p.to) - Date.now(); if (ms <= 0) return ''; const h = Math.floor(ms / 36e5); return `${t('left')} ${h >= 24 ? Math.floor(h / 24) + ' ' + t('d_short') + ' ' : ''}${h % 24} ${t('h_short')}`; };
      const dt = iso => `${new Date(iso).toLocaleDateString('uk-UA').slice(0, 5)} ${I18N.hm(iso)}`;
      const stCls = { active: 'p-ok', future: 'p-bl', expired: 'p-mu', revoked: 'p-er', used: 'p-mu' };
      const load = async () => {
        rows = await API.admin.passes();
        const only = v.querySelector('#pact').checked;
        v.querySelector('#psB').innerHTML = rows.filter(p => !only || ['active', 'future'].includes(p.status)).map(p => `<tr>
          <td><b>${esc(p.name)}</b><small>${esc(p.company)}${p.phone ? ' · ' + esc(p.phone) : ''}</small></td>
          <td>${p.places.map(x => `${esc(pick(x.branch))} · ${esc(pick(x.gate))}`).join('<br>')}</td>
          <td class="t">${dt(p.from)}<small>→ ${dt(p.to)}</small></td>
          <td><span class="pill ${stCls[p.status]}">${t('st_' + p.status)}</span>${p.status === 'active' ? `<small>${leftTxt(p)}</small>` : ''}</td>
          <td>${p.uses}${p.maxUses ? ' / ' + p.maxUses : ''}</td><td><small style="color:var(--ink)">${esc(p.issuedBy)}</small></td>
          <td><div class="acts">${['active', 'future'].includes(p.status) ? `<button class="btn sm" type="button" data-pl="${p.id}">${t('show_link')}</button><button class="btn sm" type="button" data-pr="${p.id}" style="color:var(--er)">${t('revoke')}</button>` : ''}</div></td></tr>`).join('') || `<tr><td colspan="7" class="empty">—</td></tr>`;
      };
      v.querySelector('#pact').onchange = load;
      v.querySelector('#pnew').onclick = () => newPassModal(bs, load);
      v.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.pr) { await API.admin.revokePass(+b.dataset.pr); UI.toast(t('st_revoked')); load(); }
        if (b.dataset.pl) passLinkModal(rows.find(x => x.id === +b.dataset.pl));
      });
      await load();
    },

    async branches(v) {
      const bs = await API.admin.branches();
      v.innerHTML = `<div class="mh"><div><h1>${t('branches_page')}</h1></div><div class="ctl"><button class="btn pri" type="button" id="badd">${t('add_branch')}</button></div></div>
        <div class="bcards">${bs.map(b => `<section class="card bc"><h3>${esc(pick(b.name))}</h3><p>${b.staff} ${t('emps_n')} · ${b.gates.length} ${t('gates')}</p>
          <ul>${b.gates.map(g => `<li><span>${esc(pick(g.name))}</span></li>`).join('')}</ul>
          <button class="btn sm" type="button" data-addg="${b.id}">${t('add_gate')}</button></section>`).join('')}</div>`;
      const ask = (title, cb) => UI.modal(`<h2>${esc(title)}</h2>
        <div class="grid2"><label class="f">УКР<input class="in" id="nu" required></label><label class="f">РУС<input class="in" id="nr"></label></div>
        <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ok">${t('save')}</button></div>`,
        (m, close) => { m.querySelector('#ok').onclick = async () => { const uk = m.querySelector('#nu').value.trim(); if (!uk) return; await cb({ uk, ru: m.querySelector('#nr').value.trim() || uk }); close(); render(); }; });
      v.querySelector('#badd').onclick = () => ask(t('branch_name'), n => API.admin.saveBranch(n));
      v.addEventListener('click', e => { const b = e.target.closest('[data-addg]'); if (b) ask(t('gate_name'), n => API.admin.saveGate(+b.dataset.addg, n)); });
    },

    async devices(v) {
      const ds = await API.admin.devices(); const bs = await API.admin.branches();
      v.innerHTML = `<div class="mh"><div><h1>${t('devices_page')}</h1></div><div class="ctl"><button class="btn pri" type="button" id="dadd">${t('new_device')}</button></div></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th>${t('c_status')}</th><th>${t('c_branch')}</th><th>${t('c_gate')}</th><th>ID</th><th>${t('c_seen')}</th><th>${t('c_queue')}</th><th>${t('c_battery')}</th><th></th></tr></thead>
        <tbody>${ds.map(d => `<tr><td>${d.online ? `<span class="pill p-ok">${t('online')}</span>` : `<span class="pill p-er">${t('offline')}</span>`}</td>
          <td><b>${esc(pick(d.branch))}</b></td><td>${esc(pick(d.gate))}</td><td class="mono">${esc(d.name)}</td>
          <td class="t">${minAgo(d.lastSeen) < 1 ? '&lt; 1' : minAgo(d.lastSeen)} ${t('min')}</td><td>${d.queue}</td><td>${d.battery}%</td><td class="mono" style="color:var(--mu)">v${esc(d.version || '')}</td></tr>`).join('')}</tbody></table></div></section>`;
      v.querySelector('#dadd').onclick = () => UI.modal(`<h2>${t('new_device')}</h2><label class="f">${t('choose_gate')}<select class="in" id="gs">
        ${bs.map(b => b.gates.map(g => `<option value="${g.id}">${esc(pick(b.name))} · ${esc(pick(g.name))}</option>`).join('')).join('')}</select></label>
        <div id="res"></div><div class="acts"><button class="btn" type="button" data-close>${t('close')}</button><button class="btn pri" type="button" id="mk">${t('create')}</button></div>`,
        (m) => { m.querySelector('#mk').onclick = async () => {
          const r = await API.admin.createDeviceCode(+m.querySelector('#gs').value);
          m.querySelector('#res').innerHTML = `<p style="margin-top:14px">${t('reg_text')}</p><div class="code-big mono">${esc(r.code)}</div>`;
          m.querySelector('#mk').remove();
        }; });
    },

    async reports(v) {
      state.branches = await API.admin.branches();
      v.innerHTML = `<div class="mh"><div><h1>${t('reports_page')}</h1><p>${t('rep_hint')}</p></div></div>
        <div class="card" style="padding:16px 20px"><h2 style="margin:0 0 12px;font-size:19px">${t('rep_first_last')}</h2><div class="ctl">
          <label class="f"><span>${t('date_from')}</span><input class="in" type="date" id="rf" value="${daysAgo(6)}"></label>
          <label class="f"><span>${t('date_to')}</span><input class="in" type="date" id="rt" value="${today()}"></label>
          <label class="f"><span>${t('c_branch')}</span>${branchSelect('rb', 0)}</label>
          <button class="btn pri" type="button" id="rgo">${t('rep_build')}</button><button class="btn" type="button" id="rcsv">${t('export_csv')}</button></div></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th>${t('c_date')}</th><th>${t('c_tab')}</th><th>${t('c_name')}</th><th>${t('c_branch')}</th><th>${t('first_in')}</th><th>${t('last_out')}</th><th>${t('hours')}</th><th>${t('flags')}</th></tr></thead><tbody id="rB"></tbody></table></div></section>`;
      let rows = [];
      const hrs = r => r.first && r.last ? ((new Date(r.last) - new Date(r.first)) / 36e5).toFixed(1) : '—';
      const f = () => ({ from: v.querySelector('#rf').value, to: v.querySelector('#rt').value, branchId: +v.querySelector('#rb').value });
      const go = async () => {
        rows = await API.admin.report(f());
        v.querySelector('#rB').innerHTML = rows.map(r => `<tr><td class="t">${r.day.slice(8)}.${r.day.slice(5, 7)}</td><td class="mono">${esc(r.employee.tab)}</td><td><b>${esc(pick(r.employee.name))}</b></td><td>${esc(pick(r.branch))}</td>
          <td class="t">${r.first ? I18N.hm(r.first) : '—'}</td><td class="t">${r.last ? I18N.hm(r.last) : '—'}</td><td class="t">${hrs(r)}</td><td>${r.flags ? `<span class="pill p-wa">${r.flags}</span>` : ''}</td></tr>`).join('') || `<tr><td colspan="8" class="empty">—</td></tr>`;
      };
      v.querySelector('#rgo').onclick = go;
      v.querySelector('#rcsv').onclick = async () => { if (!rows.length) await go();
        UI.download(`zvit_${f().from}_${f().to}.csv`, UI.csv([[t('c_date'), t('c_tab'), t('c_name'), t('c_branch'), t('first_in'), t('last_out'), t('hours'), t('flags')],
          ...rows.map(r => [r.day, r.employee.tab, pick(r.employee.name), pick(r.branch), r.first ? I18N.hm(r.first) : '', r.last ? I18N.hm(r.last) : '', hrs(r), r.flags])])); };
      await go();
    }
  };

  async function exportPunches(f) {
    const rows = await API.admin.punches(f);
    UI.download(`vidmitky_${f.from}_${f.to}.csv`, UI.csv([[t('c_date'), t('c_time'), t('c_tab'), t('c_name'), t('c_pos'), t('c_branch'), t('c_gate'), t('c_event'), t('c_code'), 'offline'],
      ...rows.map(r => [r.scannedAt.slice(0, 10), I18N.hm(r.scannedAt), r.employee ? r.employee.tab : '', r.employee ? pick(r.employee.name) : t('unknown_code'), r.employee ? pick(r.employee.pos) : '',
        pick(r.branch), pick(r.gate), r.event ? t('ev_' + r.event) : '', t('v_' + r.verdict), r.offline ? '1' : ''])]));
  }

  // ---------- модальные окна сотрудника ----------
  const srcPill = g => {
    const u = g.until ? ` ${t('until')} ${new Date(g.until).toLocaleDateString('uk-UA').slice(0, 5)}` : '';
    return { home: `<span class="pill p-mu">${t('src_home')}</span>`, profile: `<span class="pill p-bl">${t('src_profile')}</span>`, manual: `<span class="pill p-ok">${t('src_manual')}${u}</span>`,
      deny: `<span class="pill p-er">${t('src_deny')}${u}</span>`, blocked: `<span class="pill p-er">${t('src_blocked')}</span>` }[g.src] || '';
  };
  const termHtml = () => `<label class="f">${t('acc_term')}<span style="display:flex;gap:8px"><select class="in" id="aterm"><option value="">${t('forever')}</option><option value="d">${t('till_date')}</option></select><input class="in hidden" type="date" id="adate" value="${new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)}"></span></label>`;
  const bindTerm = m => { const s1 = m.querySelector('#aterm'), d = m.querySelector('#adate'); s1.onchange = () => d.classList.toggle('hidden', !s1.value); return () => s1.value && d.value ? new Date(d.value + 'T23:59:59').toISOString() : null; };

  async function accessPanel(box, empId, done) {
    const a = await API.admin.access(empId); const profs = await API.admin.profiles();
    box.innerHTML = `${a.blocked ? `<div class="warn">${t('blocked_note')}</div>` : ''}
      <div class="grid2"><label class="f">${t('acc_profile')}<select class="in" id="ap" ${a.blocked ? 'disabled' : ''}><option value="">${t('no_profile')}</option>${profs.map(p => `<option value="${p.id}" ${a.profileId === p.id ? 'selected' : ''}>${esc(pick(p.name))}</option>`).join('')}</select></label>${termHtml()}</div>
      <label class="chk" style="margin:12px 0 4px"><input type="checkbox" id="ahome" ${a.homeAccess ? 'checked' : ''} ${a.blocked ? 'disabled' : ''}> ${t('acc_home')} (${esc(pick(a.employee.branch))})</label>
      <p style="margin:4px 0 10px">${t('acc_hint')}</p>
      <div class="accl">${a.branches.map(b => `<div class="accb"><div class="accbh">${esc(pick(b.name))}</div>${b.gates.map(g => `<div class="accg">
        <button class="sw" type="button" role="switch" aria-checked="${g.allowed}" data-g="${g.gateId}" ${a.blocked ? 'disabled' : ''} aria-label="${esc(pick(b.name))} ${esc(pick(g.name))}"></button>
        <span class="gn">${esc(pick(g.name))}</span>${srcPill(g)}${['manual', 'deny'].includes(g.src) ? `<button class="lnk" type="button" data-reset="${g.gateId}">${t('reset_rule')}</button>` : ''}</div>`).join('')}</div>`).join('')}</div>
      <div style="margin-top:16px"><button class="btn sm" type="button" id="ablock" style="color:var(--er)">${a.blocked ? t('unblock') : t('block_all')}</button></div>`;
    const until = bindTerm(box);
    const re = () => { accessPanel(box, empId, done); done && done(); };
    box.querySelector('#ap').onchange = async e => { await API.admin.setProfile([empId], +e.target.value || null); re(); };
    box.querySelector('#ahome').onchange = async e => { await API.admin.setHome(empId, e.target.checked); re(); };
    box.querySelector('#ablock').onclick = async () => { await API.admin.setBlocked([empId], !a.blocked); re(); };
    box.querySelectorAll('[data-g]').forEach(b => b.onclick = async () => { await API.admin.setAccess([empId], [+b.dataset.g], b.getAttribute('aria-checked') !== 'true', until()); re(); });
    box.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => { await API.admin.resetAccess(empId, +b.dataset.reset); re(); });
  }
  function accessBulkModal(ids, allow, done) {
    API.admin.branches().then(bs => UI.modal(`<h2>${allow ? t('open_access') : t('close_access')}</h2><p>${t('selected')}: ${ids.length} ${t('emps_n')}</p>
      <p style="margin:0 0 8px;font-weight:700;color:var(--ink)">${t('choose_locs')}</p>${UI.gateTree(bs, [])}<div style="margin-top:14px">${termHtml()}</div>
      <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ok">${allow ? t('open_access') : t('close_access')}</button></div>`,
      (m, close) => { const get = UI.bindTree(m), until = bindTerm(m); m.querySelector('#ok').onclick = async () => { const g = get(); if (!g.length) return; await API.admin.setAccess(ids, g, allow, until()); close(); UI.toast('OK'); done(); }; }));
  }
  function profileBulkModal(ids, done) {
    API.admin.profiles().then(ps => UI.modal(`<h2>${t('assign_profile')}</h2><p>${t('selected')}: ${ids.length} ${t('emps_n')}</p>
      <select class="in" id="pp"><option value="">${t('no_profile')}</option>${ps.map(p => `<option value="${p.id}">${esc(pick(p.name))}</option>`).join('')}</select>
      <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ok">${t('save')}</button></div>`,
      (m, close) => { m.querySelector('#ok').onclick = async () => { await API.admin.setProfile(ids, +m.querySelector('#pp').value || null); close(); done(); }; }));
  }
  function pickPeopleModal(gateId, done) {
    UI.modal(`<h2>${t('open_access')}</h2><input class="in" id="pq" data-i18n-ph="search_emp"><div style="margin-top:12px">${termHtml()}</div><div id="pl" style="margin-top:12px;max-height:320px;overflow:auto"></div>
      <div class="acts"><button class="btn pri" type="button" data-close>${t('ok_word')}</button></div>`,
      m => {
        const until = bindTerm(m);
        const load = async () => { const l = await API.admin.employees(m.querySelector('#pq').value);
          m.querySelector('#pl').innerHTML = l.slice(0, 30).map(e => `<div class="wl" style="align-items:center"><div class="n">${esc(pick(e.name))}<small>${esc(e.tab)} · ${esc(pick(e.pos))} · ${esc(pick(e.branch))}</small></div><button class="btn sm" type="button" data-add="${e.id}">+</button></div>`).join(''); };
        m.querySelector('#pq').oninput = load;
        m.addEventListener('click', async e => { const b = e.target.closest('[data-add]'); if (b) { await API.admin.setAccess([+b.dataset.add], [gateId], true, until()); b.textContent = '✓'; b.disabled = true; done(); } });
        load();
      });
  }
  function newPassModal(bs, done) {
    const loc = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
    const end = new Date(); end.setHours(19, 0, 0, 0); if (end < new Date()) end.setDate(end.getDate() + 1);
    UI.modal(`<h2>${t('new_pass')}</h2>
      <div class="grid2"><label class="f">${t('p_name')}<input class="in" id="pn" required></label><label class="f">${t('p_phone')}<input class="in" id="pph" type="tel"></label></div>
      <label class="f" style="margin-top:12px">${t('p_company')}<input class="in" id="pc"></label>
      <div class="grid2" style="margin-top:12px"><label class="f">${t('p_from')}<input class="in" type="datetime-local" id="pf" value="${loc(new Date())}"></label><label class="f">${t('p_to')}<input class="in" type="datetime-local" id="pt" value="${loc(end)}"></label>
        <label class="f">${t('p_uses')}<select class="in" id="pu"><option value="0">${t('uses_unl')}</option><option value="1">${t('uses_one')}</option></select></label></div>
      <p style="margin:16px 0 8px;font-weight:700;color:var(--ink)">${t('choose_locs')}</p>${UI.gateTree(bs, [])}
      <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ok">${t('new_pass')}</button></div>`,
      (m, close) => {
        const get = UI.bindTree(m);
        m.querySelector('#ok').onclick = async () => {
          const name = m.querySelector('#pn').value.trim(), g = get();
          if (!name || !g.length) { UI.toast(`${t('p_name')} · ${t('choose_locs')}`); return; }
          const r = await API.admin.createPass({ name, company: m.querySelector('#pc').value.trim(), phone: m.querySelector('#pph').value.trim(), gateIds: g,
            from: new Date(m.querySelector('#pf').value).toISOString(), to: new Date(m.querySelector('#pt').value).toISOString(), maxUses: +m.querySelector('#pu').value, issuedBy: nameGet() });
          close(); done(); passLinkModal(r, true);
        };
      });
  }
  function passLinkModal(p, fresh) {
    const url = p.url || API.admin.passUrl(p.code);
    UI.modal(`<h2>${fresh ? t('pass_ready') : t('guest_pass')}</h2><p><b style="color:var(--ink)">${esc(p.name)}</b> · ${esc(p.company)}<br>${p.places.map(x => `${esc(pick(x.branch))} · ${esc(pick(x.gate))}`).join(', ')}<br>
      ${t('pp_valid')}: ${new Date(p.from).toLocaleDateString('uk-UA').slice(0, 5)} ${I18N.hm(p.from)} → ${new Date(p.to).toLocaleDateString('uk-UA').slice(0, 5)} ${I18N.hm(p.to)}</p><p>${t('pass_send')}</p>
      <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:16px;align-items:center"><div class="qrimg">${UI.qrSvg(url)}</div>
        <div><div class="mono" style="font-size:22px;font-weight:700">${esc(p.code)}</div><div class="mono" style="font-size:12px;color:var(--mu);overflow-wrap:anywhere;margin-top:6px">${esc(url)}</div></div></div>
      <div class="acts"><button class="btn" type="button" id="cp">${t('copy')}</button><a class="btn" href="${esc(url)}" target="_blank">${t('open_demo')}</a><button class="btn pri" type="button" data-close>${t('ok_word')}</button></div>`,
      m => { m.querySelector('#cp').onclick = () => UI.copy(url, t('copied')); });
  }

  function editEmp(e, done, startTab) {
    const kinds = ['office', 'warehouse', 'driver'];
    UI.modal(`<h2>${e ? esc(pick(e.name)) : t('add_emp')}</h2>
      ${e ? `<div class="tabs2"><button type="button" data-tb="data" class="${startTab === 'access' ? '' : 'on'}">${t('tab_data')}</button><button type="button" data-tb="access" class="${startTab === 'access' ? 'on' : ''}">${t('tab_access')}</button></div>` : `<p>${t('emp_card')}</p>`}
      <div id="tb-data" class="${startTab === 'access' ? 'hidden' : ''}">
      <div class="grid2">
        <label class="f">${t('c_tab')}<input class="in mono" id="m_tab" value="${e ? esc(e.tab) : ''}" required></label>
        <label class="f">${t('c_branch')}<select class="in" id="m_br">${state.branches.map(b => `<option value="${b.id}" ${e && e.branchId === b.id ? 'selected' : ''}>${esc(pick(b.name))}</option>`).join('')}</select></label>
        <label class="f">${t('f_name_uk')}<input class="in" id="m_nu" value="${e ? esc(e.name.uk) : ''}"></label>
        <label class="f">${t('f_name_ru')}<input class="in" id="m_nr" value="${e ? esc(e.name.ru) : ''}"></label>
        <label class="f">${t('f_pos')} (УКР)<input class="in" id="m_pu" value="${e ? esc(e.pos.uk) : ''}"></label>
        <label class="f">${t('f_pos')} (РУС)<input class="in" id="m_pr" value="${e ? esc(e.pos.ru) : ''}"></label>
        <label class="f">${t('f_kind')}<select class="in" id="m_k">${kinds.map(k => `<option value="${k}" ${e && e.kind === k ? 'selected' : ''}>${t('kind_' + k)}</option>`).join('')}</select></label>
      </div>
      <label class="chk" style="margin-top:14px"><input type="checkbox" id="m_act" ${!e || e.active ? 'checked' : ''}> ${t('f_active')}</label>
      <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="m_save">${t('save')}</button></div></div>
      <div id="tb-access" class="${startTab === 'access' ? '' : 'hidden'}"></div>
      ${e ? `<div class="acts" id="accActs" ${startTab === 'access' ? '' : 'style="display:none"'}><button class="btn pri" type="button" data-close>${t('close')}</button></div>` : ''}`,
      (m, close) => {
        m.classList.add('wide');
        const showTab = k => { m.querySelectorAll('[data-tb]').forEach(b => b.classList.toggle('on', b.dataset.tb === k)); m.querySelector('#tb-data').classList.toggle('hidden', k !== 'data');
          m.querySelector('#tb-access').classList.toggle('hidden', k !== 'access'); const aa = m.querySelector('#accActs'); if (aa) aa.style.display = k === 'access' ? '' : 'none';
          if (k === 'access' && !m.querySelector('#tb-access').innerHTML) accessPanel(m.querySelector('#tb-access'), e.id, done); };
        m.querySelectorAll('[data-tb]').forEach(b => b.onclick = () => showTab(b.dataset.tb));
        if (startTab === 'access') showTab('access');
        m.querySelector('#m_save').onclick = async () => {
          const g = id => m.querySelector(id).value.trim();
          if (!g('#m_tab') || !g('#m_nu')) { UI.toast(t('c_tab') + ' / ' + t('c_name')); return; }
          try {
            await API.admin.saveEmployee({ id: e && e.id, tab: g('#m_tab'), branchId: +g('#m_br'), kind: g('#m_k'), active: m.querySelector('#m_act').checked,
              name: { uk: g('#m_nu'), ru: g('#m_nr') || g('#m_nu') }, pos: { uk: g('#m_pu'), ru: g('#m_pr') || g('#m_pu') } });
            close(); done(); UI.toast('OK');
          } catch (err) { UI.toast(err.message === 'tab' ? t('c_tab') + ' — duplicate' : 'Error'); }
        };
      });
  }
  async function inviteModal(e, done) {
    const r = await API.admin.createInvite(e.id);
    UI.modal(`<h2>${t('invite_title')}</h2><p>${esc(pick(e.name))} · ${t('tab_no')} ${esc(e.tab)}</p><p>${t('invite_text')}</p>
      <div style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:16px;align-items:center">
        <div class="qrimg">${UI.qrSvg(r.url)}</div>
        <div><div class="mono" style="font-size:22px;font-weight:700">${esc(r.code)}</div><div class="mono" style="font-size:12px;color:var(--mu);overflow-wrap:anywhere;margin-top:6px">${esc(r.url)}</div></div>
      </div>
      <div class="acts"><button class="btn" type="button" id="cp">${t('copy')}</button>${API.mock ? `<a class="btn" href="${esc(r.url)}" target="_blank">${t('open_demo')}</a>` : ''}<button class="btn pri" type="button" data-close>${t('ok_word')}</button></div>`,
      m => { m.querySelector('#cp').onclick = () => UI.copy(r.url, t('copied')); });
    done();
  }
  async function staticModal(e) {
    let r = await API.admin.staticCode(e.id, false);
    UI.modal(`<h2>${t('static_title')}</h2><p>${esc(pick(e.name))} · ${t('tab_no')} ${esc(e.tab)}</p><p>${t('static_text')}</p>
      <div id="sq" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"></div>
      <div class="acts"><button class="btn" type="button" id="re">${t('reissue')}</button><button class="btn" type="button" id="pr">${t('print')}</button><button class="btn pri" type="button" data-close>${t('ok_word')}</button></div>`,
      m => {
        const draw = () => { m.querySelector('#sq').innerHTML = `<div class="qrimg" style="width:200px">${UI.qrSvg(r.qr)}</div><div><b style="font-size:18px">${esc(pick(e.name))}</b><div>${t('tab_no')} ${esc(e.tab)}</div><div style="color:var(--mu)">${t('version_short')} ${r.version}</div></div>`; };
        draw();
        m.querySelector('#re').onclick = async () => { r = await API.admin.staticCode(e.id, true); draw(); UI.toast(t('reissue') + ': ' + r.version); };
        m.querySelector('#pr').onclick = () => {
          const w = window.open('', '_blank');
          if (!w) return;
          w.document.write(`<html><head><title>QR ${esc(e.tab)}</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><div style="width:280px;margin:0 auto">${UI.qrSvg(r.qr)}</div><h2>${esc(pick(e.name))}</h2><p>${t('tab_no')} ${esc(e.tab)} · ${t('version_short')} ${r.version}</p><script>print()<\/script></body></html>`);
          w.document.close();
        };
      });
  }

  // ---------- запуск ----------
  const roleTxt = () => { const r = (userGet() || {}).role || 'admin'; return { admin: t('admin_role'), sb: 'СБ', manager: I18N.pick({ uk: 'керівник', ru: 'руководитель' }) }[r] || r; };
  async function boot() {
    if (!tokenGet()) { renderLogin(); return; }
    // токен проверяем на сервере при каждом открытии (продлевает сессию на 30 дней)
    try { const r = await API.admin.me(); userSet(r.user); }
    catch (err) {
      if (err.auth) { tokenDrop(); renderLogin(t('session_end')); return; }
      // сеть пропала — пускаем с сохранённым пользователем, разделы сами покажут ошибку
    }
    const u = userGet();
    if (u && u.must_change) { renderPassword(); return; }
    shell(); render();
  }
  window.addEventListener('hashchange', () => { if (tokenGet()) render(); });
  I18N.on(() => { if (!document.querySelector('.hdr')) { const f = document.querySelector('.auth-card'); if (f) I18N.apply(f); return; } shell(); render(); });
  boot();
})();
