// Слой API «Зеніт-Авто.облік».
// Все экраны ходят только сюда. В режиме MOCK данные живут в localStorage браузера,
// в боевом режиме те же функции вызывают вебхуки n8n (см. REAL ниже и README).
(function () {
  const C = window.ZA_CONFIG;
  const KEY = 'za-mock-v1';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- крипто: HMAC-SHA256, первые 16 байт, base64url ----------
  const te = new TextEncoder();
  const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  const randBytes = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; };
  // Подпись совместима с нодой Crypto в n8n: HMAC-SHA256, ключ = строка секрета (UTF-8),
  // результат = первые 32 hex-символа (16 байт).
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  async function hmac16(secret, msg) {
    if (crypto.subtle) {
      const k = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, te.encode(msg)));
      return hex(s.slice(0, 16));
    }
    // запасной вариант без WebCrypto (страница открыта не по HTTPS): только для демо
    let h1 = 2166136261, h2 = 5381; const str = secret + '|' + msg;
    for (let i = 0; i < str.length; i++) { h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619); h2 = Math.imul(h2, 33) ^ str.charCodeAt(i); }
    const out = new Uint8Array(16); for (let i = 0; i < 16; i++) out[i] = ((i % 2 ? h1 : h2) >>> ((i % 4) * 8)) & 255;
    return hex(out);
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : b64u(randBytes(16)));
  const nowS = () => Math.floor(Date.now() / 1000);

  // Код временного пропуска (страница гостя), формат TT1.P.<код>.<время>.<подпись>
  async function makePassCode(secret, code, ts) {
    ts = ts || nowS();
    return `TT1.P.${code}.${ts}.${await hmac16(secret, `P.${code}.${ts}`)}`;
  }
  // Код для экрана «Мой код» (считается на телефоне, работает без сети)
  // Живой код сотрудника. С выбранным событием: TT1.D.<таб>.<время>.<событие>.<подпись>
  const EV_CODE = { IN: 'I', OUT: 'O', BREAK_OUT: 'BO', BREAK_IN: 'BI', DUTY_OUT: 'DO', DUTY_IN: 'DI' };
  const EV_FROM = Object.fromEntries(Object.entries(EV_CODE).map(([k, v]) => [v, k]));
  async function makeLiveCode(secret, tab, ts, ev) {
    ts = ts || nowS();
    const c = ev && EV_CODE[ev];
    return c ? `TT1.D.${tab}.${ts}.${c}.${await hmac16(secret, `D.${tab}.${ts}.${c}`)}`
             : `TT1.D.${tab}.${ts}.${await hmac16(secret, `D.${tab}.${ts}`)}`;
  }

  // ---------- демо-данные ----------
  function seed() {
    const B = [
      { id: 1, name: { uk: 'Бориспіль', ru: 'Борисполь' } },
      { id: 2, name: { uk: 'Харків', ru: 'Харьков' } },
      { id: 3, name: { uk: 'Полтава', ru: 'Полтава' } },
      { id: 4, name: { uk: 'Миколаїв', ru: 'Николаев' } },
      { id: 5, name: { uk: 'Київ, Поділ', ru: 'Киев, Подол' } }
    ];
    const G = [
      { id: 1, branchId: 1, name: { uk: 'Прохідна 1', ru: 'Проходная 1' } },
      { id: 2, branchId: 2, name: { uk: 'Прохідна 1', ru: 'Проходная 1' } },
      { id: 3, branchId: 2, name: { uk: 'Прохідна 2 (склад)', ru: 'Проходная 2 (склад)' } },
      { id: 4, branchId: 3, name: { uk: 'Прохідна 1', ru: 'Проходная 1' } },
      { id: 5, branchId: 4, name: { uk: 'Прохідна 1', ru: 'Проходная 1' } },
      { id: 6, branchId: 5, name: { uk: 'Головний вхід', ru: 'Главный вход' } }
    ];
    const P = {
      mgr: { uk: 'Менеджер з продажу', ru: 'Менеджер по продажам' }, drv: { uk: 'Водій', ru: 'Водитель' },
      wh: { uk: 'Складальник-комплектувальник', ru: 'Сборщик-комплектовщик' }, rep: { uk: 'Торговий представник', ru: 'Торговый представитель' },
      cash: { uk: 'Касир', ru: 'Кассир' }, stk: { uk: 'Комірник', ru: 'Кладовщик' }, acc: { uk: 'Бухгалтер', ru: 'Бухгалтер' }
    };
    const raw = [
      [1043, 'Пуль Олена Вікторівна', 'Пуль Елена Викторовна', 'mgr', 1, 'office'],
      [1044, 'Лопатка Станіслав Іванович', 'Лопатка Станислав Иванович', 'drv', 3, 'driver'],
      [1045, 'Кадиров Акім Діляверович', 'Кадыров Аким Диляверович', 'wh', 2, 'warehouse'],
      [1046, 'Кравець Ростислав Юрійович', 'Кравец Ростислав Юрьевич', 'rep', 2, 'office'],
      [1047, 'Бейгул Олександр Олександрович', 'Бейгул Александр Александрович', 'drv', 4, 'driver'],
      [1048, 'Слюсарев Євген Андрійович', 'Слюсарев Евгений Андреевич', 'rep', 2, 'office'],
      [1049, 'Кирилюк Яна Сергіївна', 'Кирилюк Яна Сергеевна', 'cash', 2, 'office'],
      [1050, 'Федорченко Тетяна Олександрівна', 'Федорченко Татьяна Александровна', 'mgr', 1, 'office'],
      [1051, 'Коваль Олег Петрович', 'Коваль Олег Петрович', 'wh', 2, 'warehouse'],
      [1052, 'Мельник Ірина Василівна', 'Мельник Ирина Васильевна', 'acc', 5, 'office'],
      [1053, 'Шевчук Андрій Миколайович', 'Шевчук Андрей Николаевич', 'stk', 2, 'warehouse'],
      [1054, 'Бондаренко Сергій Іванович', 'Бондаренко Сергей Иванович', 'mgr', 5, 'office'],
      [1055, 'Лисенко Наталія Олегівна', 'Лысенко Наталья Олеговна', 'cash', 1, 'office'],
      [1056, 'Савченко Юлія Андріївна', 'Савченко Юлия Андреевна', 'mgr', 3, 'office'],
      [1057, 'Олійник Марія Степанівна', 'Олийнык Мария Степановна', 'acc', 5, 'office'],
      [1058, 'Ткачук Віктор Олексійович', 'Ткачук Виктор Алексеевич', 'wh', 4, 'warehouse'],
      [1059, 'Гончар Павло Романович', 'Гончар Павел Романович', 'wh', 2, 'warehouse'],
      [1060, 'Кравченко Дмитро Ігорович', 'Кравченко Дмитрий Игоревич', 'drv', 1, 'driver'],
      [1061, 'Петренко Ігор Васильович', 'Петренко Игорь Васильевич', 'stk', 1, 'warehouse'],
      [1062, 'Мороз Анна Сергіївна', 'Мороз Анна Сергеевна', 'mgr', 4, 'office'],
      [1063, 'Руденко Василь Петрович', 'Руденко Василий Петрович', 'wh', 3, 'warehouse'],
      [1064, 'Поліщук Оксана Іванівна', 'Полищук Оксана Ивановна', 'cash', 4, 'office']
    ];
    const pendingInvites = [1043, 1050];
    const noPhone = [1045, 1059];
    const E = raw.map((r, i) => ({
      id: i + 1, tab: String(r[0]), name: { uk: r[1], ru: r[2] }, pos: P[r[3]], branchId: r[4], kind: r[5], active: true,
      secret: pendingInvites.includes(r[0]) || noPhone.includes(r[0]) ? null : b64u(randBytes(32)),
      activatedAt: pendingInvites.includes(r[0]) || noPhone.includes(r[0]) ? null : new Date(Date.now() - 20 * 864e5).toISOString(),
      staticVer: 1
    }));
    const profiles = [
      { id: 1, name: { uk: 'Водії — усі склади', ru: 'Водители — все склады' }, gateIds: [1, 3, 4, 5] },
      { id: 2, name: { uk: 'Торгові — усі філії', ru: 'Торговые — все филиалы' }, gateIds: [1, 2, 3, 4, 5, 6] },
      { id: 3, name: { uk: 'Бухгалтерія — головний офіс', ru: 'Бухгалтерия — главный офис' }, gateIds: [6] }
    ];
    E.forEach(e => {
      e.profileId = e.pos === P.drv ? 1 : e.pos === P.rep ? 2 : e.pos === P.acc ? 3 : null;
      e.homeAccess = true; e.blocked = false; e.exceptions = [];
    });
    E.find(e => e.tab === '1051').exceptions.push({ gateId: 1, mode: 'allow', until: new Date(Date.now() + 14 * 864e5).toISOString(), note: 'відрядження' });
    E.find(e => e.tab === '1053').exceptions.push({ gateId: 3, mode: 'deny', until: null, note: '' });
    const dayAt = (d, h, m) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
    const passes = [
      { id: 1, code: 'G7KX2M', secret: b64u(randBytes(32)), name: 'Іваненко Петро', company: 'ТОВ «Логістик Плюс»', phone: '+380 67 123 45 67', gateIds: [1, 3], from: dayAt(0, 7, 0), to: dayAt(0, 19, 0), maxUses: 0, uses: 0, issuedBy: 'Ольга Ткаченко', createdAt: dayAt(0, 7, 5), revokedAt: null },
      { id: 2, code: 'A4PQ9T', secret: b64u(randBytes(32)), name: 'Сидоренко Марина', company: 'Аудит «Баланс»', phone: '+380 50 765 43 21', gateIds: [6], from: dayAt(0, 8, 0), to: dayAt(2, 18, 0), maxUses: 0, uses: 1, issuedBy: 'Ольга Ткаченко', createdAt: dayAt(-1, 16, 20), revokedAt: null },
      { id: 3, code: 'M2ZR8W', secret: b64u(randBytes(32)), name: 'Ковтун Ігор', company: 'Монтаж стелажів', phone: '', gateIds: [3, 4], from: dayAt(-3, 8, 0), to: dayAt(-2, 18, 0), maxUses: 0, uses: 4, issuedBy: 'Ольга Ткаченко', createdAt: dayAt(-4, 11, 0), revokedAt: null }
    ];
    const gateOf = e => G.find(g => g.branchId === e.branchId && (e.kind !== 'warehouse' || /склад|1/.test(g.name.ru))) || G.find(g => g.branchId === e.branchId);
    const D = G.map((g, i) => ({
      id: i + 1, gateId: g.id, name: 'Tab-' + (101 + i), token: b64u(randBytes(24)), lastSeen: new Date(Date.now() - (g.id === 5 ? 17 * 60e3 : 40e3)).toISOString(),
      queue: g.id === 5 ? 8 : 0, battery: g.id === 5 ? 62 : 80 + (i * 3) % 18, version: '1.0.0'
    }));
    const punches = [];
    const add = (e, ev, t, verdict, extra) => {
      const g = gateOf(e); const d = D.find(x => x.gateId === g.id);
      punches.push(Object.assign({
        id: uuid(), empId: e.id, deviceId: d.id, gateId: g.id, event: ev, verdict, accepted: verdict !== 'INVALID',
        codeKind: verdict === 'STATIC' ? 'S' : 'D', codeTs: Math.floor(t / 1000) - (verdict === 'PWA_SCREEN' ? 300 + Math.floor(Math.random() * 400) : 3),
        codeAge: verdict === 'PWA_SCREEN' ? 300 + Math.floor(Math.random() * 400) : 3, scannedAt: new Date(t).toISOString(), receivedAt: new Date(t + 400).toISOString(),
        offline: false, checked: false
      }, extra || {}));
    };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const now = new Date();
    for (let dBack = 6; dBack >= 0; dBack--) {
      const day = new Date(now); day.setDate(now.getDate() - dBack); day.setHours(0, 0, 0, 0);
      if (day.getDay() === 0) continue;
      const at = (h, m) => day.getTime() + (h * 60 + m) * 60e3;
      E.forEach((e, idx) => {
        if (Math.random() < 0.06) return;
        const vIn = noPhone.includes(+e.tab) ? 'STATIC' : (Math.random() < 0.06 ? 'PWA_SCREEN' : 'PWA_LIVE');
        let tIn = at(8, 0) + rnd(30, 62) * 60e3;
        if (dBack === 0) {
          if (tIn > Date.now() - 2 * 60e3) tIn = Date.now() - rnd(3, 70) * 60e3;
          if (tIn < at(6, 30)) return;
          add(e, 'IN', tIn, vIn);
          if (Date.now() > at(13, 5)) { add(e, 'BREAK_OUT', at(12, rnd(25, 40)), 'PWA_LIVE'); add(e, 'BREAK_IN', at(13, rnd(0, 6)), 'PWA_LIVE'); }
          if (Date.now() > at(18, 20)) add(e, 'OUT', at(18, rnd(0, 15)), noPhone.includes(+e.tab) ? 'STATIC' : 'PWA_LIVE');
          return;
        }
        add(e, 'IN', tIn, vIn);
        if (idx % 3 === 0) { add(e, 'BREAK_OUT', at(12, rnd(25, 40)), 'PWA_LIVE'); add(e, 'BREAK_IN', at(13, rnd(0, 6)), Math.random() < 0.05 ? 'PWA_SCREEN' : 'PWA_LIVE'); }
        add(e, 'OUT', at(18, rnd(0, 15)), noPhone.includes(+e.tab) ? 'STATIC' : 'PWA_LIVE');
      });
    }
    // пара нарушений сегодня
    const t0 = Date.now() - 25 * 60e3;
    const g5 = G.find(g => g.id === 5), dv5 = D.find(d => d.gateId === 5);
    punches.push({ id: uuid(), empId: null, deviceId: dv5.id, gateId: g5.id, event: null, verdict: 'INVALID', accepted: false, codeKind: null, codeTs: null, codeAge: null, scannedAt: new Date(t0).toISOString(), receivedAt: new Date(t0).toISOString(), offline: false, checked: false, raw: 'TT1.D.1099.1795161420.AbCdEf' });
    const bey = E.find(e => e.tab === '1047');
    add(bey, 'IN', Date.now() - 31 * 60e3, 'REPLAY');
    punches.sort((a, b) => a.scannedAt < b.scannedAt ? -1 : 1);
    return {
      v: 2, branches: B, gates: G, employees: E, devices: D, punches, profiles, passes,
      invites: pendingInvites.map(tab => ({ code: 'Z' + tab + 'A', empId: E.find(e => e.tab === String(tab)).id, expiresAt: new Date(Date.now() + 72 * 3600e3).toISOString(), usedAt: null })),
      deviceCodes: [{ code: '482915', gateId: 1, expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(), usedAt: null }],
      tokens: {}, staticKey: b64u(randBytes(32)), adminToken: null
    };
  }

  let db = null;
  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
    if (!db || db.v !== 2) { db = seed(); save(); }
    return db;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  window.addEventListener('storage', e => { if (e.key === KEY) db = null; });
  const fresh = () => { db = null; return load(); };

  const empPublic = (e, s) => e && ({ id: e.id, tab: e.tab, name: e.name, pos: e.pos, kind: e.kind, active: e.active, branchId: e.branchId,
    branch: (s.branches.find(b => b.id === e.branchId) || {}).name, appActive: !!e.secret, activatedAt: e.activatedAt, staticVer: e.staticVer,
    profileId: e.profileId || null, profile: ((s.profiles || []).find(p => p.id === e.profileId) || {}).name || null, blocked: !!e.blocked,
    extra: (e.exceptions || []).filter(x => !x.until || new Date(x.until) > new Date()).length });
  const placeOf = (s, gateId) => { const g = s.gates.find(x => x.id === gateId) || {}; const b = s.branches.find(x => x.id === g.branchId) || {}; return { branch: b.name, gate: g.name, branchId: b.id }; };
  const isToday = iso => new Date(iso).toDateString() === new Date().toDateString();
  const IN_SET = ['IN', 'BREAK_IN', 'DUTY_IN'];

  // Права доступа: свой филиал -> профиль -> личные исключения (с датой окончания) -> блокировка
  function accessMap(s, e) {
    const now = Date.now(), m = {};
    s.gates.forEach(g => { m[g.id] = { allowed: false, src: null, until: null }; });
    if (e.homeAccess !== false) s.gates.filter(g => g.branchId === e.branchId).forEach(g => { m[g.id] = { allowed: true, src: 'home', until: null }; });
    const pr = (s.profiles || []).find(p => p.id === e.profileId);
    if (pr) pr.gateIds.forEach(id => { if (m[id] && !m[id].allowed) m[id] = { allowed: true, src: 'profile', until: null }; });
    (e.exceptions || []).filter(x => !x.until || new Date(x.until) > now).forEach(x => {
      if (m[x.gateId]) m[x.gateId] = { allowed: x.mode === 'allow', src: x.mode === 'allow' ? 'manual' : 'deny', until: x.until || null, note: x.note || '' };
    });
    if (e.blocked) Object.keys(m).forEach(k => { m[k] = { allowed: false, src: 'blocked', until: null }; });
    return m;
  }
  function baseAllowed(s, e, gateId) {
    const g = s.gates.find(x => x.id === gateId); const pr = (s.profiles || []).find(p => p.id === e.profileId);
    return (e.homeAccess !== false && g && g.branchId === e.branchId) || !!(pr && pr.gateIds.includes(gateId));
  }
  const passStatus = p => p.revokedAt ? 'revoked' : new Date(p.to) < new Date() ? 'expired' : new Date(p.from) > new Date() ? 'future' : (p.maxUses && p.uses >= p.maxUses) ? 'used' : 'active';
  const passPublic = (s, p) => ({ id: p.id, code: p.code, name: p.name, company: p.company, phone: p.phone, gateIds: p.gateIds, from: p.from, to: p.to,
    maxUses: p.maxUses, uses: p.uses, issuedBy: p.issuedBy, createdAt: p.createdAt, revokedAt: p.revokedAt, status: passStatus(p),
    places: p.gateIds.map(id => placeOf(s, id)) });

  function nextEvent(s, empId, passId) {
    const last = s.punches.filter(p => (passId ? p.passId === passId : p.empId === empId) && p.accepted && isToday(p.scannedAt)).pop();
    if (!last) return 'IN';
    return { IN: 'OUT', BREAK_IN: 'OUT', DUTY_IN: 'OUT', OUT: 'IN', BREAK_OUT: 'BREAK_IN', DUTY_OUT: 'DUTY_IN' }[last.event] || 'IN';
  }

  async function scanPass(s, d, body, scannedAt, scanS, code, n, sig) {
    const p = s.passes.find(x => x.code === code);
    const deny = (reason, pp) => {
      s.punches.push({ id: body.scan_id, empId: null, passId: pp ? pp.id : null, deviceId: d.id, gateId: d.gateId, event: null, verdict: 'PASS_DENIED', reason, accepted: false, codeKind: 'P', codeTs: +n, codeAge: null, scannedAt, receivedAt: new Date().toISOString(), offline: !!body.offline, checked: false, raw: body.qr });
      save(); return { status: 'rejected', verdict: 'PASS_DENIED', reason, pass: pp ? passPublic(s, pp) : null };
    };
    if (!p || sig !== await hmac16(p.secret, `P.${code}.${n}`)) return deny('invalid');
    const st = passStatus(p);
    const evNext = !body.event || body.event === 'AUTO' ? nextEvent(s, null, p.id) : body.event;
    if (st !== 'active' && !(st === 'used' && evNext !== 'IN')) return deny(st, p);   // по исчерпанному пропуску можно выйти
    if (!p.gateIds.includes(d.gateId)) return deny('gate', p);
    const dup = s.punches.slice().reverse().find(x => x.passId === p.id && x.deviceId === d.id && x.accepted);
    if (dup && scanS - new Date(dup.scannedAt).getTime() / 1000 < C.DUP_WINDOW_SEC) return { status: 'duplicate', verdict: 'DUPLICATE', pass: passPublic(s, p) };
    const age = scanS - (+n);
    const verdict = Math.abs(age) <= C.QR_TTL_SEC ? 'PASS_OK' : 'PASS_SCREEN';
    const event = evNext;
    if (event === 'IN') p.uses++;
    s.punches.push({ id: body.scan_id, empId: null, passId: p.id, deviceId: d.id, gateId: d.gateId, event, verdict, accepted: true, codeKind: 'P', codeTs: +n, codeAge: age, scannedAt, receivedAt: new Date().toISOString(), offline: !!body.offline, checked: false });
    save();
    return { status: 'accepted', verdict, event, code_age_sec: age, pass: passPublic(s, p) };
  }

  // ---------- MOCK: «сервер» в браузере ----------
  const MOCK = {
    async time() { await sleep(60); return { now: new Date().toISOString() }; },

    // PWA сотрудника
    async activate(invite) {
      await sleep(300); const s = fresh();
      const inv = s.invites.find(i => i.code.toUpperCase() === String(invite || '').trim().toUpperCase());
      if (!inv || inv.usedAt || new Date(inv.expiresAt) < new Date()) throw new Error('invite');
      const e = s.employees.find(x => x.id === inv.empId);
      if (!e || !e.active) throw new Error('invite');
      e.secret = b64u(randBytes(32)); e.activatedAt = new Date().toISOString(); inv.usedAt = e.activatedAt;
      Object.keys(s.tokens).forEach(k => { if (s.tokens[k] === e.id) delete s.tokens[k]; });
      const token = b64u(randBytes(24)); s.tokens[token] = e.id; save();
      return { employee: empPublic(e, s), qr_secret: e.secret, api_token: token, server_time: new Date().toISOString() };
    },
    async pendingInvites() { // только для демо-кнопок
      const s = fresh();
      return s.invites.filter(i => !i.usedAt).map(i => ({ code: i.code, employee: empPublic(s.employees.find(e => e.id === i.empId), s) }));
    },
    async me(token) {
      await sleep(120); const s = fresh(); const e = s.employees.find(x => x.id === s.tokens[token]);
      if (!e || !e.active) { const er = new Error('auth'); er.auth = true; throw er; }
      const today = s.punches.filter(p => p.empId === e.id && p.accepted && isToday(p.scannedAt));
      return { employee: empPublic(e, s), today: today.map(p => p.event), last: today.pop() || null };
    },
    async myEvents(token) {
      await sleep(200); const s = fresh(); const id = s.tokens[token];
      if (!id) throw new Error('auth');
      const from = Date.now() - 7 * 864e5;
      return s.punches.filter(p => p.empId === id && new Date(p.scannedAt) > from && p.verdict !== 'INVALID')
        .map(p => Object.assign({}, p, placeOf(s, p.gateId))).reverse();
    },

    // сканер
    async deviceRegister(code) {
      await sleep(300); const s = fresh();
      const dc = s.deviceCodes.find(c => c.code === String(code).trim() && !c.usedAt && new Date(c.expiresAt) > new Date());
      if (!dc) throw new Error('code');
      dc.usedAt = new Date().toISOString();
      let d = s.devices.find(x => x.gateId === dc.gateId);
      const token = b64u(randBytes(24));
      if (d) d.token = token; else { d = { id: s.devices.length + 1, gateId: dc.gateId, name: 'Tab-' + (101 + s.devices.length), token, queue: 0, battery: 100, version: '1.0.0' }; s.devices.push(d); }
      d.lastSeen = new Date().toISOString(); save();
      return Object.assign({ device_token: token, device: d.name }, placeOf(s, dc.gateId));
    },
    async devicePing(token, info) {
      const s = fresh(); const d = s.devices.find(x => x.token === token); if (!d) throw new Error('auth');
      Object.assign(d, { lastSeen: new Date().toISOString(), queue: info.queue || 0, battery: info.battery == null ? d.battery : info.battery, version: info.version || d.version }); save();
      return Object.assign({ ok: true }, placeOf(s, d.gateId));
    },
    async scan(body, token) {
      await sleep(180); const s = fresh();
      const d = s.devices.find(x => x.token === token); if (!d) throw new Error('auth');
      if (s.punches.some(p => p.id === body.scan_id)) return { status: 'duplicate', verdict: 'DUPLICATE' };
      d.lastSeen = new Date().toISOString();
      const scannedAt = body.scanned_at || new Date().toISOString();
      const scanS = Math.floor(new Date(scannedAt).getTime() / 1000);
      const reject = (raw, emp) => {
        s.punches.push({ id: body.scan_id, empId: emp ? emp.id : null, deviceId: d.id, gateId: d.gateId, event: null, verdict: 'INVALID', accepted: false, codeKind: null, codeTs: null, codeAge: null, scannedAt, receivedAt: new Date().toISOString(), offline: !!body.offline, checked: false, raw });
        save(); return { status: 'rejected', verdict: 'INVALID', employee: emp ? empPublic(emp, s) : null };
      };
      let parts = String(body.qr || '').trim().split('.'), qev = null, msg = null;
      if (parts.length === 6 && parts[0] === 'TT1' && parts[1] === 'D') {
        qev = EV_FROM[parts[4]] || 'BAD'; msg = `D.${parts[2]}.${parts[3]}.${parts[4]}`; parts = [parts[0], parts[1], parts[2], parts[3], parts[5]];
      }
      if (parts.length !== 5 || parts[0] !== 'TT1' || qev === 'BAD') return reject(body.qr);
      const [, kind, tab, n, sig] = parts;
      if (kind === 'P') return scanPass(s, d, body, scannedAt, scanS, tab, n, sig);
      const e = s.employees.find(x => x.tab === tab);
      if (!e || !e.active) return reject(body.qr, e);
      let verdict, codeTs = null, age = null;
      if (kind === 'D') {
        if (!e.secret || sig !== await hmac16(e.secret, msg || `D.${tab}.${n}`)) return reject(body.qr, e);
        codeTs = +n; age = scanS - codeTs;
      } else if (kind === 'S') {
        if (+n !== e.staticVer || sig !== await hmac16(s.staticKey, `S.${tab}.${n}`)) return reject(body.qr, e);
      } else return reject(body.qr, e);
      const dup = s.punches.slice().reverse().find(p => p.empId === e.id && p.deviceId === d.id && p.accepted);
      if (dup && scanS - new Date(dup.scannedAt).getTime() / 1000 < C.DUP_WINDOW_SEC)
        return { status: 'duplicate', verdict: 'DUPLICATE', event: dup.event, employee: empPublic(e, s) };
      if (kind === 'D') verdict = s.punches.some(p => p.empId === e.id && p.codeTs === codeTs && p.codeKind === 'D') ? 'REPLAY' : (Math.abs(age) <= C.QR_TTL_SEC ? 'PWA_LIVE' : 'PWA_SCREEN');
      else verdict = 'STATIC';
      const codeVerdict = verdict;
      if (!accessMap(s, e)[d.gateId].allowed) verdict = 'NO_ACCESS';
      const event = qev || (!body.event || body.event === 'AUTO' ? nextEvent(s, e.id) : body.event);
      s.punches.push({ id: body.scan_id, empId: e.id, deviceId: d.id, gateId: d.gateId, event, verdict, codeVerdict, accepted: true, codeKind: kind, codeTs, codeAge: age, scannedAt, receivedAt: new Date().toISOString(), offline: !!body.offline, checked: false });
      save();
      return { status: 'accepted', verdict, code_verdict: codeVerdict, event, code_age_sec: age, employee: empPublic(e, s) };
    },

    // страница временного пропуска (гость)
    async passInfo(code) {
      await sleep(150); const s = fresh(); const p = s.passes.find(x => x.code.toUpperCase() === String(code || '').toUpperCase());
      if (!p) throw new Error('pass');
      return Object.assign(passPublic(s, p), { secret: p.secret, server_time: new Date().toISOString() });
    },

    // админка
    admin: {
      async login(login, password) {
        await sleep(250); const s = fresh(); s.adminToken = b64u(randBytes(16));
        s.adminUser = { id: 1, login: login || 'admin', name: login || 'admin', role: 'admin', lang: 'uk', must_change: false }; save();
        return { success: true, token: s.adminToken, user: s.adminUser };
      },
      async violations() { return { page: { rows: [], total: 0 }, repeat: [] }; },
      async employeesPage(f) {
        let all = await MOCK.admin.employees(f.q || '');
        const st = f.status || 'active';
        all = all.filter(e => (st === 'all' || (st === 'active' ? e.active : !e.active)) && (!f.branchIds || !f.branchIds.length || f.branchIds.includes(e.branchId))
          && (!f.positions || !f.positions.length || f.positions.includes(e.pos.uk)) && (!f.kinds || !f.kinds.length || f.kinds.includes(e.kind))
          && (!f.app || (f.app === 'yes') === !!e.appActive));
        const sz = f.size == null ? 50 : f.size, pg = f.page || 1;
        return { total: all.length, overall: all.length, rows: sz ? all.slice((pg - 1) * sz, pg * sz) : all, _all: all };
      },
      async employeeIds(f) { return (await MOCK.admin.employeesPage(Object.assign({}, f, { size: 0 })))._all.map(e => e.id); },
      async positions() { const c = {}; (await MOCK.admin.employees('')).forEach(e => { c[e.pos.uk] = (c[e.pos.uk] || 0) + 1; }); return Object.keys(c).sort().map(pos => ({ pos, count: c[pos] })); },
      async bulkInvites(target) { const all = (await MOCK.admin.employees('')).filter(e => e.active && !e.appActive && (target.empIds && target.empIds.length ? target.empIds.includes(e.id) : e.branchId === target.branchId));
        const out = []; for (const e of all) { const r = await MOCK.admin.createInvite(e.id); out.push({ empId: e.id, tab: e.tab, name: e.name, pos: e.pos.uk, code: r.code }); } return out; },
      async discipline(empId, month) { return { month, days: [], totals: {} }; },
      async excuse() { return { ok: true }; },
      async schedule(branchId) { return { branchId, tolerance: 5, days: [1, 2, 3, 4, 5, 6, 7].map(dow => ({ dow, isWork: dow <= 5, winFrom: '08:00', winTo: '18:00', workMin: 540, lunchFrom: '11:00', lunchTo: '13:00', lunchMin: 60 })) }; },
      async saveSchedule() { return { ok: true }; },
      async holidays() { return []; },
      async saveHoliday() { return { ok: true }; },
      async me() { const s = fresh(); return { success: true, user: s.adminUser || { id: 1, login: 'admin', name: 'admin', role: 'admin', must_change: false } }; },
      async logout() { const s = fresh(); s.adminToken = null; save(); return { success: true }; },
      async password(oldP, newP) { const s = fresh(); if (s.adminUser) s.adminUser.must_change = false; save(); return { success: true, user: s.adminUser }; },
      async dashboard(branchId) {
        await sleep(150); const s = fresh();
        const emps = s.employees.filter(e => e.active && (!branchId || e.branchId === branchId));
        const ids = new Set(emps.map(e => e.id));
        const today = s.punches.filter(p => isToday(p.scannedAt) && (!branchId || placeOf(s, p.gateId).branchId === branchId));
        const lastBy = {}; today.filter(p => p.accepted).forEach(p => { lastBy[p.empId] = p; });
        const onSite = Object.values(lastBy).filter(p => ids.has(p.empId) && IN_SET.includes(p.event)).length;
        const acc = today.filter(p => p.accepted);
        const cnt = v => today.filter(p => p.verdict === v).length;
        const screenEmps = new Set(today.filter(p => p.verdict === 'PWA_SCREEN').map(p => p.empId)).size;
        const week = s.punches.filter(p => Date.now() - new Date(p.scannedAt) < 7 * 864e5 && p.empId && !['PWA_LIVE'].includes(p.verdict));
        const byEmp = {}; week.forEach(p => { (byEmp[p.empId] = byEmp[p.empId] || { n: 0, kinds: {} }).n++; byEmp[p.empId].kinds[p.verdict] = (byEmp[p.empId].kinds[p.verdict] || 0) + 1; });
        const watch = Object.entries(byEmp).sort((a, b) => b[1].n - a[1].n).slice(0, 4).map(([id, v]) => {
          const e = s.employees.find(x => x.id === +id); const top = Object.entries(v.kinds).sort((a, b) => b[1] - a[1])[0];
          return { employee: empPublic(e, s), count: v.n, verdict: top[0] };
        });
        const devs = s.devices.map(d => Object.assign({}, d, placeOf(s, d.gateId), { online: Date.now() - new Date(d.lastSeen) < 10 * 60e3 }));
        return { total: emps.length, onSite, today: acc.length, liveShare: acc.length ? Math.round(100 * cnt('PWA_LIVE') / acc.length) : 0,
          screen: cnt('PWA_SCREEN'), screenEmps, static: cnt('STATIC'), rejected: cnt('INVALID') + cnt('PASS_DENIED'), replay: cnt('REPLAY'), noAccess: cnt('NO_ACCESS'),
          passesActive: s.passes.filter(p => passStatus(p) === 'active').length,
          guestsOnSite: Object.values(today.filter(p => p.accepted && p.passId).reduce((a, p) => { a[p.passId] = p; return a; }, {})).filter(p => IN_SET.includes(p.event)).length,
          feed: MOCK.admin._rows(s, today.slice().reverse().slice(0, 12)), watch, devices: devs, alertsOpen: s.punches.filter(p => !['PWA_LIVE', 'PASS_OK'].includes(p.verdict) && !p.checked).length };
      },
      _rows(s, list) { return list.map(p => { const ps = p.passId && s.passes.find(x => x.id === p.passId); return Object.assign({}, p, { employee: empPublic(s.employees.find(e => e.id === p.empId), s), guest: ps ? { name: ps.name, company: ps.company, code: ps.code } : null }, placeOf(s, p.gateId)); }); },
      async punches(f) {
        await sleep(150); const s = fresh(); f = f || {};
        const from = f.from ? new Date(f.from + 'T00:00:00') : new Date(Date.now() - 7 * 864e5), to = f.to ? new Date(f.to + 'T23:59:59') : new Date();
        const q = (f.q || '').toLowerCase();
        const list = s.punches.filter(p => {
          const t = new Date(p.scannedAt); if (t < from || t > to) return false;
          if (f.branchId && placeOf(s, p.gateId).branchId !== f.branchId) return false;
          if (f.verdict === 'flag' && ['PWA_LIVE', 'PASS_OK'].includes(p.verdict)) return false;
          if (f.verdict && f.verdict !== 'flag' && p.verdict !== f.verdict) return false;
          if (f.unchecked && p.checked) return false;
          if (q) { const e = s.employees.find(x => x.id === p.empId); const ps = p.passId && s.passes.find(x => x.id === p.passId);
            if (!(e && (e.tab.includes(q) || (e.name.uk + e.name.ru).toLowerCase().includes(q))) && !(ps && (ps.name + ps.company).toLowerCase().includes(q))) return false; }
          return true;
        }).reverse();
        if (f.page) { const sz = f.size || 50; return { total: list.length, rows: MOCK.admin._rows(s, list.slice((f.page - 1) * sz, f.page * sz)) }; }
        return MOCK.admin._rows(s, list);
      },
      async check(id) { const s = fresh(); const p = s.punches.find(x => x.id === id); if (p) p.checked = true; save(); return { ok: true }; },
      async employees(q) {
        await sleep(120); const s = fresh(); q = (q || '').toLowerCase();
        return s.employees.filter(e => !q || e.tab.includes(q) || (e.name.uk + e.name.ru).toLowerCase().includes(q)).map(e => empPublic(e, s));
      },
      async saveEmployee(x) {
        await sleep(200); const s = fresh();
        let e = x.id ? s.employees.find(y => y.id === x.id) : null;
        if (!e) { e = { id: Math.max(0, ...s.employees.map(y => y.id)) + 1, secret: null, activatedAt: null, staticVer: 1 }; s.employees.push(e); }
        if (s.employees.some(y => y.tab === String(x.tab) && y.id !== e.id)) throw new Error('tab');
        Object.assign(e, { tab: String(x.tab), name: x.name, pos: x.pos, branchId: +x.branchId, kind: x.kind, active: !!x.active });
        if (!e.active) { e.secret = null; Object.keys(s.tokens).forEach(k => { if (s.tokens[k] === e.id) delete s.tokens[k]; }); }
        save(); return empPublic(e, s);
      },
      async createInvite(empId) {
        await sleep(150); const s = fresh();
        s.invites.forEach(i => { if (i.empId === empId && !i.usedAt) i.usedAt = 'replaced'; });
        const code = 'Z' + b64u(randBytes(5)).toUpperCase().replace(/[-_]/g, 'X');
        s.invites.push({ code, empId, expiresAt: new Date(Date.now() + 72 * 3600e3).toISOString(), usedAt: null }); save();
        return { code, url: new URL('../employee/index.html?invite=' + code, location.href).href };
      },
      async staticCode(empId, reissue) {
        const s = fresh(); const e = s.employees.find(x => x.id === empId);
        if (reissue) { e.staticVer++; save(); }
        return { qr: `TT1.S.${e.tab}.${e.staticVer}.${await hmac16(s.staticKey, `S.${e.tab}.${e.staticVer}`)}`, version: e.staticVer };
      },
      async branches() { const s = fresh(); return s.branches.map(b => Object.assign({}, b, { gates: s.gates.filter(g => g.branchId === b.id), staff: s.employees.filter(e => e.active && e.branchId === b.id).length })); },
      async saveBranch(name) { const s = fresh(); const b = { id: Math.max(0, ...s.branches.map(x => x.id)) + 1, name }; s.branches.push(b); save(); return b; },
      async saveGate(branchId, name) { const s = fresh(); const g = { id: Math.max(0, ...s.gates.map(x => x.id)) + 1, branchId, name }; s.gates.push(g); save(); return g; },
      async devices() { const s = fresh(); return s.devices.map(d => Object.assign({}, d, placeOf(s, d.gateId), { online: Date.now() - new Date(d.lastSeen) < 10 * 60e3 })); },
      async createDeviceCode(gateId) {
        const s = fresh(); const code = String(100000 + Math.floor(Math.random() * 900000));
        s.deviceCodes.push({ code, gateId, expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(), usedAt: null }); save();
        return Object.assign({ code }, placeOf(s, gateId));
      },
      async report(f) {
        // демо: приход/уход по дням в формате боевого отчета (без расчета нарушений)
        if (f && f.mode === 'rating') return [];
        const all = await MOCK.admin._reportDays(f), size = f && f.size || 0, page = f && f.page || 1;
        return { total: all.length, rows: size ? all.slice((page - 1) * size, page * size) : all };
      },
      async _reportDays(f) {
        const rows = await MOCK.admin.punches(Object.assign({}, f, { verdict: '' }));
        const by = {}, hm = x => new Date(x).toTimeString().slice(0, 5);
        rows.filter(r => r.accepted && r.employee).forEach(r => {
          const day = r.scannedAt.slice(0, 10); const k = r.employee.id + '|' + day;
          const o = by[k] = by[k] || { empId: r.employee.id, employee: r.employee, day, isWork: true, arrival: null, leave: null, violations: 0 };
          if (r.event === 'IN' && !o.arrival) o.arrival = hm(r.scannedAt);
          if (r.event === 'OUT') o.leave = hm(r.scannedAt);
        });
        return Object.values(by).sort((a, b) => a.day < b.day ? 1 : a.day > b.day ? -1 : a.employee.tab.localeCompare(b.employee.tab));
      },
      async reset() { localStorage.removeItem(KEY); db = null; load(); return { ok: true }; },

      // ----- доступы -----
      async access(empId) {
        await sleep(100); const s = fresh(); const e = s.employees.find(x => x.id === empId); const m = accessMap(s, e);
        return { employee: empPublic(e, s), homeAccess: e.homeAccess !== false, blocked: !!e.blocked, profileId: e.profileId || null,
          branches: s.branches.map(b => ({ id: b.id, name: b.name, gates: s.gates.filter(g => g.branchId === b.id).map(g => Object.assign({ gateId: g.id, name: g.name }, m[g.id])) })) };
      },
      async setAccess(empIds, gateIds, allow, until, note) {
        await sleep(150); const s = fresh();
        empIds.forEach(id => {
          const e = s.employees.find(x => x.id === id); e.exceptions = (e.exceptions || []).filter(x => !gateIds.includes(x.gateId));
          gateIds.forEach(g => { if (baseAllowed(s, e, g) !== allow || until) e.exceptions.push({ gateId: g, mode: allow ? 'allow' : 'deny', until: until || null, note: note || '' }); });
        });
        save(); return { ok: true };
      },
      async resetAccess(empId, gateId) { const s = fresh(); const e = s.employees.find(x => x.id === empId); e.exceptions = (e.exceptions || []).filter(x => x.gateId !== gateId); save(); return { ok: true }; },
      async setProfile(empIds, profileId) { const s = fresh(); empIds.forEach(id => { s.employees.find(x => x.id === id).profileId = profileId || null; }); save(); return { ok: true }; },
      async setHome(empId, on) { const s = fresh(); s.employees.find(x => x.id === empId).homeAccess = !!on; save(); return { ok: true }; },
      async setBlocked(empIds, on) { const s = fresh(); empIds.forEach(id => { s.employees.find(x => x.id === id).blocked = !!on; }); save(); return { ok: true }; },
      async profiles() { const s = fresh(); return s.profiles.map(p => Object.assign({}, p, { staff: s.employees.filter(e => e.active && e.profileId === p.id).length, places: p.gateIds.map(id => placeOf(s, id)) })); },
      async saveProfile(p) {
        const s = fresh(); let x = p.id && s.profiles.find(y => y.id === p.id);
        if (!x) { x = { id: Math.max(0, ...s.profiles.map(y => y.id)) + 1 }; s.profiles.push(x); }
        Object.assign(x, { name: p.name, gateIds: p.gateIds }); save(); return x;
      },
      async gateAccess(gateId) {
        await sleep(100); const s = fresh();
        return s.employees.filter(e => e.active).map(e => Object.assign({ employee: empPublic(e, s) }, accessMap(s, e)[gateId])).filter(r => r.allowed || r.src === 'deny' || r.src === 'blocked');
      },
      async passes() { await sleep(100); const s = fresh(); return s.passes.slice().reverse().map(p => passPublic(s, p)); },
      async createPass(x) {
        await sleep(200); const s = fresh(); const code = b64u(randBytes(5)).toUpperCase().replace(/[-_]/g, 'X').slice(0, 6);
        const p = { id: Math.max(0, ...s.passes.map(y => y.id)) + 1, code, secret: b64u(randBytes(32)), name: x.name, company: x.company || '', phone: x.phone || '',
          gateIds: x.gateIds, from: x.from, to: x.to, maxUses: x.maxUses || 0, uses: 0, issuedBy: x.issuedBy || 'admin', createdAt: new Date().toISOString(), revokedAt: null };
        s.passes.push(p); save();
        return Object.assign(passPublic(s, p), { url: new URL('../pass/index.html?p=' + code, location.href).href });
      },
      async revokePass(id) { const s = fresh(); const p = s.passes.find(x => x.id === id); p.revokedAt = new Date().toISOString(); save(); return { ok: true }; },
      passUrl(code) { return new URL('../pass/index.html?p=' + code, location.href).href; },
      // для демо-панели сканера: собрать код любого сотрудника
      async demoCode(kind, tab) {
        const s = fresh(); const e = (tab && s.employees.find(x => x.tab === tab)) || s.employees.find(x => x.secret && x.active);
        if (kind === 'pass' || kind === 'passbad') {
          const p = kind === 'pass' ? s.passes.find(x => passStatus(x) === 'active' && x.gateIds.length) : s.passes.find(x => passStatus(x) === 'expired');
          if (!p) return 'TT1.P.NONE.0.x';
          return makePassCode(p.secret, p.code, nowS());
        }
        if (kind === 'fake') return `TT1.D.${e.tab}.${nowS()}.00000000000000000000000000000000`;
        if (kind === 'static') return (await MOCK.admin.staticCode(e.id)).qr;
        if (!e.secret) return `TT1.D.${e.tab}.${nowS()}.x`;
        return makeLiveCode(e.secret, e.tab, kind === 'screen' ? nowS() - 300 : nowS());
      },
      async demoEmployees() { const s = fresh(); return s.employees.filter(e => e.active).map(e => empPublic(e, s)); }
    }
  };

  // ---------- REAL: те же функции через вебхуки n8n ----------
  // Ответ n8n всегда {success, ...}; при ошибке — {success:false, error} и HTTP-код.
  // Ошибка: err.message = текст от сервера, err.status = HTTP-код, err.auth = true при 401.
  async function call(path, body, token, method) {
    let r, j = null;
    try {
      r = await fetch(C.API_BASE + path, {
        method: method || 'POST',
        headers: Object.assign(method === 'GET' ? {} : { 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
        body: method === 'GET' ? undefined : JSON.stringify(body || {})
      });
    } catch (e) { const er = new Error('net'); er.net = true; throw er; }
    try { j = await r.json(); } catch (e) {}
    if (r.status === 401) { const er = new Error((j && j.error) || 'auth'); er.status = 401; er.auth = true; throw er; }
    if (!r.ok || !j || j.success === false) { const er = new Error((j && j.error) || ('HTTP ' + r.status)); er.status = r.status; throw er; }
    return j;
  }
  const adminToken = () => { try { return localStorage.getItem('za-admin-token'); } catch (e) { return null; } };
  const data = r => (r && 'data' in r ? r.data : r);
  const rel = path => new URL(path, location.href).href;
  const A = (action, extra) => call('/admin/api', Object.assign({ action }, extra || {}), adminToken()).then(data);
  const REAL = {
    time: () => call('/time', null, null, 'GET'),
    activate: invite => call('/app', { action: 'activate', invite }).then(data),
    // установка по плакату филиала: без confirm — «это вы?», с confirm — телефон ждет подтверждения охранником
    claim: (b, tab, confirm) => call('/app', { action: 'claim', b, tab, confirm: !!confirm }).then(data),
    unclaim: t => call('/app', { action: 'unclaim' }, t).then(data),
    pendingInvites: async () => [],
    me: t => call('/app', { action: 'me' }, t).then(data),
    myEvents: t => call('/app', { action: 'events' }, t).then(data),
    deviceRegister: code => call('/scanner', { action: 'register', code }).then(data),
    devicePing: (t, info) => call('/scanner', Object.assign({ action: 'ping' }, info), t).then(data),
    scan: (body, t) => call('/scanner', Object.assign({ action: 'scan' }, body), t).then(data),
    passInfo: code => call('/pass?code=' + encodeURIComponent(code || ''), null, null, 'GET').then(data),
    admin: {
      login: (login, password) => call('/admin/login', { login, password }),
      me: () => call('/admin/me', null, adminToken(), 'GET'),
      logout: () => call('/admin/logout', {}, adminToken()),
      password: (old_password, new_password) => call('/admin/password', { old_password, new_password }, adminToken()),
      dashboard: branchId => A('dashboard', { branchId }),
      punches: f => A('punches', { f: f || {} }),
      check: id => A('check', { id }),
      employees: q => A('employees', { q: q || '' }),
      employeesPage: f => A('employees', { f }),
      employeeIds: f => A('employees', { f: Object.assign({}, f, { mode: 'ids' }) }),
      positions: () => A('positions'),
      bulkInvites: target => A('bulk_invites', target),
      posters: branchId => A('posters', { branchId: branchId || null }).then(list => list.map(x => Object.assign(x, { url: rel('../employee/index.html?b=' + x.key) }))),
      saveEmployee: x => A('save_employee', { x }),
      createInvite: empId => A('create_invite', { empId }).then(r => ({ code: r.code, url: rel('../employee/index.html?invite=' + r.code) })),
      staticCode: (empId, reissue) => A('static_code', { empId, reissue: !!reissue }),
      branches: () => A('branches'),
      saveBranch: name => A('save_branch', { name }),
      saveGate: (branchId, name) => A('save_gate', { branchId, name }),
      devices: () => A('devices'),
      createDeviceCode: gateId => A('device_code', { gateId }),
      report: f => A('report', { f: f || {} }),
      violations: f => A('violations', { f: f || {} }),
      discipline: (empId, month) => A('discipline', { empId, month }),
      excuse: (empId, day, reason, note) => A('excuse', { empId, day, reason: reason || '', note: note || '' }),
      schedule: branchId => A('schedule', { branchId }),
      saveSchedule: (branchId, tolerance, days) => A('save_schedule', { branchId, tolerance, days }),
      holidays: () => A('holidays'),
      saveHoliday: (day, name, remove) => A('save_holiday', { day, name: name || '', remove: !!remove }),
      reset: async () => ({ ok: true }),
      access: empId => A('access', { empId }),
      setAccess: (empIds, gateIds, allow, until, note) => A('set_access', { empIds, gateIds, allow: !!allow, until: until || null, note: note || '' }),
      resetAccess: (empId, gateId) => A('reset_access', { empId, gateId }),
      setProfile: (empIds, profileId) => A('set_profile', { empIds, profileId: profileId || null }),
      setHome: (empId, on) => A('set_home', { empId, on: !!on }),
      setBlocked: (empIds, on) => A('set_blocked', { empIds, on: !!on }),
      profiles: () => A('profiles'),
      saveProfile: p => A('save_profile', { p }),
      gateAccess: gateId => A('gate_access', { gateId }),
      passes: () => A('passes'),
      createPass: x => A('create_pass', { x }).then(p => Object.assign(p, { url: rel('../pass/index.html?p=' + p.code) })),
      revokePass: id => A('revoke_pass', { id }),
      passUrl: code => rel('../pass/index.html?p=' + code),
      demoCode: async () => '', demoEmployees: async () => []
    }
  };

  // Гибрид: MOCK, но перечисленные в LIVE функции уже ходят в n8n
  const API = Object.assign({}, C.MOCK ? MOCK : REAL);
  API.admin = Object.assign({}, API.admin);
  if (C.MOCK) (C.LIVE || []).forEach(name => {
    const [a, b] = name.split('.');
    if (b) { if (REAL.admin[b]) API.admin[b] = REAL.admin[b]; } else if (REAL[a]) API[a] = REAL[a];
  });
  const live = name => !C.MOCK || (C.LIVE || []).includes(name);
  window.API = Object.assign(API, { mock: !!C.MOCK, live, makeLiveCode, makePassCode, uuid, hmac16, IN_SET });
})();
