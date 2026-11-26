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
    ['today', 'nav_today'], ['punches', 'nav_punches'], ['sb', 'nav_sb'], ['emps', 'nav_emps'], ['absences', 'nav_abs'],
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
    else if (ev.reason && ev.reason.message) UI.toast(ev.reason.net ? t('login_net') : ev.reason.message);
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
      ${API.mock ? `<div class="demo-bar"><b data-i18n="demo_mode"></b><span data-i18n="demo_hint"></span><button type="button" id="resetBtn" data-i18n="reset_demo"></button>
        <a href="../employee/index.html" target="_blank">PWA</a><a href="../scanner/index.html" target="_blank">Scanner</a></div>` : ''}
      <div class="layout">
        <nav class="side" aria-label="Меню">${ROUTES.map(([r, k]) => `<a class="si" href="#${r}" data-r="${r}"><span data-i18n="${k}"></span>${r === 'sb' ? '<span class="b p-wa" id="sbBadge"></span>' : ''}${r === 'devices' ? '<span class="b p-er" id="devBadge"></span>' : ''}</a>`).join('')}
          <div class="ver"><span data-i18n="version"></span> 1.7</div></nav>
        <main class="main" id="view"></main>
      </div>`;
    I18N.apply();
    document.getElementById('themeBtn').onclick = () => UI.theme.toggle();
    document.getElementById('logoutBtn').onclick = logout;
    const rb = document.getElementById('resetBtn');
    if (rb) rb.onclick = async () => { await API.admin.reset(); UI.toast('OK'); render(); };
    const gq = document.getElementById('gq');
    gq.addEventListener('keydown', e => { if (e.key === 'Enter') { hideGq(); location.hash = 'emps?q=' + encodeURIComponent(e.target.value); } if (e.key === 'Escape') hideGq(); });
    gq.addEventListener('input', UI.debounce(async () => {
      const q = gq.value.trim(); if (q.length < 2) return hideGq();
      let rows = []; try { rows = (await API.admin.employeesPage({ q, status: 'all', page: 1, size: 8 })).rows; } catch (e) {}
      let dd = document.getElementById('gqd');
      if (!dd) { dd = document.createElement('div'); dd.id = 'gqd'; dd.className = 'gqd'; gq.parentNode.appendChild(dd); }
      const r = gq.getBoundingClientRect(); dd.style.left = r.left + 'px'; dd.style.top = (r.bottom + 4) + 'px'; dd.style.width = Math.max(r.width, 320) + 'px';
      dd.innerHTML = rows.length ? rows.map(e => `<a href="#" data-emp="${e.id}"><b>${esc(pick(e.name))}</b><small>${esc(e.tab)} · ${esc(pick(e.pos))} · ${esc(pick(e.branch) || '')}</small></a>`).join('')
        : `<div class="empty">${t('nothing_found')}</div>`;
    }, 250));
    gq.addEventListener('blur', () => setTimeout(hideGq, 200));
    // любая фамилия с data-emp открывает карточку (ловим до обработчиков строк)
    app.addEventListener('click', e => { const a = e.target.closest('[data-emp]'); if (!a) return; e.preventDefault(); e.stopPropagation(); hideGq(); openEmp(+a.dataset.emp); }, true);
  }
  function hideGq() { const d = document.getElementById('gqd'); if (d) d.remove(); }
  // фамилия-ссылка на карточку
  const en = (emp, inner) => emp && emp.id ? `<a href="#" class="empl" data-emp="${emp.id}">${inner}</a>` : inner;
  async function openEmp(id, tab) {
    let e; try { e = await API.admin.employeeGet(id); } catch (err) { return UI.toast(err.message); }
    if (!state.branches) state.branches = await API.admin.branches();
    editEmp(e, () => { if (route() === 'emps' || route() === 'absences') render(); }, tab);
  }

  // Что нужно подключить к n8n, чтобы раздел стал настоящим. Пока чего-то нет — раздел в пунктире «ДЕМО».
  const NEEDS = {
    today: ['admin.dashboard'], punches: ['admin.punches', 'admin.check'], sb: ['admin.punches', 'admin.check'],
    emps: ['admin.employees', 'admin.saveEmployee', 'admin.createInvite'], access: ['admin.access', 'admin.setAccess', 'admin.profiles'],
    passes: ['admin.passes', 'admin.createPass', 'admin.revokePass'], branches: ['admin.branches', 'admin.saveBranch', 'admin.saveGate'],
    devices: ['admin.devices', 'admin.createDeviceCode'], reports: ['admin.report'], absences: ['admin.absences']
  };
  const isDemo = r => (NEEDS[r] || []).some(n => !API.live(n));
  function markDemo() {
    document.querySelectorAll('.si').forEach(a => a.classList.toggle('is-demo', isDemo(a.dataset.r)));
  }

  async function render() {
    clearInterval(state.timer);
    document.querySelectorAll('.modal-bg').forEach(x => x.remove());
    const r = route();
    document.querySelectorAll('.si').forEach(a => a.classList.toggle('on', a.dataset.r === r));
    // новый узел на каждый переход: старые обработчики кликов не копятся
    const old = document.getElementById('view'); const v = old.cloneNode(false); old.replaceWith(v);
    const fn = VIEWS[r] || VIEWS.today;
    const demo = isDemo(VIEWS[r] ? r : 'today');
    v.classList.toggle('is-demo', demo); document.body.classList.toggle('demo-route', demo);
    await fn(v);
    if (demo) v.insertAdjacentHTML('afterbegin', '<div class="demo-tag" data-i18n="demo_tag"></div>');
    I18N.apply(v); markDemo();
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
    <td>${r.employee ? `<b>${en(r.employee, esc(pick(r.employee.name).split(' ').slice(0, 2).join(' ')))}</b><small>${t('tab_no')} ${esc(r.employee.tab)}</small>` : r.guest ? `<b>${esc(r.guest.name)}</b><small>${t('guest_pass')} · ${esc(r.guest.code)}</small>` : `<b>${t('unknown_code')}</b><small class="mono">${esc((r.raw || '').slice(0, 22))}</small>`}</td>
    <td>${r.employee ? esc(pick(r.employee.pos)) : r.guest ? esc(r.guest.company) : '—'}</td>
    <td>${placeTxt(r)}</td>
    <td>${evTxt(r.event)}</td>
    <td>${UI.verdictPill(r.verdict)}${r.verdict === 'PWA_SCREEN' && r.codeAge ? `<small>${Math.round(r.codeAge / 60)} ${t('ago_min')}</small>` : ''}${r.reason ? `<small>${t('pr_' + r.reason)}</small>` : ''}</td></tr>`;
  const punchHead = () => `<thead><tr><th>${t('c_time')}</th><th>${t('c_emp')}</th><th>${t('c_pos')}</th><th>${t('c_place')}</th><th>${t('c_event')}</th><th>${t('c_code')}</th></tr></thead>`;

  // ---------- дисциплина: общие помощники ----------
  const dur = m => (m == null ? '—' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
  // минуты -> «6 год 24 хв» / «25 хв»
  const hmin = m => { m = Math.round(+m || 0); const h = Math.floor(m / 60), r = m % 60, H = I18N.lang === 'uk' ? 'год' : 'ч', M = t('min');
    return h ? (r ? `${h} ${H} ${r} ${M}` : `${h} ${H}`) : `${r} ${M}`; };
  const ddmm = d => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const violPills = d => {
    const out = [];
    if (d.holiday) out.push(`<span class="pill p-mu">${t('d_holiday')}</span>`);
    if (d.excuse) out.push(`<span class="pill p-bl">${t('exc_' + d.excuse)}</span>`);
    if (!d.isWork && !d.holiday && !d.excuse) out.push(`<span class="pill p-mu">${t('d_weekend')}</span>`);
    if (d.noControl) out.push(`<span class="pill p-mu">${t('d_noctl')}</span>`);
    if (d.absent) out.push(`<span class="pill p-er">${t('v_absent')}</span>`);
    if (d.late) out.push(`<span class="pill p-wa">${t('v_late')} ${hmin(d.late)}</span>`);
    if (d.early) out.push(`<span class="pill p-wa">${t('v_early')} ${hmin(d.early)}</span>`);
    if (d.noOut) out.push(`<span class="pill p-wa">${t('v_noout')}</span>`);
    if (d.lunchOutside) out.push(`<span class="pill p-wa">${t('v_lunch_out')}</span>`);
    if (d.lunchOver) out.push(`<span class="pill p-wa">${t('v_lunch_over')} +${hmin(d.lunchOver)}</span>`);
    if (d.lunchNoReturn) out.push(`<span class="pill p-er">${t('v_lunch_noret')}</span>`);
    if (d.lunchTwice) out.push(`<span class="pill p-wa">${t('v_lunch_twice')}</span>`);
    return out.join(' ');
  };
  const lunchTxt = d => d.lunchOut ? `${d.lunchOut}–${d.lunchIn || '…'}${d.lunchMin ? ` · ${hmin(d.lunchMin)}` : ''}` : '—';
  const lunchCell = d => d.lunchOut ? `${d.lunchOut}–${d.lunchIn || '…'}${d.lunchMin ? `<small style="font-weight:500">${hmin(d.lunchMin)}</small>` : ''}` : '—';
  const violText = d => violPills(d).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const dayRow = (d, withEmp) => `<tr class="${d.violations ? 'bad' : ''}"><td class="t">${ddmm(d.day)}</td>
    ${withEmp ? `<td class="mono">${esc(d.employee.tab)}</td><td><b>${en(d.employee, esc(pick(d.employee.name)))}</b><small>${esc(pick(d.employee.pos))}</small></td><td>${esc(pick(d.employee.branch))}</td>` : ''}
    <td class="t">${d.arrival || '—'}</td><td class="t">${d.leave || '—'}</td><td class="t">${lunchCell(d)}</td><td class="t">${dur(d.workedMin)}</td><td>${violPills(d)}</td></tr>`;
  const dayHead = withEmp => `<thead><tr><th>${t('c_date')}</th>${withEmp ? `<th>${t('c_tab')}</th><th>${t('c_name')}</th><th>${t('c_branch')}</th>` : ''}<th>${t('first_in')}</th><th>${t('last_out')}</th><th>${t('c_lunch')}</th><th>${t('worked')}</th><th>${t('c_viol')}</th></tr></thead>`;
  const monthStart = () => today().slice(0, 8) + '01';

  const sbTabs = cur => `<div class="tabs2" id="sbt" style="margin:0 0 14px"><button type="button" data-st="codes" class="${cur === 'codes' ? 'on' : ''}">${t('sb_codes')}</button><button type="button" data-st="disc" class="${cur === 'disc' ? 'on' : ''}">${t('sb_disc')}</button></div>`;
  document.addEventListener('click', e => { const b = e.target.closest('#sbt [data-st]'); if (b) { state.sbTab = b.dataset.st; render(); } });
  async function sbDisc(v) {
    state.branches = await API.admin.branches();
    v.innerHTML = `<div class="mh"><div><h1>${t('sb_page')}</h1><p>${t('sb_disc_sub')}</p></div></div>${sbTabs('disc')}
      <div class="card" style="padding:16px 20px"><div class="ctl">
        <label class="f"><span>${t('date_from')}</span><input class="in" type="date" id="df" value="${monthStart()}"></label>
        <label class="f"><span>${t('date_to')}</span><input class="in" type="date" id="dt" value="${today()}"></label>
        <label class="f"><span>${t('c_branch')}</span>${branchSelect('db', 0)}</label>
        <label class="f"><span>${t('c_viol')}</span><select class="in" id="dty"><option value="">${t('f_all')}</option><option value="late">${t('v_late')}</option><option value="early">${t('v_early')}</option><option value="lunch">${t('c_lunch')}</option><option value="absent">${t('v_absent')}</option></select></label>
        <button class="btn pri" type="button" id="dgo">${t('rep_build')}</button></div></div>
      <section class="card rc" id="rep" style="margin-bottom:16px"></section>
      <section class="card" style="overflow:hidden"><div class="tw"><table>${dayHead(true)}<tbody id="dB"></tbody></table></div><div id="pg"></div></section>`;
    let page = 1, size = 50;
    const go = async keep => {
      if (!keep) page = 1;
      const r = await API.admin.violations({ from: v.querySelector('#df').value, to: v.querySelector('#dt').value, branchId: +v.querySelector('#db').value, type: v.querySelector('#dty').value, page, size });
      UI.pager(v.querySelector('#pg'), r.page.total, page, size, (p, s2) => { page = p; size = s2; go(true); });
      v.querySelector('#rep').innerHTML = `<h2>${t('sb_repeat')}</h2>` + (r.repeat.length ? `<div class="chips">${r.repeat.map(x => en(x.employee, `<span class="pill p-wa">${esc(pick(x.employee.name).split(' ').slice(0, 2).join(' '))} · ${x.late}× · ${hmin(x.lateMin)}</span>`)).join(' ')}</div>` : `<p style="margin:0">${t('sb_repeat_none')}</p>`);
      v.querySelector('#dB').innerHTML = r.page.rows.map(d => dayRow(d, true)).join('') || `<tr><td colspan="9" class="empty">—</td></tr>`;
    };
    v.querySelector('#dgo').onclick = () => go(); await go();
  }

  // ---------- график филиала ----------
  async function scheduleModal(br) {
    const sc = await API.admin.schedule(br.id);
    const hrs = m => (m / 60).toString().replace('.', ',');
    const row = d => `<tr data-dow="${d.dow}"><td><b>${t('dow_' + d.dow)}</b></td>
      <td><input type="checkbox" class="sw-w" ${d.isWork ? 'checked' : ''} aria-label="${t('workday')}"></td>
      <td><input class="in sm" type="time" data-k="winFrom" value="${d.winFrom}"></td><td><input class="in sm" type="time" data-k="winTo" value="${d.winTo}"></td>
      <td><input class="in sm" type="number" min="1" max="24" step="0.5" data-k="workH" value="${hrs(d.workMin).replace(',', '.')}"></td>
      <td><input class="in sm" type="time" data-k="lunchFrom" value="${d.lunchFrom}"></td><td><input class="in sm" type="time" data-k="lunchTo" value="${d.lunchTo}"></td>
      <td><input class="in sm" type="number" min="0" max="240" step="5" data-k="lunchMin" value="${d.lunchMin}"></td></tr>`;
    UI.modal(`<h2>${t('schedule')} · ${esc(pick(br.name))}</h2><p>${t('sched_hint')}</p>
      <div class="tw"><table class="sched"><thead><tr><th>${t('c_day')}</th><th>${t('workday')}</th><th>${t('win_from')}</th><th>${t('win_to')}</th><th>${t('work_h')}</th><th>${t('lunch_from')}</th><th>${t('lunch_to')}</th><th>${t('lunch_min')}</th></tr></thead>
      <tbody>${sc.days.map(row).join('')}</tbody></table></div>
      <div class="ctl" style="margin-top:12px"><button class="btn sm" type="button" id="cp">${t('copy_mon')}</button>
        <label class="f" style="flex-direction:row;align-items:center;gap:8px"><span>${t('tolerance')}</span><input class="in sm" type="number" min="0" max="60" id="tol" value="${sc.tolerance}" style="width:80px"> ${t('min')}</label></div>
      <div class="ac-err" id="se" hidden></div>
      <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ok">${t('save')}</button></div>`, (m, close) => {
      m.classList.add('wide');
      const read = () => [...m.querySelectorAll('tr[data-dow]')].map(tr => { const g = k => tr.querySelector(`[data-k="${k}"]`).value;
        return { dow: +tr.dataset.dow, isWork: tr.querySelector('.sw-w').checked, winFrom: g('winFrom'), winTo: g('winTo'), workMin: Math.round(parseFloat(String(g('workH')).replace(',', '.')) * 60), lunchFrom: g('lunchFrom'), lunchTo: g('lunchTo'), lunchMin: +g('lunchMin') || 0 }; });
      m.querySelector('#cp').onclick = () => { const mon = read()[0];
        m.querySelectorAll('tr[data-dow]').forEach(tr => { if (+tr.dataset.dow >= 2 && +tr.dataset.dow <= 5) { tr.querySelector('.sw-w').checked = mon.isWork;
          ['winFrom', 'winTo', 'lunchFrom', 'lunchTo', 'lunchMin'].forEach(k => { tr.querySelector(`[data-k="${k}"]`).value = mon[k]; }); tr.querySelector('[data-k="workH"]').value = mon.workMin / 60; } }); };
      m.querySelector('#ok').onclick = async () => {
        const days = read(), se = m.querySelector('#se');
        const bad = days.find(d => d.isWork && (!(d.workMin > 0) || d.winTo <= d.winFrom || d.lunchTo < d.lunchFrom));
        if (bad) { se.textContent = `${t('dow_' + bad.dow)}: ${t('sched_bad')}`; se.hidden = false; return; }
        try { await API.admin.saveSchedule(br.id, +m.querySelector('#tol').value || 0, days); close(); UI.toast(t('saved')); }
        catch (err) { se.textContent = err.message; se.hidden = false; }
      };
    });
  }
  async function holidaysModal() {
    const list = await API.admin.holidays();
    UI.modal(`<h2>${t('holidays')}</h2><p>${t('hol_hint')}</p>
      <ul class="hl">${list.map(h => `<li><span class="mono">${ddmm(h.day)}.${h.day.slice(0, 4)}</span><span>${esc(h.name)}</span><button class="btn sm" type="button" data-rm="${h.day}">${t('remove')}</button></li>`).join('') || `<li style="color:var(--mu)">—</li>`}</ul>
      <div class="ctl" style="margin-top:12px"><input class="in" type="date" id="hd"><input class="in" id="hn" placeholder="${t('hol_name')}"><button class="btn pri" type="button" id="ha">${t('add')}</button></div>
      <div class="acts"><button class="btn" type="button" data-close>${t('close')}</button></div>`, (m, close) => {
      m.querySelector('#ha').onclick = async () => { const d = m.querySelector('#hd').value; if (!d) return; await API.admin.saveHoliday(d, m.querySelector('#hn').value.trim()); close(); holidaysModal(); };
      m.addEventListener('click', async e => { const b = e.target.closest('[data-rm]'); if (b) { await API.admin.saveHoliday(b.dataset.rm, '', true); close(); holidaysModal(); } });
    });
  }

  // ---------- карточка сотрудника: дисциплина ----------
  async function disciplinePanel(box, e, month) {
    month = month || today().slice(0, 7);
    box.innerHTML = '…';
    const r = await API.admin.discipline(e.id, month);
    const T = r.totals || {};
    const byDay = Object.fromEntries(r.days.map(d => [d.day, d]));
    const first = new Date(month + '-01T12:00:00'), y = first.getFullYear(), mo = first.getMonth();
    const n = new Date(y, mo + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
    const cls = d => !d ? 'fut' : d.excuse ? 'exc' : d.absent ? 'abs' : d.violations ? 'bad' : d.arrival ? 'ok' : (d.holiday || !d.isWork) ? 'off' : 'none';
    const prev = new Date(y, mo - 1, 15).toISOString().slice(0, 7), next = new Date(y, mo + 1, 15).toISOString().slice(0, 7);
    box.innerHTML = `<div class="ctl" style="justify-content:space-between;margin-bottom:10px"><button class="btn sm" type="button" data-mo="${prev}">←</button><b>${I18N.pick({ uk: first.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }), ru: first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) })}</b><button class="btn sm" type="button" data-mo="${next}" ${next > today().slice(0, 7) ? 'disabled' : ''}>→</button></div>
      <div class="dtot">
        <div><b>${T.late || 0}</b><span>${t('r_late')}</span><small>${hmin(T.lateMin)}</small></div>
        <div><b>${T.early || 0}</b><span>${t('r_early')}</span><small>${hmin(T.earlyMin)}</small></div>
        <div><b>${T.lunch || 0}</b><span>${t('r_lunch')}</span><small>+${T.lunchOverMin || 0} ${t('min')}</small></div>
        <div><b>${T.absent || 0}</b><span>${t('v_absent')}</span><small>${t('r_excused')}: ${T.excused || 0}</small></div>
        <div><b>${dur(T.workedMin || 0)}</b><span>${t('worked')}</span><small>${T.days || 0} ${t('r_days').toLowerCase()}</small></div>
      </div>
      <div class="cal">${[1, 2, 3, 4, 5, 6, 7].map(i => `<div class="cw">${t('dow_' + i)}</div>`).join('')}${'<div></div>'.repeat(lead)}
        ${Array.from({ length: n }, (_, i) => { const ds = `${month}-${String(i + 1).padStart(2, '0')}`, d = byDay[ds];
          return `<button type="button" class="cd ${cls(d)}" data-day="${ds}" ${d ? '' : 'disabled'} title="${d ? esc(violText(d)) : ''}"><b>${i + 1}</b><small>${d && d.arrival ? d.arrival : d && d.excuse ? t('exc_' + d.excuse) : ''}</small></button>`; }).join('')}</div>
      <div class="legend"><span class="cd ok"></span>${t('lg_ok')}<span class="cd bad"></span>${t('lg_bad')}<span class="cd abs"></span>${t('v_absent')}<span class="cd exc"></span>${t('lg_exc')}<span class="cd off"></span>${t('d_weekend')}</div>
      <div id="dday" style="margin-top:12px"></div>`;
    box.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => disciplinePanel(box, e, b.dataset.mo));
    box.querySelectorAll('[data-day]').forEach(b => b.onclick = () => {
      const d = byDay[b.dataset.day]; const dd = box.querySelector('#dday');
      dd.innerHTML = `<div class="card" style="padding:14px 16px"><b>${ddmm(d.day)}</b> · ${t('first_in')} ${d.arrival || '—'} · ${t('last_out')} ${d.leave || '—'} · ${t('c_lunch')} ${lunchTxt(d)} · ${t('worked')} ${dur(d.workedMin)}
        <div style="margin:8px 0">${violPills(d) || `<span class="pill p-ok">${t('lg_ok')}</span>`}</div>
        <div class="ctl"><label class="f"><span>${t('excuse')}</span><select class="in" id="exr"><option value="">—</option>${ABS_KINDS.map(k => `<option value="${k}" ${d.excuse === k ? 'selected' : ''}>${t('exc_' + k)}</option>`).join('')}</select></label>
        <button class="btn pri sm" type="button" id="exs">${t('save')}</button></div></div>`;
      dd.querySelector('#exs').onclick = async () => { try { await API.admin.excuse(e.id, d.day, dd.querySelector('#exr').value); disciplinePanel(box, e, month); } catch (err) { UI.toast(err.message); } };
    });
  }

  // ---------- ссылки для всех неактивированных (филиал или выбранные) ----------
  // плакат A4 на проходную: QR ведет на установку с привязкой к филиалу (v1.8)
  async function printPosters(branchId) {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write('<p style="font-family:sans-serif">…</p>');
    let list;
    try { list = await API.admin.posters(branchId); } catch (err) { w.close(); return UI.toast(err.message); }
    let logo = ''; try { logo = await (await fetch(new URL('../shared/logo.svg', location.href).href)).text(); } catch (e) {}
    const page = x => `<section class="pg"><div class="ph"><span class="lg">${logo}</span><div class="wm">Зеніт-Авто<span>.облік</span></div><span class="br">${esc(x.name.uk)}</span></div>
      <h1>Відмічайся<br>з <span>телефона</span></h1><p class="ps">Прихід, обід і вихід — за 2 секунди. Без карток і журналів.</p>
      <div class="qrw"><div class="qr">${UI.qrSvg(x.url, { ecc: 'M', margin: 0 })}</div>
        <div class="qs"><b>Наведи камеру телефона на код</b>Встанови застосунок «Зеніт-Авто» — це 1 хвилина, один раз.<div class="os"><span>Android</span><span>iPhone</span></div></div></div>
      <div class="st"><div><b>1</b>Скануй QR камерою</div><div><b>2</b>Встанови застосунок</div><div><b>3</b>Введи свій табельний №</div><div class="g"><b>4</b>Покажи код охоронцю — підтвердить</div></div>
      <div class="wr"><b>Перший прохід:</b> охоронець перевірить, що це ви, і натисне «Підтвердити». Далі просто показуйте свій код на сканері.</div>
      <div class="pf"><span>Питання — до керівника філії</span><span><b>Табельний №</b> — у розрахунковому листі</span></div></section>`;
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><title>${esc(t('poster'))}</title>
      <link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;600;800&display=swap" rel="stylesheet"><style>
      @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:'Golos Text',Arial,sans-serif;color:#111318;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .pg{width:210mm;height:297mm;padding:16mm 16mm 12mm;display:flex;flex-direction:column;position:relative;break-after:page;overflow:hidden}
      .pg:before{content:'';position:absolute;top:0;left:0;right:0;height:5mm;background:#EE7023}
      .ph{display:flex;align-items:center;gap:4mm}.lg svg{height:16mm;width:auto;display:block}.wm{font-weight:800;font-size:8mm}.wm span{color:#EE7023}
      .br{margin-left:auto;background:#111318;color:#fff;font-weight:800;font-size:5mm;padding:2mm 4mm;border-radius:3mm;text-transform:uppercase;letter-spacing:.05em}
      h1{font-size:19mm;line-height:1.02;margin:10mm 0 3mm;font-weight:800}h1 span{color:#EE7023}.ps{font-size:6.5mm;color:#4a4d55;margin:0}
      .qrw{display:flex;gap:9mm;align-items:center;margin:10mm 0 8mm}.qr{width:88mm;height:88mm;border:2.4mm solid #111318;border-radius:7mm;padding:4mm;flex:none}.qr svg{width:100%;height:100%;display:block}
      .qs{font-size:5.6mm;line-height:1.45;color:#333}.qs b{display:block;font-size:8.5mm;line-height:1.15;color:#111318;margin-bottom:3mm}
      .os{display:flex;gap:3mm;margin-top:4mm}.os span{border:.5mm solid #ccc;border-radius:2.5mm;padding:1.2mm 3.5mm;font-weight:800;font-size:4.8mm}
      .st{display:grid;grid-template-columns:repeat(4,1fr);gap:3.5mm}.st div{background:#FBF3EC;border-radius:5mm;padding:4.5mm 3.5mm;font-size:5mm;line-height:1.3}
      .st b{display:flex;width:9mm;height:9mm;border-radius:50%;background:#EE7023;color:#fff;align-items:center;justify-content:center;margin-bottom:2.5mm;font-size:5mm}
      .st .g{background:#E3F4E6}.st .g b{background:#2E9E4F}
      .wr{margin-top:6mm;background:#111318;color:#fff;border-radius:4mm;padding:4.5mm 5mm;font-size:5.3mm;line-height:1.4}.wr b{color:#F38435}
      .pf{margin-top:auto;border-top:.7mm solid #111318;padding-top:3.5mm;display:flex;justify-content:space-between;font-size:4.6mm;color:#333}
      </style></head><body>${list.map(page).join('')}<script>(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>setTimeout(()=>print(),300))<\/script></body></html>`);
    w.document.close();
  }
  function bulkLinksModal(target, done) {
    UI.modal(`<h2>${t('bulk_links_title')}</h2><p><b>${esc(target.title)}</b></p><p>${t('bulk_links_text')}</p>
      <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="go">${t('bulk_links_make')}</button></div>`, (m, close) => {
      m.querySelector('#go').onclick = async () => {
        const btn = m.querySelector('#go'); btn.disabled = true; btn.textContent = '…';
        let list;
        try { list = await API.admin.bulkInvites(target); } catch (err) { UI.toast(err.message); btn.disabled = false; return; }
        close(); done && done();
        if (!list.length) return UI.toast(t('bulk_links_none'));
        const url = code => new URL('../employee/index.html?invite=' + code, location.href).href;
        UI.modal(`<h2>${t('bulk_links_ready')}: ${list.length}</h2><p>${t('bulk_links_ready_text')}</p>
          <div class="acts" style="justify-content:flex-start;flex-wrap:wrap">
            <button class="btn pri" type="button" id="pr">${t('bulk_print')}</button>
            <button class="btn" type="button" id="csv">${t('export_csv')}</button>
            <button class="btn" type="button" id="cp">${t('bulk_copy')}</button></div>
          <div class="tw" style="max-height:300px;margin-top:10px"><table><tbody>${list.map(x => `<tr><td class="mono">${esc(x.tab)}</td><td>${esc(pick(x.name))}</td><td class="mono">${esc(x.code)}</td></tr>`).join('')}</tbody></table></div>
          <div class="acts"><button class="btn" type="button" data-close>${t('close')}</button></div>`, m2 => {
          m2.querySelector('#csv').onclick = () => UI.download(`posylannia_${today()}.csv`, UI.csv([[t('c_tab'), t('c_name'), t('c_pos'), t('invite_code'), t('link')], ...list.map(x => [x.tab, pick(x.name), x.pos || '', x.code, url(x.code)])]));
          m2.querySelector('#cp').onclick = () => UI.copy(list.map(x => `${pick(x.name)} — ${url(x.code)}`).join('\n'), t('copied'));
          m2.querySelector('#pr').onclick = () => {
            const w = window.open('', '_blank'); if (!w) return;
            const logo = new URL('../shared/logo.svg', location.href).href;
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(target.title)}</title><style>
              @page{size:A4;margin:8mm}body{font-family:Arial,sans-serif;margin:0}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
              .c{border:1px dashed #bbb;padding:10px;height:88mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid}
              .c img{height:22px;align-self:flex-start}.n{font-weight:700;font-size:13px;margin:6px 0 2px}.s{font-size:11px;color:#555}
              .q{width:40mm;height:40mm;margin:6px 0}.q svg{width:100%;height:100%}.k{font-family:monospace;font-size:15px;font-weight:700;letter-spacing:1px}
              .h{font-size:9.5px;color:#333;margin-top:4px;line-height:1.3}</style></head><body><div class="g">
              ${list.map(x => `<div class="c"><img src="${logo}"><div class="n">${esc(pick(x.name))}</div><div class="s">${t('tab_no')} ${esc(x.tab)} · ${esc(x.pos || '')}</div>
                <div class="q">${UI.qrSvg(url(x.code))}</div><div class="k">${esc(x.code)}</div><div class="h">${t('print_hint')}</div></div>`).join('')}
              </div><script>setTimeout(()=>print(),400)<\/script></body></html>`);
            w.document.close();
          };
        });
      };
    });
  }

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
          <div class="rcol"><section class="card rc"><h2>${t('abs_today')}</h2><div id="away"></div><a href="#absences" style="display:inline-block;margin-top:10px;font-weight:700">${t('abs_all')}</a></section>
            <section class="card rc"><h2>${t('sb_title')}</h2><p>${t('sb_sub')}</p><div id="watch"></div><a href="#sb" style="display:inline-block;margin-top:14px;font-weight:700">${t('sb_all')}</a></section>
            <section class="card rc"><h2>${t('devices')}</h2><div id="devs"></div></section></div>
        </div>`;
      document.getElementById('bsel').onchange = e => { state.branchId = +e.target.value; state.lastFeedTop = null; load(); };
      document.getElementById('ff').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { state.feedFilter = b.dataset.f; load(); } };
      document.getElementById('xls').onclick = async () => exportPunches({ from: today(), to: today(), branchId: state.branchId });
      async function load() {
        const d = await API.admin.dashboard(state.branchId);
        if (route() !== 'today') return;
        document.getElementById('upd').textContent = `${t('updated_at')} ${I18N.hm(new Date())}`;
        API.admin.awayToday(state.branchId).then(a => { const el = document.getElementById('away'); if (!el) return;
          const ks = ABS_KINDS.filter(k => a[k]); el.innerHTML = ks.length ? `<div class="chips">${ks.map(k => `<a href="#absences?kind=${k}" style="text-decoration:none">${kindPill(k, ' · ' + a[k])}</a>`).join(' ')}</div>` : `<p style="margin:0">${t('abs_today_none')}</p>`; }).catch(() => {});
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
          <div class="n">${en(w.employee, esc(pick(w.employee.name).split(' ').slice(0, 2).join(' ')))}<small>${esc(pick(w.employee.pos))} · ${esc(pick(w.employee.branch))}</small>${UI.verdictPill(w.verdict).replace('</span>', ` · ${w.count}</span>`)}</div></div>`).join('') : '<p>—</p>';
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
        <section class="card" style="overflow:hidden"><div class="tw"><table>${punchHead()}<tbody id="pB"></tbody></table></div><div id="pg"></div></section>`;
      let page = 1, size = 50;
      const f = () => ({ from: pf.value, to: pt.value, branchId: +pb.value, verdict: pv.value, q: pq.value });
      const pf = v.querySelector('#pf'), pt = v.querySelector('#pt'), pb = v.querySelector('#pb'), pv = v.querySelector('#pv'), pq = v.querySelector('#pq');
      const load = async () => {
        const r = await API.admin.punches(Object.assign(f(), { page, size })), rows = r.rows;
        v.querySelector('#cnt').textContent = `${t('found')}: ${r.total}`;
        v.querySelector('#pB').innerHTML = rows.map(r => rowPunch(r).replace(`<td class="t">`, `<td class="t">${new Date(r.scannedAt).toLocaleDateString('uk-UA').slice(0, 5)} `)).join('') || `<tr><td colspan="6" class="empty">—</td></tr>`;
        UI.pager(v.querySelector('#pg'), r.total, page, size, (p, s2) => { page = p; size = s2; load(); });
      };
      const reload = () => { page = 1; load(); };
      [pf, pt, pb, pv].forEach(x => x.onchange = reload); pq.oninput = UI.debounce(reload, 300);
      v.querySelector('#pcsv').onclick = () => exportPunches(f());
      await load();
    },

    async sb(v) {
      if (state.sbTab === 'disc') return sbDisc(v);
      v.innerHTML = `<div class="mh"><div><h1>${t('sb_page')}</h1><p>${t('sb_page_sub')}</p></div>
        <div class="ctl"><label class="chk"><input type="checkbox" id="unc" checked> ${t('f_unchecked')}</label></div></div>
        ${sbTabs('codes')}
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th>${t('c_date')}</th><th>${t('c_emp')}</th><th>${t('c_place')}</th><th>${t('c_event')}</th><th>${t('c_code')}</th><th></th></tr></thead><tbody id="sbB"></tbody></table></div><div id="pg"></div></section>`;
      let page = 1, size = 50;
      const load = async () => {
        const res = await API.admin.punches({ from: daysAgo(30), to: today(), verdict: 'flag', unchecked: v.querySelector('#unc').checked, page, size }), rows = res.rows;
        UI.pager(v.querySelector('#pg'), res.total, page, size, (p, s2) => { page = p; size = s2; load(); });
        v.querySelector('#sbB').innerHTML = rows.map(r => `<tr><td class="t">${new Date(r.scannedAt).toLocaleDateString('uk-UA').slice(0, 5)} ${I18N.hm(r.scannedAt)}</td>
          <td>${r.employee ? `<b>${en(r.employee, esc(pick(r.employee.name)))}</b><small>${t('tab_no')} ${esc(r.employee.tab)} · ${esc(pick(r.employee.pos))}</small>` : r.guest ? `<b>${esc(r.guest.name)}</b><small>${t('guest_pass')} · ${esc(r.guest.company)}</small>` : `<b>${t('unknown_code')}</b>`}</td>
          <td>${placeTxt(r)}</td><td>${evTxt(r.event)}</td><td>${UI.verdictPill(r.verdict)}${r.codeAge && r.verdict === 'PWA_SCREEN' ? `<small>${Math.round(r.codeAge / 60)} ${t('ago_min')}</small>` : ''}${r.reason ? `<small>${t('pr_' + r.reason)}</small>` : ''}</td>
          <td>${r.checked ? `<span class="pill p-mu">${t('checked')}</span>` : `<button class="btn sm" type="button" data-chk="${r.id}">${t('mark_checked')}</button>`}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">—</td></tr>`;
      };
      v.querySelector('#unc').onchange = () => { page = 1; load(); };
      v.addEventListener('click', async e => { const b = e.target.closest('[data-chk]'); if (b) { await API.admin.check(b.dataset.chk); load(); badges(); } });
      await load();
    },

    async emps(v) {
      state.branches = await API.admin.branches();
      const [positions, profiles] = await Promise.all([API.admin.positions(), API.admin.profiles()]);
      // фильтры живут в адресе: #emps?branch=1,2&kind=driver&app=no…  — ссылку можно переслать
      const H = new URLSearchParams((location.hash.split('?')[1] || ''));
      const arr = k => (H.get(k) || '').split('|').filter(Boolean);
      const F = {
        q: H.get('q') || '', branchIds: arr('branch').map(Number), positions: arr('pos'), kinds: arr('kind'),
        app: H.get('app') || '', access: H.get('acc') || '', profileId: H.get('prof') || '', status: H.get('st') || 'active',
        disc: H.get('disc') === '1', sort: H.get('sort') || 'tab', dir: H.get('dir') || 'asc'
      };
      const saveHash = () => {
        const o = new URLSearchParams();
        if (F.q) o.set('q', F.q); if (F.branchIds.length) o.set('branch', F.branchIds.join('|')); if (F.positions.length) o.set('pos', F.positions.join('|'));
        if (F.kinds.length) o.set('kind', F.kinds.join('|')); if (F.app) o.set('app', F.app); if (F.access) o.set('acc', F.access);
        if (F.profileId) o.set('prof', F.profileId); if (F.status !== 'active') o.set('st', F.status); if (F.disc) o.set('disc', '1');
        if (F.sort !== 'tab') o.set('sort', F.sort); if (F.dir !== 'asc') o.set('dir', F.dir);
        const qs = o.toString(); history.replaceState(null, '', '#emps' + (qs ? '?' + qs : ''));
      };
      const sel = new Set();
      const opt = (val, cur, label) => `<option value="${esc(val)}" ${String(cur) === String(val) ? 'selected' : ''}>${esc(label)}</option>`;
      v.innerHTML = `<div class="mh"><div><h1>${t('emps_page')}</h1><p id="ecnt"></p></div>
        <div class="ctl"><input class="in" id="eq" style="width:240px" value="${esc(F.q)}" data-i18n-ph="search_emp"><button class="btn" type="button" id="ecsv">${t('export_csv')}</button><button class="btn pri" type="button" id="eadd">${t('add_emp')}</button></div></div>
        <div class="card fbar">
          <div id="fbr"></div><div id="fpos"></div><div id="fkind"></div>
          <select class="in fsel" id="fapp" aria-label="${t('c_phone')}">${opt('', F.app, t('f_app') + ': ' + t('f_any'))}${opt('yes', F.app, t('app_on'))}${opt('no', F.app, t('app_off'))}</select>
          <select class="in fsel" id="facc" aria-label="${t('c_access')}">${opt('', F.access, t('c_access') + ': ' + t('f_any'))}${opt('home', F.access, t('src_home'))}${opt('profile', F.access, t('f_by_profile'))}${opt('extra', F.access, t('f_extra'))}${opt('blocked', F.access, t('src_blocked'))}</select>
          <select class="in fsel" id="fprof" aria-label="profile">${opt('', F.profileId, t('f_profile') + ': ' + t('f_any'))}${profiles.map(p => opt(p.id, F.profileId, pick(p.name))).join('')}</select>
          <select class="in fsel" id="fst" aria-label="status">${opt('active', F.status, t('f_working'))}${opt('fired', F.status, t('f_fired'))}${opt('all', F.status, t('f_all_st'))}</select>
          <label class="chk"><input type="checkbox" id="fdisc" ${F.disc ? 'checked' : ''}> ${t('f_disc')}</label>
          <button class="lnk" type="button" id="freset">${t('f_reset')}</button>
        </div>
        <div class="bulk hidden" id="bulk"><b id="bn"></b><button class="lnk" type="button" id="selall"></button>
          <button class="btn sm" type="button" data-bulk="open">${t('open_access')}</button><button class="btn sm" type="button" data-bulk="close">${t('close_access')}</button>
          <button class="btn sm" type="button" data-bulk="profile">${t('assign_profile')}</button><button class="btn sm" type="button" data-bulk="absence">${t('abs_bulk')}</button><button class="btn sm" type="button" data-bulk="links">${t('bulk_links')}</button>
          <button class="btn sm" type="button" data-bulk="block" style="color:var(--er)">${t('block_all')}</button>
          <button class="lnk" type="button" data-bulk="clear">${t('clear_sel')}</button></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th><input type="checkbox" id="eall" aria-label="all"></th>
          <th class="sortable" data-sort="tab">${t('c_tab')}</th><th class="sortable" data-sort="name">${t('c_name')}</th><th class="sortable" data-sort="pos">${t('c_pos')}</th><th class="sortable" data-sort="branch">${t('c_branch')}</th>
          <th>${t('c_access')}</th><th>${t('c_phone')}</th><th>${t('c_actions')}</th></tr></thead><tbody id="eB"></tbody></table></div><div id="pg"></div></section>`;
      // мультивыбор
      const kindOpts = ['office', 'warehouse', 'driver'].map(k => ({ v: k, l: t('kind_' + k) }));
      UI.multi(v.querySelector('#fbr'), { label: t('c_branch'), search: true, options: state.branches.map(b => ({ v: b.id, l: pick(b.name), c: b.staff })), value: F.branchIds, onChange: x => { F.branchIds = x.map(Number); reload(); } });
      UI.multi(v.querySelector('#fpos'), { label: t('c_pos'), search: true, options: positions.map(p => ({ v: p.pos, l: p.pos, c: p.count })), value: F.positions, onChange: x => { F.positions = x; reload(); } });
      UI.multi(v.querySelector('#fkind'), { label: t('f_kind'), options: kindOpts, value: F.kinds, onChange: x => { F.kinds = x; reload(); } });

      let list = [], page = 1, size = 50, total = 0, overall = 0;
      const accCell = e => e.blocked ? `<span class="pill p-er">${t('src_blocked')}</span>` :
        `${e.profile ? `<span class="pill p-bl">${esc(pick(e.profile))}</span>` : `<span class="pill p-mu">${t('src_home')}</span>`}${e.extra ? `<small>+${e.extra} ${t('extra_n')}</small>` : ''}`;
      const bulkUpd = () => {
        const b = v.querySelector('#bulk'); b.classList.toggle('hidden', !sel.size);
        v.querySelector('#bn').textContent = `${t('selected')}: ${sel.size}`;
        const sa = v.querySelector('#selall'); sa.hidden = sel.size >= total || !sel.size; sa.textContent = `${t('select_all_n')} ${total}`;
      };
      const query = extra => Object.assign({}, F, extra);
      const load = async keepPage => {
        if (!keepPage) page = 1;
        const r = await API.admin.employeesPage(query({ page, size }));
        list = r.rows; total = r.total; overall = r.overall; draw();
      };
      const reload = () => { saveHash(); load(); };
      const draw = () => {
        UI.pager(v.querySelector('#pg'), total, page, size, (p, s2) => { page = p; size = s2; load(true); });
        v.querySelector('#ecnt').textContent = total === overall && F.status === 'active' ? `${t('found')}: ${total}` : `${t('found')}: ${total} ${t('of_n')} ${overall}`;
        v.querySelectorAll('th[data-sort]').forEach(th => { th.classList.toggle('on', th.dataset.sort === F.sort); th.dataset.dir = th.dataset.sort === F.sort ? F.dir : ''; });
        v.querySelector('#eB').innerHTML = list.map(e => `<tr>
          <td><input type="checkbox" data-sel="${e.id}" ${sel.has(e.id) ? 'checked' : ''} aria-label="${esc(e.tab)}"></td>
          <td class="t mono">${esc(e.tab)}</td><td><button class="namebtn" type="button" data-ed="${e.id}">${esc(pick(e.name))}</button>${e.active ? '' : `<small style="color:var(--er)">${t('fired')}</small>`}</td><td>${esc(pick(e.pos))}</td><td>${esc(pick(e.branch))}</td>
          <td>${accCell(e)}</td>
          <td>${e.appActive ? `<span class="pill p-ok">${t('app_on')}</span>` : `<span class="pill p-mu">${t('app_off')}</span>`}${e.appPending ? ` <span class="pill p-wa">${t('app_pending')}</span>` : ''}</td>
          <td><div class="acts"><button class="btn sm" type="button" data-acc="${e.id}">${t('tab_access')}</button><button class="btn sm" type="button" data-inv="${e.id}" ${e.active ? '' : 'disabled'}>${t('invite')}</button>
            <button class="btn sm" type="button" data-st="${e.id}" ${e.active ? '' : 'disabled'}>${t('static_qr')}</button></div></td></tr>`).join('') || `<tr><td colspan="8" class="empty">${t('nothing_found')}</td></tr>`;
        v.querySelector('#eall').checked = list.length > 0 && list.every(x => sel.has(x.id));
        bulkUpd();
      };
      v.querySelector('#eq').oninput = UI.debounce(e => { F.q = v.querySelector('#eq').value.trim(); reload(); }, 300);
      v.querySelector('#fapp').onchange = e => { F.app = e.target.value; reload(); };
      v.querySelector('#facc').onchange = e => { F.access = e.target.value; reload(); };
      v.querySelector('#fprof').onchange = e => { F.profileId = e.target.value; reload(); };
      v.querySelector('#fst').onchange = e => { F.status = e.target.value; reload(); };
      v.querySelector('#fdisc').onchange = e => { F.disc = e.target.checked; reload(); };
      v.querySelector('#freset').onclick = () => { history.replaceState(null, '', '#emps'); render(); };
      v.querySelector('thead').addEventListener('click', e => { const th = e.target.closest('[data-sort]'); if (!th) return;
        if (F.sort === th.dataset.sort) F.dir = F.dir === 'asc' ? 'desc' : 'asc'; else { F.sort = th.dataset.sort; F.dir = 'asc'; } reload(); });
      v.querySelector('#eadd').onclick = () => editEmp(null, () => load(true));
      v.querySelector('#ecsv').onclick = async () => {
        const r = await API.admin.employeesPage(query({ size: 0 }));
        UI.download(`pratsivnyky_${today()}.csv`, UI.csv([[t('c_tab'), t('c_name'), t('c_pos'), t('c_branch'), t('f_kind'), t('c_access'), t('c_phone'), t('c_phone_num'), t('f_status')],
          ...r.rows.map(e => [e.tab, pick(e.name), pick(e.pos), pick(e.branch) || '', t('kind_' + e.kind), e.blocked ? t('src_blocked') : (e.profile ? pick(e.profile) : t('src_home')),
            e.appActive ? t('app_on') : t('app_off'), e.phone || '', e.active ? t('f_working') : t('f_fired')])]));
      };
      v.querySelector('#eall').onchange = e => { list.forEach(x => e.target.checked ? sel.add(x.id) : sel.delete(x.id)); draw(); };
      v.querySelector('#selall').onclick = async () => { (await API.admin.employeeIds(query({}))).forEach(id => sel.add(id)); draw(); };
      v.addEventListener('change', e => { const c = e.target.closest('[data-sel]'); if (c) { c.checked ? sel.add(+c.dataset.sel) : sel.delete(+c.dataset.sel); bulkUpd(); } });
      v.addEventListener('click', async e => {
        const bb = e.target.closest('[data-bulk]');
        if (bb) {
          const ids = [...sel], k = bb.dataset.bulk;
          if (k === 'clear') { sel.clear(); draw(); }
          if (k === 'open' || k === 'close') accessBulkModal(ids, k === 'open', () => load(true));
          if (k === 'profile') profileBulkModal(ids, () => load(true));
          if (k === 'absence') absenceModal({ empIds: ids, title: `${t('selected')}: ${ids.length}` }, () => load(true));
          if (k === 'links') bulkLinksModal({ empIds: ids, title: `${t('selected')}: ${ids.length}` }, () => load(true));
          if (k === 'block') { await API.admin.setBlocked(ids, true); UI.toast(`${t('src_blocked')}: ${ids.length}`); load(true); }
          return;
        }
        const b = e.target.closest('button'); if (!b) return;
        const id = +(b.dataset.inv || b.dataset.st || b.dataset.ed || b.dataset.acc); const emp = list.find(x => x.id === id);
        if (b.dataset.inv) inviteModal(emp, () => load(true));
        if (b.dataset.st) staticModal(emp);
        if (b.dataset.ed) editEmp(emp, () => load(true));
        if (b.dataset.acc) editEmp(emp, () => load(true), 'access');
      });
      await load();
    },

    async absences(v) {
      const bs = state.branches = await API.admin.branches();
      const H = new URLSearchParams((location.hash.split('?')[1] || ''));
      const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      const F = { from: H.get('from') || today(), to: H.get('to') || plus(30), branchId: H.get('branch') || '', kind: H.get('kind') || '', q: H.get('q') || '' };
      let page = 1, size = 50, rows = [], total = 0;
      v.innerHTML = `<div class="mh"><div><h1>${t('abs_page')}</h1><p>${t('abs_sub')}</p></div><div class="ctl"><button class="btn pri" type="button" id="aadd">${t('abs_add')}</button></div></div>
        <div class="card fbar" style="align-items:flex-end">
          <label class="f"><span>${t('abs_from')}</span><input class="in" type="date" id="ff" value="${F.from}"></label>
          <label class="f"><span>${t('abs_to')}</span><input class="in" type="date" id="ft" value="${F.to}"></label>
          <select class="in fsel" id="fb"><option value="">${t('all_branches')}</option>${bs.map(b => `<option value="${b.id}" ${String(b.id) === F.branchId ? 'selected' : ''}>${esc(pick(b.name))}</option>`).join('')}</select>
          <select class="in fsel" id="fk"><option value="">${t('abs_all_kinds')}</option>${ABS_KINDS.map(k => `<option value="${k}" ${k === F.kind ? 'selected' : ''}>${t('exc_' + k)}</option>`).join('')}</select>
          <input class="in" id="fq" style="width:220px" value="${esc(F.q)}" data-i18n-ph="search_emp">
        </div>
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th>${t('c_name')}</th><th>${t('c_branch')}</th><th>${t('abs_kind')}</th><th>${t('abs_from')} – ${t('abs_to')}</th><th>${t('abs_days')}</th><th>${t('abs_note')}</th><th>${t('abs_who')}</th><th></th></tr></thead>
          <tbody id="aB"></tbody></table></div><div id="pg"></div></section>`;
      const save = () => { const o = new URLSearchParams(); Object.entries(F).forEach(([k, x]) => { if (x) o.set(k === 'branchId' ? 'branch' : k, x); }); history.replaceState(null, '', '#absences?' + o.toString()); };
      const load = async keep => {
        if (!keep) page = 1; save();
        const r = await API.admin.absences(Object.assign({}, F, { branchId: F.branchId || null, page, size })); rows = r.rows; total = r.total;
        v.querySelector('#aB').innerHTML = rows.map(x => `<tr><td><b>${en(x.employee, esc(pick(x.employee.name)))}</b><small>${t('tab_no')} ${esc(x.employee.tab)} · ${esc(pick(x.employee.pos))}</small></td>
          <td>${esc(pick(x.employee.branch) || '')}</td><td>${kindPill(x.kind)}</td><td class="t">${dmy(x.from)} – ${dmy(x.to)}</td><td>${x.days}</td><td>${esc(x.note || '')}</td><td style="color:var(--mu)">${esc(x.by || '')}</td>
          <td><div class="acts"><button class="btn sm" type="button" data-ae="${x.id}">${t('dev_edit')}</button><button class="btn sm" type="button" data-ad="${x.id}" style="color:var(--er)">${t('remove')}</button></div></td></tr>`).join('')
          || `<tr><td colspan="8" class="empty">${t('abs_none')}</td></tr>`;
        UI.pager(v.querySelector('#pg'), total, page, size, (p, s2) => { page = p; size = s2; load(true); });
      };
      v.querySelector('#ff').onchange = e => { F.from = e.target.value; load(); };
      v.querySelector('#ft').onchange = e => { F.to = e.target.value; load(); };
      v.querySelector('#fb').onchange = e => { F.branchId = e.target.value; load(); };
      v.querySelector('#fk').onchange = e => { F.kind = e.target.value; load(); };
      v.querySelector('#fq').oninput = UI.debounce(e => { F.q = v.querySelector('#fq').value.trim(); load(); }, 300);
      v.querySelector('#aadd').onclick = () => absenceModal({}, () => load(true));
      v.addEventListener('click', async ev => {
        const ed = ev.target.closest('[data-ae]'); if (ed) return absenceModal({ abs: rows.find(y => y.id === +ed.dataset.ae) }, () => load(true));
        const dl = ev.target.closest('[data-ad]'); if (dl && confirm(t('abs_del_q'))) { try { await API.admin.deleteAbsence(+dl.dataset.ad); load(true); } catch (err) { UI.toast(err.message); } }
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
          <div class="bcards">${ps.map(p => `<section class="card bc"><h3>${esc(pick(p.name))}</h3><p>${p.staff} ${t('emps_n')} · ${p.gateIds.length} ${t('gates')}${p.noDiscipline ? ` · <span class="pill p-mu">${t('d_noctl')}</span>` : ''}</p>
            <div class="chips">${p.places.map(x => `<span class="pill p-mu">${esc(pick(x.branch))} · ${esc(pick(x.gate))}</span>`).join('')}</div>
            <button class="btn sm" type="button" data-pe="${p.id}" style="margin-top:12px">${t('edit')}</button></section>`).join('')}</div>`;
        const edit = p => UI.modal(`<h2>${p ? esc(pick(p.name)) : t('add_profile')}</h2>
          <div class="grid2"><label class="f">${t('profile_name')} (УКР)<input class="in" id="nu" value="${p ? esc(p.name.uk) : ''}"></label><label class="f">${t('profile_name')} (РУС)<input class="in" id="nr" value="${p ? esc(p.name.ru) : ''}"></label></div>
          <label class="chk" style="margin-top:12px"><input type="checkbox" id="nd" ${p && p.noDiscipline ? 'checked' : ''}> ${t('no_discipline')}</label>
          <p style="margin:16px 0 8px;font-weight:700;color:var(--ink)">${t('choose_locs')}</p>${UI.gateTree(bs, p ? p.gateIds : [])}
          <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ok">${t('save')}</button></div>`,
          (m, close) => { const get = UI.bindTree(m); m.querySelector('#ok').onclick = async () => { const uk = m.querySelector('#nu').value.trim(); if (!uk) return;
            await API.admin.saveProfile({ id: p && p.id, name: { uk, ru: m.querySelector('#nr').value.trim() || uk }, gateIds: get(), noDiscipline: m.querySelector('#nd').checked }); close(); render(); }; });
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
          box.querySelector('#gB').innerHTML = rows.sort((a, b) => b.allowed - a.allowed).map(r => `<tr style="${r.allowed ? '' : 'opacity:.6'}"><td class="t mono">${esc(r.employee.tab)}</td><td><b>${en(r.employee, esc(pick(r.employee.name)))}</b></td><td>${esc(pick(r.employee.pos))}</td><td>${esc(pick(r.employee.branch))}</td>
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
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th>${t('c_guest')}</th><th>${t('pp_where')}</th><th>${t('c_valid')}</th><th>${t('c_status')}</th><th>${t('entries')}</th><th>${t('issued_by')}</th><th></th></tr></thead><tbody id="psB"></tbody></table></div><div id="pg"></div></section>`;
      let rows = [];
      const leftTxt = p => { const ms = new Date(p.to) - Date.now(); if (ms <= 0) return ''; const h = Math.floor(ms / 36e5); return `${t('left')} ${h >= 24 ? Math.floor(h / 24) + ' ' + t('d_short') + ' ' : ''}${h % 24} ${t('h_short')}`; };
      const dt = iso => `${new Date(iso).toLocaleDateString('uk-UA').slice(0, 5)} ${I18N.hm(iso)}`;
      const stCls = { active: 'p-ok', future: 'p-bl', expired: 'p-mu', revoked: 'p-er', used: 'p-mu' };
      let page = 1, size = 50;
      const load = async () => { rows = await API.admin.passes(); draw(); };
      const draw = () => {
        const only = v.querySelector('#pact').checked;
        const flt = rows.filter(p => !only || ['active', 'future'].includes(p.status));
        UI.pager(v.querySelector('#pg'), flt.length, page, size, (p, s2) => { page = p; size = s2; draw(); });
        v.querySelector('#psB').innerHTML = flt.slice((page - 1) * size, page * size).map(p => `<tr>
          <td><b>${esc(p.name)}</b><small>${esc(p.company)}${p.phone ? ' · ' + esc(p.phone) : ''}</small></td>
          <td>${p.places.map(x => `${esc(pick(x.branch))} · ${esc(pick(x.gate))}`).join('<br>')}</td>
          <td class="t">${dt(p.from)}<small>→ ${dt(p.to)}</small></td>
          <td><span class="pill ${stCls[p.status]}">${t('st_' + p.status)}</span>${p.status === 'active' ? `<small>${leftTxt(p)}</small>` : ''}</td>
          <td>${p.uses}${p.maxUses ? ' / ' + p.maxUses : ''}</td><td><small style="color:var(--ink)">${esc(p.issuedBy)}</small></td>
          <td><div class="acts">${['active', 'future'].includes(p.status) ? `<button class="btn sm" type="button" data-pl="${p.id}">${t('show_link')}</button><button class="btn sm" type="button" data-pr="${p.id}" style="color:var(--er)">${t('revoke')}</button>` : ''}</div></td></tr>`).join('') || `<tr><td colspan="7" class="empty">—</td></tr>`;
      };
      v.querySelector('#pact').onchange = () => { page = 1; draw(); };
      v.querySelector('#pnew').onclick = () => newPassModal(bs, load);
      v.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.pr) { await API.admin.revokePass(+b.dataset.pr); UI.toast(t('st_revoked')); load(); }
        if (b.dataset.pl) passLinkModal(rows.find(x => x.id === +b.dataset.pl));
      });
      await load();
    },

    async branches(v) {
      const all = await API.admin.branches();
      const st = state.brView = state.brView || { q: '', sort: 'name' };
      v.innerHTML = `<div class="mh"><div><h1>${t('branches_page')}</h1><p id="bsum"></p></div>
        <div class="ctl"><input class="in" id="bq" style="width:200px" value="${esc(st.q)}" placeholder="${t('br_search')}">
          <select class="in fsel" id="bsort"><option value="name">${t('sort_name')}</option><option value="staff">${t('sort_staff')}</option><option value="act">${t('sort_act')}</option></select>
          <button class="btn" type="button" id="hol">${t('holidays')}</button><button class="btn" type="button" id="posters">${t('posters_all')}</button><button class="btn pri" type="button" id="badd">${t('add_branch')}</button></div></div>
        <div class="bcards" id="bcards"></div>`;
      v.querySelector('#bsort').value = st.sort;
      const tot = all.reduce((a, b) => ({ s: a.s + b.staff, a: a.a + (b.activated || 0), o: a.o + (b.onSite || 0) }), { s: 0, a: 0, o: 0 });
      v.querySelector('#bsum').textContent = `${all.length} ${t('branches_n')} · ${tot.s} ${t('emps_n')} · ${t('activated_n')} ${tot.a} (${tot.s ? Math.round(100 * tot.a / tot.s) : 0}%) · ${t('on_site_now')} ${tot.o}`;
      const draw = () => {
        const q = st.q.toLowerCase();
        const bs = all.filter(b => !q || (b.name.uk + ' ' + b.name.ru).toLowerCase().includes(q)).sort((x, y) =>
          st.sort === 'staff' ? y.staff - x.staff : st.sort === 'act' ? ((x.activated || 0) / (x.staff || 1)) - ((y.activated || 0) / (y.staff || 1)) : pick(x.name).localeCompare(pick(y.name)));
        v.querySelector('#bcards').innerHTML = bs.map(b => { const pct = b.staff ? Math.round(100 * (b.activated || 0) / b.staff) : 0;
          return `<section class="card bc"><h3>${esc(pick(b.name))}</h3>
          <p>${b.staff} ${t('emps_n')} · ${b.gates.length} ${t('gates')} · ${t('on_site_now')} <b>${b.onSite || 0}</b></p>
          <div class="actbar" title="${t('activated_n')} ${b.activated || 0} / ${b.staff}"><i style="width:${pct}%"></i></div>
          <p class="actline">${t('activated_n')} <b>${b.activated || 0}</b> ${t('of_n')} ${b.staff} (${pct}%)</p>
          ${!b.gates.length && b.staff ? `<p class="warnline">⚠ ${t('no_gates_warn')}</p>` : ''}
          ${b.gates.length ? `<ul>${b.gates.map(g => `<li><span>${esc(pick(g.name))}</span></li>`).join('')}</ul>` : ''}
          <div class="acts" style="justify-content:flex-start;margin-top:10px;flex-wrap:wrap">
            <a class="btn sm pri" href="#emps?branch=${b.id}">${t('emps_page')}</a>
            ${b.staff - (b.activated || 0) > 0 ? `<button class="btn sm" type="button" data-links="${b.id}">${t('links_for')} ${b.staff - (b.activated || 0)}</button>` : ''}
            <button class="btn sm" type="button" data-poster="${b.id}">${t('poster')}</button><button class="btn sm" type="button" data-addg="${b.id}">${t('add_gate')}</button><button class="btn sm" type="button" data-sch="${b.id}">${t('schedule')}</button></div></section>`; }).join('') || `<p class="empty">${t('nothing_found')}</p>`;
      };
      draw();
      v.querySelector('#bq').oninput = e => { st.q = e.target.value; draw(); };
      v.querySelector('#bsort').onchange = e => { st.sort = e.target.value; draw(); };
      const ask = (title, cb) => UI.modal(`<h2>${esc(title)}</h2>
        <div class="grid2"><label class="f">УКР<input class="in" id="nu" required></label><label class="f">РУС<input class="in" id="nr"></label></div>
        <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ok">${t('save')}</button></div>`,
        (m, close) => { m.querySelector('#ok').onclick = async () => { const uk = m.querySelector('#nu').value.trim(); if (!uk) return; await cb({ uk, ru: m.querySelector('#nr').value.trim() || uk }); close(); render(); }; });
      v.querySelector('#badd').onclick = () => ask(t('branch_name'), n => API.admin.saveBranch(n));
      v.addEventListener('click', e => {
        let b = e.target.closest('[data-addg]'); if (b) return ask(t('gate_name'), n => API.admin.saveGate(+b.dataset.addg, n));
        b = e.target.closest('[data-poster]'); if (b) return printPosters(+b.dataset.poster);
        b = e.target.closest('[data-sch]'); if (b) return scheduleModal(all.find(x => x.id === +b.dataset.sch));
        b = e.target.closest('[data-links]'); if (b) { const br = all.find(x => x.id === +b.dataset.links); return bulkLinksModal({ branchId: br.id, title: pick(br.name) }, render); }
      });
      v.querySelector('#hol').onclick = holidaysModal;
      v.querySelector('#posters').onclick = () => printPosters(null);
    },

    async devices(v) {
      const ds = await API.admin.devices(); const bs = await API.admin.branches();
      v.innerHTML = `<div class="mh"><div><h1>${t('devices_page')}</h1></div><div class="ctl"><button class="btn pri" type="button" id="dadd">${t('new_device')}</button></div></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table><thead><tr><th>${t('c_status')}</th><th>${t('c_branch')}</th><th>${t('c_gate')}</th><th>ID</th><th>${t('c_seen')}</th><th>${t('c_queue')}</th><th>${t('c_battery')}</th><th></th></tr></thead>
        <tbody>${ds.map(d => `<tr><td>${d.online ? `<span class="pill p-ok">${t('online')}</span>` : `<span class="pill p-er">${t('offline')}</span>`}</td>
          <td><b>${esc(pick(d.branch))}</b></td><td>${esc(pick(d.gate))}</td><td class="mono">${esc(d.name)}</td>
          <td class="t">${minAgo(d.lastSeen) < 1 ? '&lt; 1' : minAgo(d.lastSeen)} ${t('min')}</td><td>${d.queue}</td><td>${d.battery == null ? `<span title="${t('no_battery')}" style="color:var(--mu)">—</span>` : d.battery + '%'}</td><td class="mono" style="color:var(--mu)">v${esc(d.version || '')}</td>
          <td style="white-space:nowrap">${((userGet() || {}).role || 'admin') === 'admin' ? `<button class="btn sm" type="button" data-dedit="${d.id}">${t('dev_edit')}</button> <button class="btn sm" type="button" data-ddel="${d.id}" style="color:var(--er)">${t('dev_del')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
      const gateOpts = sel => bs.map(b => b.gates.map(g => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${esc(pick(b.name))} · ${esc(pick(g.name))}</option>`).join('')).join('');
      v.addEventListener('click', e => {
        let b = e.target.closest('[data-dedit]');
        if (b) { const d = ds.find(x => x.id === +b.dataset.dedit);
          return UI.modal(`<h2>${t('dev_edit_t')}</h2><label class="f">${t('dev_name')}<input class="in" id="dn" value="${esc(d.name || '')}"></label>
            <label class="f">${t('choose_gate')}<select class="in" id="dg">${gateOpts(d.gateId)}</select></label>
            <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="ds">${t('save')}</button></div>`, (m, close) => {
            m.querySelector('#ds').onclick = async () => {
              try { await API.admin.saveDevice(d.id, m.querySelector('#dn').value.trim(), +m.querySelector('#dg').value); close(); UI.toast(t('saved')); render(); } catch (err) { UI.toast(err.message); }
            }; }); }
        b = e.target.closest('[data-ddel]');
        if (b) { const d = ds.find(x => x.id === +b.dataset.ddel);
          return UI.modal(`<h2>${t('dev_del')}: ${esc(d.name || '')}</h2><p>${esc(pick(d.branch))} · ${esc(pick(d.gate))}</p><p>${t('dev_del_q')}</p>
            <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="dx" style="background:var(--er);border-color:var(--er);color:#fff">${t('dev_del')}</button></div>`, (m, close) => {
            m.querySelector('#dx').onclick = async () => { try { await API.admin.deleteDevice(d.id); close(); UI.toast(t('dev_deleted')); render(); } catch (err) { UI.toast(err.message); } }; }); }
      });
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
      v.innerHTML = `<div class="mh"><div><h1>${t('reports_page')}</h1><p>${t('rep_hint2')}</p></div></div>
        <div class="card" style="padding:16px 20px"><div class="tabs2" id="rm" style="margin-bottom:14px"><button type="button" data-m="days" class="on">${t('rep_days')}</button><button type="button" data-m="rating">${t('rep_rating')}</button></div>
          <div class="ctl">
          <label class="f"><span>${t('date_from')}</span><input class="in" type="date" id="rf" value="${daysAgo(6)}"></label>
          <label class="f"><span>${t('date_to')}</span><input class="in" type="date" id="rt" value="${today()}"></label>
          <label class="f"><span>${t('c_branch')}</span>${branchSelect('rb', 0)}</label>
          <label class="chk" id="rbadw"><input type="checkbox" id="rbad"> ${t('only_viol')}</label>
          <button class="btn pri" type="button" id="rgo">${t('rep_build')}</button><button class="btn" type="button" id="rcsv">${t('export_csv')}</button></div></div>
        <section class="card" style="overflow:hidden"><div class="tw"><table id="rT"></table></div><div id="pg"></div></section>`;
      let rows = [], total = 0, page = 1, size = 50, mode = 'days', sortK = 'violations', sortD = -1;
      const f = () => ({ from: v.querySelector('#rf').value, to: v.querySelector('#rt').value, branchId: +v.querySelector('#rb').value, mode });
      const RCOLS = [['tab', 'c_tab'], ['name', 'c_name'], ['branch', 'c_branch'], ['days', 'r_days'], ['workedMin', 'worked'], ['late', 'r_late'], ['lateMin', 'r_late_min'], ['lateMax', 'r_late_max'],
        ['early', 'r_early'], ['earlyMin', 'r_early_min'], ['noOut', 'v_noout'], ['lunch', 'r_lunch'], ['lunchOverMin', 'r_lunch_min'], ['absent', 'v_absent'], ['excused', 'r_excused'], ['violations', 'r_total']];
      const rval = (r, k) => k === 'tab' ? r.employee.tab : k === 'name' ? pick(r.employee.name) : k === 'branch' ? pick(r.employee.branch) || '' : r[k];
      const draw = () => {
        const T = v.querySelector('#rT');
        if (mode === 'days') {
          T.innerHTML = dayHead(true) + `<tbody>${rows.map(d => dayRow(d, true)).join('') || `<tr><td colspan="9" class="empty">—</td></tr>`}</tbody>`;
          UI.pager(v.querySelector('#pg'), total, page, size, (p, s2) => { page = p; size = s2; go(true); });
        } else {
          v.querySelector('#pg').innerHTML = '';
          const list = rows.slice().sort((x, y) => { const a = rval(x, sortK), b = rval(y, sortK); return (a > b ? 1 : a < b ? -1 : 0) * sortD; });
          T.innerHTML = `<thead><tr>${RCOLS.map(([k, l]) => `<th class="sortable" data-k="${k}">${t(l)}${sortK === k ? (sortD < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
            <tbody>${list.map(r => `<tr class="${r.violations ? 'bad' : ''}">${RCOLS.map(([k]) => k === 'name' ? `<td><b>${en(r.employee, esc(pick(r.employee.name)))}</b><small>${esc(pick(r.employee.pos))}</small></td>`
              : k === 'tab' ? `<td class="mono">${esc(r.employee.tab)}</td>` : k === 'branch' ? `<td>${esc(pick(r.employee.branch))}</td>`
              : k === 'workedMin' ? `<td class="t">${dur(r.workedMin)}</td>` : `<td class="t">${r[k] ? `<b>${r[k]}</b>` : '<span style="color:var(--mu)">0</span>'}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${RCOLS.length}" class="empty">—</td></tr>`}</tbody>`;
        }
      };
      const go = async keep => {
        if (!keep) page = 1;
        const r = await API.admin.report(Object.assign(f(), mode === 'days' ? { page, size, onlyBad: v.querySelector('#rbad').checked } : {}));
        if (mode === 'days') { rows = r.rows; total = r.total; } else rows = r;
        draw();
      };
      v.querySelector('#rm').onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m;
        v.querySelectorAll('#rm [data-m]').forEach(x => x.classList.toggle('on', x === b)); v.querySelector('#rbadw').style.display = mode === 'days' ? '' : 'none'; go(); };
      v.querySelector('#rbad').onchange = () => go();
      v.querySelector('#rT').addEventListener('click', e => { const th = e.target.closest('[data-k]'); if (!th) return; if (sortK === th.dataset.k) sortD = -sortD; else { sortK = th.dataset.k; sortD = -1; } draw(); });
      v.querySelector('#rgo').onclick = go;
      v.querySelector('#rcsv').onclick = async () => {
        if (mode === 'days') { const all = (await API.admin.report(Object.assign(f(), { onlyBad: v.querySelector('#rbad').checked }))).rows;
          UI.download(`zvit_${f().from}_${f().to}.csv`, UI.csv([[t('c_date'), t('c_tab'), t('c_name'), t('c_branch'), t('first_in'), t('last_out'), t('c_lunch'), t('worked'), t('c_viol')],
          ...all.map(d => [d.day, d.employee.tab, pick(d.employee.name), pick(d.employee.branch) || '', d.arrival || '', d.leave || '', lunchTxt(d), dur(d.workedMin), violText(d)])])); }
        else UI.download(`reiting_${f().from}_${f().to}.csv`, UI.csv([RCOLS.map(([, l]) => t(l)), ...rows.map(r => RCOLS.map(([k]) => k === 'workedMin' ? dur(r.workedMin) : rval(r, k)))])); };
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
      ${e ? `<div class="tabs2"><button type="button" data-tb="data" class="${startTab && startTab !== 'data' ? '' : 'on'}">${t('tab_data')}</button><button type="button" data-tb="access" class="${startTab === 'access' ? 'on' : ''}">${t('tab_access')}</button><button type="button" data-tb="disc" class="${startTab === 'disc' ? 'on' : ''}">${t('tab_disc')}</button><button type="button" data-tb="abs" class="${startTab === 'abs' ? 'on' : ''}">${t('abs_tab')}</button></div>` : `<p>${t('emp_card')}</p>`}
      <div id="tb-data" class="${startTab && startTab !== 'data' ? 'hidden' : ''}">
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
      <div id="tb-disc" class="hidden"></div><div id="tb-abs" class="hidden"></div>
      ${e ? `<div class="acts" id="accActs" ${startTab === 'access' ? '' : 'style="display:none"'}><button class="btn pri" type="button" data-close>${t('close')}</button></div>` : ''}`,
      (m, close) => {
        m.classList.add('wide');
        const showTab = k => { m.querySelectorAll('[data-tb]').forEach(b => b.classList.toggle('on', b.dataset.tb === k)); m.querySelector('#tb-data').classList.toggle('hidden', k !== 'data');
          m.querySelector('#tb-access').classList.toggle('hidden', k !== 'access'); m.querySelector('#tb-disc').classList.toggle('hidden', k !== 'disc');
          m.querySelector('#tb-abs').classList.toggle('hidden', k !== 'abs');
          const aa = m.querySelector('#accActs'); if (aa) aa.style.display = k !== 'data' ? '' : 'none';
          if (k === 'disc') disciplinePanel(m.querySelector('#tb-disc'), e);
          if (k === 'abs') absPanel(m.querySelector('#tb-abs'), e);
          if (k === 'access' && !m.querySelector('#tb-access').innerHTML) accessPanel(m.querySelector('#tb-access'), e.id, done); };
        m.querySelectorAll('[data-tb]').forEach(b => b.onclick = () => showTab(b.dataset.tb));
        if (startTab && startTab !== 'data') showTab(startTab);
        m.querySelector('#m_save').onclick = async () => {
          const g = id => m.querySelector(id).value.trim();
          if (!g('#m_tab') || !g('#m_nu')) { UI.toast(t('c_tab') + ' / ' + t('c_name')); return; }
          try {
            await API.admin.saveEmployee({ id: e && e.id, tab: g('#m_tab'), branchId: +g('#m_br'), kind: g('#m_k'), active: m.querySelector('#m_act').checked,
              name: { uk: g('#m_nu'), ru: g('#m_nr') || g('#m_nu') }, pos: { uk: g('#m_pu'), ru: g('#m_pr') || g('#m_pu') } });
            close(); done(); UI.toast('OK');
          } catch (err) { UI.toast(err.message === 'tab' ? t('c_tab') + ' — duplicate' : (err.message || 'Error')); }
        };
      });
  }
  // ===== отсутствия =====
  const ABS_KINDS = ['vacation', 'sick', 'remote', 'leave', 'trip', 'unpaid', 'other'];
  const KIND_CLS = { vacation: 'p-bl', sick: 'p-wa', remote: 'p-ok', leave: 'p-mu', trip: 'p-bl', unpaid: 'p-mu', other: 'p-mu' };
  const kindPill = (k, extra) => `<span class="pill ${KIND_CLS[k] || 'p-mu'}">${t('exc_' + k)}${extra || ''}</span>`;
  const dmy = d => d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '';
  // форма отсутствия: для одного, для выбранных или с поиском людей
  function absenceModal(o, done) {
    const a = o.abs || null, picked = new Map();
    const pickMode = !a && !(o.empIds && o.empIds.length);
    UI.modal(`<h2>${a ? t('abs_edit') : t('abs_add')}</h2>
      ${a ? `<p>${esc(pick(a.employee.name))} · ${t('tab_no')} ${esc(a.employee.tab)}</p>` : o.title ? `<p>${esc(o.title)}</p>` : ''}
      ${pickMode ? `<label class="f">${t('abs_emps')}<input class="in" id="ap" placeholder="${esc(t('abs_pick'))}" autocomplete="off"></label><div id="apl" class="apl"></div><div id="apc" class="chips" style="margin:8px 0"></div>` : ''}
      <label class="f">${t('abs_kind')}<select class="in" id="ak">${ABS_KINDS.map(k => `<option value="${k}" ${a && a.kind === k ? 'selected' : ''}>${t('exc_' + k)}</option>`).join('')}</select></label>
      <div class="grid2"><label class="f">${t('abs_from')}<input class="in" type="date" id="af" value="${a ? a.from : today()}"></label><label class="f">${t('abs_to')}<input class="in" type="date" id="at" value="${a ? a.to : today()}"></label></div>
      <label class="f">${t('abs_note')}<input class="in" id="an" value="${a ? esc(a.note || '') : ''}"></label>
      <p style="color:var(--mu);margin:6px 0 0">${t('abs_hint_wk')}</p>
      <div class="acts"><button class="btn" type="button" data-close>${t('cancel')}</button><button class="btn pri" type="button" id="as">${t('save')}</button></div>`, (m, close) => {
      const af = m.querySelector('#af'), at = m.querySelector('#at');
      af.onchange = () => { if (at.value < af.value) at.value = af.value; };
      if (pickMode) {
        const inp = m.querySelector('#ap'), list = m.querySelector('#apl'), chips = m.querySelector('#apc');
        const drawChips = () => { chips.innerHTML = [...picked.values()].map(e => `<span class="pill p-bl">${esc(pick(e.name))} <button type="button" class="x" data-unp="${e.id}">×</button></span>`).join(' '); };
        inp.oninput = UI.debounce(async () => {
          const q = inp.value.trim(); if (q.length < 2) { list.innerHTML = ''; return; }
          const r = await API.admin.employeesPage({ q, page: 1, size: 8 });
          list.innerHTML = r.rows.map(e => `<button type="button" data-pk="${e.id}"><b>${esc(pick(e.name))}</b><small>${esc(e.tab)} · ${esc(pick(e.pos))} · ${esc(pick(e.branch) || '')}</small></button>`).join('') || `<div class="empty">${t('nothing_found')}</div>`;
          list._rows = r.rows;
        }, 250);
        m.addEventListener('click', ev => {
          const pk = ev.target.closest('[data-pk]'); if (pk) { const e = list._rows.find(x => x.id === +pk.dataset.pk); picked.set(e.id, e); inp.value = ''; list.innerHTML = ''; drawChips(); inp.focus(); }
          const un = ev.target.closest('[data-unp]'); if (un) { picked.delete(+un.dataset.unp); drawChips(); }
        });
      }
      m.querySelector('#as').onclick = async () => {
        const body = { kind: m.querySelector('#ak').value, from: af.value, to: at.value, note: m.querySelector('#an').value.trim() };
        if (a) body.id = a.id; else body.empIds = pickMode ? [...picked.keys()] : o.empIds;
        if (!a && !body.empIds.length) return UI.toast(t('abs_pick'));
        try { await API.admin.saveAbsence(body); close(); UI.toast(t('abs_saved')); done && done(); } catch (err) { UI.toast(err.message); }
      };
    });
  }
  async function absPanel(box, e) {
    const [r, rule] = await Promise.all([API.admin.absences({ empId: e.id, size: 0 }), API.admin.remoteRule(e.id)]);
    const R = rule || { dows: [] };
    box.innerHTML = `<div class="ch" style="padding:0;margin:4px 0 10px"><h2 style="margin:0">${t('abs_tab')}</h2><button class="btn sm pri" type="button" id="aadd">${t('abs_add')}</button></div>
      <div class="tw"><table><thead><tr><th>${t('abs_kind')}</th><th>${t('abs_from')} – ${t('abs_to')}</th><th>${t('abs_days')}</th><th>${t('abs_note')}</th><th></th></tr></thead><tbody>
      ${r.rows.map(x => `<tr><td>${kindPill(x.kind)}</td><td class="t">${dmy(x.from)} – ${dmy(x.to)}</td><td>${x.days}</td><td>${esc(x.note || '')}</td>
        <td><div class="acts"><button class="btn sm" type="button" data-ae="${x.id}">${t('dev_edit')}</button><button class="btn sm" type="button" data-ad="${x.id}" style="color:var(--er)">${t('remove')}</button></div></td></tr>`).join('') || `<tr><td colspan="5" class="empty">—</td></tr>`}</tbody></table></div>
      <div class="remb"><h3>${t('rem_title')}</h3><p>${t('rem_text')}</p>
        <div class="dows">${[1, 2, 3, 4, 5, 6, 7].map(d => `<label class="chk"><input type="checkbox" value="${d}" ${R.dows.includes(d) ? 'checked' : ''}> ${t('dow' + d)}</label>`).join('')}</div>
        <div class="ctl" style="margin-top:10px;align-items:flex-end"><label class="f"><span>${t('rem_from')}</span><input class="in" type="date" id="rf" value="${R.from || ''}"></label>
          <label class="f"><span>${t('rem_to')}</span><input class="in" type="date" id="rt" value="${R.to || ''}"></label><button class="btn pri" type="button" id="rs">${t('save')}</button></div></div>`;
    const again = () => absPanel(box, e);
    box.querySelector('#aadd').onclick = () => absenceModal({ empIds: [e.id], title: pick(e.name) }, again);
    box.querySelector('#rs').onclick = async () => {
      const dows = [...box.querySelectorAll('.dows input:checked')].map(x => +x.value);
      try { await API.admin.saveRemote(e.id, dows, box.querySelector('#rf').value, box.querySelector('#rt').value); UI.toast(t('rem_saved')); } catch (err) { UI.toast(err.message); }
    };
    box.onclick = async ev => {
      const ed = ev.target.closest('[data-ae]'); if (ed) { const x = r.rows.find(y => y.id === +ed.dataset.ae); return absenceModal({ abs: x }, again); }
      const dl = ev.target.closest('[data-ad]'); if (dl && confirm(t('abs_del_q'))) { try { await API.admin.deleteAbsence(+dl.dataset.ad); again(); } catch (err) { UI.toast(err.message); } }
    };
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
