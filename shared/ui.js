// Мелкие общие помощники интерфейса
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let toastTimer = null;
  const UI = {
    esc,
    toast(msg, ms) {
      let el = document.querySelector('.toast');
      if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
      el.textContent = msg; el.classList.remove('hidden');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2600);
    },
    modal(html, onMount) {
      const bg = document.createElement('div'); bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
      document.body.appendChild(bg);
      const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = e => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
      const first = bg.querySelector('input,select,button'); if (first) setTimeout(() => first.focus(), 30);
      if (window.I18N) I18N.apply(bg);
      if (onMount) onMount(bg.querySelector('.modal'), close);
      return { close, el: bg.querySelector('.modal') };
    },
    qrSvg(text, opts) {
      opts = opts || {};
      const q = window.qrcode(0, opts.ecc || 'M'); q.addData(text); q.make();
      return q.createSvgTag({ cellSize: 4, margin: opts.margin == null ? 2 : opts.margin, scalable: true });
    },
    download(name, text, type) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: type || 'text/csv;charset=utf-8' }));
      a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    csv(rows) { return rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\n'); },
    theme: {
      get() { try { return localStorage.getItem('za-theme') || 'light'; } catch (e) { return 'light'; } },
      set(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('za-theme', t); } catch (e) {} },
      init() { document.documentElement.dataset.theme = UI.theme.get(); },
      toggle() { UI.theme.set(UI.theme.get() === 'dark' ? 'light' : 'dark'); }
    },
    async copy(text, okMsg) {
      try { await navigator.clipboard.writeText(text); UI.toast(okMsg || 'OK'); }
      catch (e) { window.prompt('Copy:', text); }
    },
    verdictPill(v) {
      const cls = { PWA_LIVE: 'p-ok', PWA_SCREEN: 'p-wa', STATIC: 'p-wa', REPLAY: 'p-er', INVALID: 'p-er', DUPLICATE: 'p-mu', NO_ACCESS: 'p-er', PASS_OK: 'p-bl', PASS_SCREEN: 'p-wa', PASS_DENIED: 'p-er' }[v] || 'p-mu';
      return `<span class="pill ${cls}">${esc(I18N.t('v_' + v))}</span>`;
    },
    // дерево «филиал → проходные» с галочками; value = массив gateId
    gateTree(branches, selected, name) {
      selected = new Set(selected || []);
      return `<div class="gtree">${branches.map(b => `<fieldset><legend><label class="chk"><input type="checkbox" data-branch="${b.id}" ${b.gates.length && b.gates.every(g => selected.has(g.id)) ? 'checked' : ''}> <b>${esc(I18N.pick(b.name))}</b></label></legend>
        ${b.gates.map(g => `<label class="chk"><input type="checkbox" name="${name || 'g'}" value="${g.id}" data-of="${b.id}" ${selected.has(g.id) ? 'checked' : ''}> ${esc(I18N.pick(g.name))}</label>`).join('')}</fieldset>`).join('')}</div>`;
    },
    bindTree(root) {
      root.querySelectorAll('[data-branch]').forEach(cb => cb.onchange = () => root.querySelectorAll(`[data-of="${cb.dataset.branch}"]`).forEach(x => { x.checked = cb.checked; }));
      root.querySelectorAll('[data-of]').forEach(cb => cb.onchange = () => { const all = [...root.querySelectorAll(`[data-of="${cb.dataset.of}"]`)]; root.querySelector(`[data-branch="${cb.dataset.of}"]`).checked = all.every(x => x.checked); });
      return () => [...root.querySelectorAll('[data-of]:checked')].map(x => +x.value);
    },
    brandHtml(prefix) {
      return `<img src="${prefix}shared/logo.svg" alt="Зеніт-Авто"><span class="wm">Зеніт-Авто<span>.облік</span></span>`;
    }
  };
  // Пагинация: UI.pager(box, total, page, size, onChange(page, size))
  UI.pager = (box, total, page, size, cb) => {
    if (!box) return;
    const pages = Math.max(1, Math.ceil(total / size)); page = Math.min(Math.max(1, page), pages);
    const nums = []; const add = n => nums.push(n);
    [1, page - 2, page - 1, page, page + 1, page + 2, pages].filter((n, i, a) => n >= 1 && n <= pages && a.indexOf(n) === i).sort((a, b) => a - b)
      .forEach((n, i, a) => { if (i && n - a[i - 1] > 1) add('…'); add(n); });
    const from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
    box.innerHTML = total <= 50 && page === 1 && size === 50 ? '' : `<div class="pager">
      <span class="pg-info">${from}–${to} / ${total}</span>
      <div class="pg-nums"><button type="button" class="pg" data-pg="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="prev">←</button>
        ${nums.map(n => n === '…' ? '<span class="pg-gap">…</span>' : `<button type="button" class="pg ${n === page ? 'on' : ''}" data-pg="${n}">${n}</button>`).join('')}
        <button type="button" class="pg" data-pg="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="next">→</button></div>
      <select class="in pg-size" aria-label="size">${[50, 100, 200].map(n => `<option value="${n}" ${n === size ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    box.onclick = e => { const b = e.target.closest('[data-pg]'); if (b && !b.disabled) cb(+b.dataset.pg, size); };
    const sel = box.querySelector('.pg-size'); if (sel) sel.onchange = () => cb(1, +sel.value);
  };
  UI.debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms || 300); }; };
  // Мультивыбор с поиском: UI.multi(box, {label, options:[{v,l,c}], value:[], search, onChange})
  UI.multi = (box, o) => {
    let val = new Set((o.value || []).map(String));
    const btnTxt = () => { const n = val.size; if (!n) return `${o.label}: <span class="mu">${UI.esc(window.I18N ? I18N.t('f_any') : 'all')}</span>`;
      if (n === 1) { const x = o.options.find(z => String(z.v) === [...val][0]); return `${o.label}: <b>${UI.esc(x ? x.l : '')}</b>`; }
      return `${o.label}: <b>${n}</b>`; };
    box.className = 'ms'; box.innerHTML = `<button type="button" class="in ms-b ${val.size ? 'on' : ''}">${btnTxt()}</button><div class="ms-p" hidden>
      ${o.search ? `<input class="in ms-s" placeholder="🔍">` : ''}<div class="ms-l"></div>
      <div class="ms-f"><button type="button" class="lnk ms-c">${window.I18N ? I18N.t('f_reset') : 'reset'}</button></div></div>`;
    const P = box.querySelector('.ms-p'), L = box.querySelector('.ms-l'), B = box.querySelector('.ms-b');
    const list = q => { L.innerHTML = o.options.filter(x => !q || x.l.toLowerCase().includes(q)).map(x => `<label class="ms-i"><input type="checkbox" value="${UI.esc(x.v)}" ${val.has(String(x.v)) ? 'checked' : ''}><span>${UI.esc(x.l)}</span>${x.c != null ? `<small>${x.c}</small>` : ''}</label>`).join('') || '<div class="ms-e">—</div>'; };
    const fire = () => { B.innerHTML = btnTxt(); B.classList.toggle('on', val.size > 0); o.onChange([...val]); };
    list('');
    B.onclick = e => { e.stopPropagation(); document.querySelectorAll('.ms-p').forEach(x => { if (x !== P) x.hidden = true; }); P.hidden = !P.hidden; if (!P.hidden) { const s = P.querySelector('.ms-s'); if (s) { s.value = ''; list(''); s.focus(); } } };
    P.addEventListener('click', e => e.stopPropagation());
    L.addEventListener('change', e => { const c = e.target; c.checked ? val.add(c.value) : val.delete(c.value); fire(); });
    const s = P.querySelector('.ms-s'); if (s) s.oninput = () => list(s.value.trim().toLowerCase());
    P.querySelector('.ms-c').onclick = () => { val.clear(); list(s ? s.value.trim().toLowerCase() : ''); fire(); };
    if (!UI._msDoc) { UI._msDoc = true; document.addEventListener('click', () => document.querySelectorAll('.ms-p').forEach(x => { x.hidden = true; })); }
  };
  window.UI = UI;
})();
