// Bulk checker: fetch each URL from this extension page, parse, run detectEtch.
// Needs host_permissions so cross-origin fetches are allowed.
(() => {
  const CONCURRENCY = 4;
  const TIMEOUT_MS = 15000;

  const $ = (id) => document.getElementById(id);
  const input = $('input');
  const checkBtn = $('check');
  const exportBtn = $('export');
  const progress = $('progress');
  const list = $('results');

  let rows = [];

  function parseInput(text) {
    const seen = new Set();
    const out = [];
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line) continue;
      if (!/^https?:\/\//i.test(line)) line = 'https://' + line.replace(/^\/+/, '');
      let url;
      try { url = new URL(line).href; } catch { url = line; }
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
    return out;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function withBase(html, finalUrl) {
    const tag = `<base href="${escapeAttr(finalUrl)}">`;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag);
    return tag + html;
  }

  async function checkOne(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        credentials: 'omit',
        redirect: 'follow',
        signal: ctrl.signal,
        cache: 'no-store',
      });
      const html = await res.text();
      const finalUrl = res.url || url;
      const doc = new DOMParser().parseFromString(withBase(html, finalUrl), 'text/html');
      const r = detectEtch(doc) || {};
      return {
        final_url: finalUrl !== url ? finalUrl : '',
        product: r.product || '',
        confidence: r.confidence || '',
        version: r.version || '',
        addons: Array.isArray(r.addons) ? r.addons : [],
        error: res.ok ? '' : `HTTP ${res.status}`,
      };
    } catch (e) {
      const msg = e && e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS / 1000}s` : String((e && e.message) || e);
      return { final_url: '', product: '', confidence: '', version: '', addons: [], error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function render(row) {
    const li = row.li;
    li.replaceChildren();
    li.append(el('div', 'url', row.url));
    if (row.final_url) li.append(el('div', 'final', `→ ${row.final_url}`));
    const meta = el('div', 'meta');
    if (!row.done) {
      meta.append(el('span', 'pending', 'Checking…'));
    } else if (row.product) {
      meta.append(el('span', `prod-${row.product.replace(/\s+/g, '')}`, row.product));
      const bits = [];
      if (row.confidence) bits.push(`confidence: ${row.confidence}`);
      if (row.version) bits.push(`version: ${row.version}`);
      if (row.addons.length) bits.push(`addons: ${row.addons.join(', ')}`);
      if (bits.length) meta.append(document.createTextNode(` · ${bits.join(' · ')}`));
    } else {
      meta.append(el('span', 'none', row.error ? 'No result' : 'Not Etch or Bricks'));
    }
    li.append(meta);
    if (row.error) li.append(el('div', 'error', row.error));
  }

  async function run() {
    const urls = parseInput(input.value);
    if (!urls.length) { progress.textContent = 'Nothing to check.'; return; }
    checkBtn.disabled = true;
    exportBtn.disabled = true;
    list.replaceChildren();
    rows = urls.map((url) => {
      const row = { url, final_url: '', product: '', confidence: '', version: '', addons: [], error: '', checked_at: '', done: false, li: el('li') };
      list.append(row.li);
      render(row);
      return row;
    });
    let done = 0;
    const total = rows.length;
    progress.textContent = `0 / ${total}`;
    let next = 0;
    async function worker() {
      while (next < rows.length) {
        const row = rows[next++];
        Object.assign(row, await checkOne(row.url), { checked_at: new Date().toISOString(), done: true });
        render(row);
        progress.textContent = `${++done} / ${total}`;
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    checkBtn.disabled = false;
    exportBtn.disabled = false;
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    const cols = ['url', 'final_url', 'product', 'confidence', 'version', 'addons', 'error', 'checked_at'];
    const lines = [cols.join(',')];
    for (const r of rows) {
      lines.push(cols.map((c) => csvCell(c === 'addons' ? r.addons.join('; ') : r[c])).join(','));
    }
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.download = `etch-check-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  checkBtn.addEventListener('click', run);
  exportBtn.addEventListener('click', exportCsv);
})();
