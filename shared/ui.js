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
      return `<img src="${prefix}shared/logo.png" alt="Зеніт-Авто"><span class="wm">Зеніт-Авто<span>.облік</span></span>`;
    }
  };
  window.UI = UI;
})();
