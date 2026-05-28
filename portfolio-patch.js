/**
 * Portfolio Tracker — Patch v3
 *
 * Fixes applied:
 *   1. INVESTED stat = sum(qty × avgBuy) for all positions + sum of manual ETF values
 *   2. ETF section replaced with a multi-entry table (name + value) — fully editable
 *   3. VALUE column header click → sort positions high→low, click again → low→high
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO DEPLOY:
 *   1. Copy this file (portfolio-patch.js) into the same folder as your index.html
 *   2. Open index.html and add this line just before the closing </body> tag:
 *
 *        <script src="portfolio-patch.js"></script>
 *
 *   3. Commit & redeploy to Vercel — changes are permanent from then on.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── Storage keys ─────────────────────────────────────────────────────────
   * ETF list is saved in a SEPARATE key so the original save() never wipes it.
   * ptv4.etfCash is kept in sync for the allocation pie chart.
   */
  const MAIN_KEY = 'ptv4';
  const ETF_KEY  = 'ptv4-etfs';

  /* ── Helpers ──────────────────────────────────────────────────────────────*/
  function getMain()      { return JSON.parse(localStorage.getItem(MAIN_KEY) || '{}'); }
  function setMain(d)     { localStorage.setItem(MAIN_KEY, JSON.stringify(d)); }
  function fmtMoney(n)    { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function escHtml(s)     { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── ETF list storage ─────────────────────────────────────────────────────*/
  window._getEtfList = function () {
    const saved = localStorage.getItem(ETF_KEY);
    if (saved) return JSON.parse(saved);
    // First run: migrate legacy single-number etfCash
    const legacy = Number(getMain().etfCash) || 0;
    const etfs   = legacy > 0 ? [{ name: 'ETF', value: legacy }] : [];
    localStorage.setItem(ETF_KEY, JSON.stringify(etfs));
    return etfs;
  };

  window._saveEtfList = function (etfs) {
    localStorage.setItem(ETF_KEY, JSON.stringify(etfs));
    // Keep ptv4.etfCash in sync so the allocation pie still works
    const d = getMain();
    d.etfCash = etfs.reduce((s, e) => s + Number(e.value || 0), 0);
    setMain(d);
  };

  function getEtfTotal () {
    return window._getEtfList().reduce((s, e) => s + Number(e.value || 0), 0);
  }

  /* ── Fix 1: MutationObserver on h-cost — works even if rSummary is a const ─
   * The original script may declare rSummary with const/let, which means
   * overriding window.rSummary has no effect on internal calls.
   * Instead we watch the DOM node directly: whenever the page updates it,
   * we immediately correct the value to include the ETF total.
   */
  function recalcInvested () {
    const d      = getMain();
    const posInv = (d.positions || []).reduce((s, p) => s + (Number(p.qty)||0) * (Number(p.buy)||0), 0);
    const el     = document.getElementById('h-cost');
    if (el) el.textContent = fmtMoney(posInv + getEtfTotal());
  }

  function watchInvestedStat () {
    const el = document.getElementById('h-cost');
    if (!el) return;
    let guard = false;
    const obs = new MutationObserver(function () {
      if (guard) return;
      guard = true;
      requestAnimationFrame(function () { recalcInvested(); guard = false; });
    });
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    recalcInvested(); // run immediately on init
  }

  // Also attempt window.rSummary override as a secondary hook
  if (typeof window.rSummary === 'function') {
    const _orig = window.rSummary;
    window.rSummary = function () { _orig.apply(this, arguments); recalcInvested(); };
  }

  /* ── Fix 3: Override rPos — reattach VALUE sort after each table render ───*/
  let _sortDir = null; // null | 'desc' | 'asc'

  const _origRPos = window.rPos;
  window.rPos = function () {
    _origRPos.apply(this, arguments);
    attachSortHeader();
    if (_sortDir) applySortToDOM(_sortDir);
  };

  function attachSortHeader () {
    const mainGrid = document.getElementById('main-grid');
    if (!mainGrid) return;
    const th = Array.from(mainGrid.querySelectorAll('th'))
      .find(t => t.textContent.trim() === 'Value' && !t.dataset.patchSort);
    if (!th) return;
    th.dataset.patchSort = '1';
    th.style.cursor      = 'pointer';
    th.style.userSelect  = 'none';
    th.title             = 'Click to sort by value';
    th.innerHTML = 'Value <span id="val-sort-icon" style="color:#64748b;font-size:0.75em;">⇅</span>';
    th.addEventListener('click', function () {
      _sortDir = _sortDir === 'desc' ? 'asc' : 'desc';
      const icon = document.getElementById('val-sort-icon');
      if (icon) icon.textContent = _sortDir === 'desc' ? '▼' : '▲';
      applySortToDOM(_sortDir);
    });
  }

  function applySortToDOM (dir) {
    const tbody = document.getElementById('pbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      const val = row => {
        const cell = row.querySelectorAll('td')[5]; // VALUE is the 6th column
        return cell ? (parseFloat(cell.textContent.replace(/[$,\s]/g, '')) || 0) : 0;
      };
      return dir === 'desc' ? val(b) - val(a) : val(a) - val(b);
    });
    rows.forEach(r => tbody.appendChild(r));
  }

  /* ── Fix 2: ETF multi-entry section ──────────────────────────────────────*/

  window._renderEtfTable = function () {
    const wrap = document.getElementById('etf-patch-wrap');
    if (!wrap) return;
    const etfs  = window._getEtfList();
    const total = etfs.reduce((s, e) => s + Number(e.value || 0), 0);

    const rowsHtml = etfs.map((e, i) => `
      <tr>
        <td style="padding:3px 6px;">
          <input value="${escHtml(e.name)}"
            onchange="window._etfUpdate(${i},'name',this.value)"
            style="background:#1e293b;border:1px solid #334155;border-radius:4px;
                   color:#e2e8f0;padding:2px 6px;width:200px;font-size:0.84em;"/>
        </td>
        <td style="padding:3px 6px;text-align:right;">
          <input type="number" step="0.01" value="${e.value}"
            onchange="window._etfUpdate(${i},'value',this.value)"
            style="background:#1e293b;border:1px solid #334155;border-radius:4px;
                   color:#6ee7b7;padding:2px 6px;width:105px;text-align:right;font-size:0.84em;"/>
        </td>
        <td style="padding:3px 6px;">
          <button onclick="window._etfRemove(${i})"
            style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1em;line-height:1;">✕</button>
        </td>
      </tr>`).join('');

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="color:#6ee7b7;font-weight:600;">🟩 ETF Funds:</span>
        <span style="color:#94a3b8;font-size:0.85em;">${fmtMoney(total)}</span>
      </div>
      ${etfs.length ? `
      <table style="border-collapse:collapse;margin-top:4px;">
        <thead><tr>
          <th style="text-align:left;padding:2px 6px;color:#64748b;font-size:0.75em;font-weight:500;">ETF Name</th>
          <th style="text-align:right;padding:2px 6px;color:#64748b;font-size:0.75em;font-weight:500;">Value ($)</th>
          <th></th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>` : ''}
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px;">
        <input id="etf-new-name" placeholder="Name (e.g. VWCE)"
          style="background:#1e293b;border:1px solid #334155;border-radius:6px;
                 color:#e2e8f0;padding:3px 8px;width:200px;font-size:0.82em;"
          onkeydown="if(event.key==='Enter')document.getElementById('etf-new-val')?.focus()"/>
        <input id="etf-new-val" type="number" step="0.01" placeholder="Value ($)"
          style="background:#1e293b;border:1px solid #334155;border-radius:6px;
                 color:#6ee7b7;padding:3px 8px;width:110px;font-size:0.82em;"
          onkeydown="if(event.key==='Enter')window._etfAdd()"/>
        <button onclick="window._etfAdd()"
          style="background:#1e3a2f;border:1px solid #22c55e;color:#22c55e;
                 padding:3px 12px;border-radius:6px;cursor:pointer;font-size:0.82em;">
          + Add ETF
        </button>
      </div>`;
  };

  /* ETF CRUD — called from inline onclick in the rendered table */
  window._etfSyncAndRefresh = function (etfs) {
    window._saveEtfList(etfs);
    // Update the ETFs summary tile
    const tile = document.getElementById('s-etf');
    if (tile) {
      const v = tile.querySelector('.hstv');
      if (v) v.textContent = fmtMoney(etfs.reduce((s, e) => s + Number(e.value || 0), 0));
    }
    window._renderEtfTable();
    recalcInvested(); // refresh INVESTED stat directly
    if (typeof rPie === 'function') rPie(); // refresh allocation pie
  };

  window._etfAdd = function () {
    const nEl = document.getElementById('etf-new-name');
    const vEl = document.getElementById('etf-new-val');
    if (!nEl || !nEl.value.trim()) { nEl && nEl.focus(); return; }
    const etfs = window._getEtfList();
    etfs.push({ name: nEl.value.trim(), value: parseFloat(vEl.value) || 0 });
    nEl.value = ''; vEl.value = '';
    window._etfSyncAndRefresh(etfs);
  };

  window._etfRemove = function (i) {
    const etfs = window._getEtfList();
    etfs.splice(i, 1);
    window._etfSyncAndRefresh(etfs);
  };

  window._etfUpdate = function (i, field, val) {
    const etfs = window._getEtfList();
    if (!etfs[i]) return;
    etfs[i][field] = field === 'value' ? (parseFloat(val) || 0) : val;
    window._etfSyncAndRefresh(etfs);
  };

  /* Inject the ETF section wrapper into the cash-bar DOM */
  function injectEtfSection () {
    if (document.getElementById('etf-patch-wrap')) return; // already injected
    const cashBar = document.getElementById('etf-inp')?.closest('.cash-bar');
    if (!cashBar) return;

    // Hide old ETF label (index 3), input (index 4), and hint text (index 5)
    [3, 4, 5].forEach(i => {
      const child = cashBar.children[i];
      if (child) child.style.display = 'none';
    });

    // Append new wrapper at the end of cash-bar
    const wrap = document.createElement('div');
    wrap.id = 'etf-patch-wrap';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;margin-left:8px;';
    cashBar.appendChild(wrap);

    window._renderEtfTable();
  }

  /* ── Bootstrap ────────────────────────────────────────────────────────────*/
  function init () {
    injectEtfSection();
    watchInvestedStat();   // Fix 1: start MutationObserver + run initial recalc
    attachSortHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 700));
  } else {
    setTimeout(init, 700);
  }

})();
