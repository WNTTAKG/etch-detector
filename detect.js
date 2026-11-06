// Pure detection on a Document.
// Returns { product, confidence, evidence[], version, addons[] }.
// product: "EtchWP" | "Etch Studio" | "Bricks" | null
// version: Etch or Bricks version string or null. Etch normally enqueues its assets with a
//   file-timestamp ?ver= (e.g. 1762245147), so a real version is rarely exposed.
// addons: labels such as "Automatic.css 4.0.2", "Frames".
function detectEtch(doc) {
  const base = detectEtchProduct(doc);
  const version =
    base.product === 'EtchWP' ? etchVersion(doc) : base.product === 'Bricks' ? bricksVersion(doc) : null;
  return { ...base, version, addons: etchAddons(doc) };
}

function etchAssetUrls(doc) {
  return [...doc.querySelectorAll('link[href], script[src], img[src]')]
    .map((el) => el.getAttribute('href') || el.getAttribute('src') || '');
}

function etchQueryParam(url, name) {
  const m = url.replace(/&#0?38;|&amp;/gi, '&').match(new RegExp(`[?&]${name}=([^&#]*)`, 'i'));
  return m ? decodeURIComponent(m[1]) : null;
}

// Dotted release numbers only: rejects timestamps (1762245147) and hashes (17wd14q).
const ETCH_SEMVER = /^\d+\.\d+(\.\d+){0,2}([-.+]?[0-9a-z.-]*)?$/i;

function etchWpCoreVersion(doc, urls) {
  const gen = [...doc.querySelectorAll('meta[name="generator" i]')]
    .map((m) => (m.getAttribute('content') || '').match(/^WordPress\s+(\S+)/i))
    .find(Boolean);
  if (gen) return gen[1];
  for (const u of urls) {
    if (!/\/wp-includes\//i.test(u)) continue;
    const v = etchQueryParam(u, 'ver');
    if (v && ETCH_SEMVER.test(v)) return v;
  }
  return null;
}

function etchVersion(doc) {
  const urls = etchAssetUrls(doc);
  const core = etchWpCoreVersion(doc, urls);
  for (const u of urls) {
    if (!/\/wp-content\/plugins\/etch\//i.test(u)) continue;
    const v = etchQueryParam(u, 'ver');
    if (v && ETCH_SEMVER.test(v) && v !== core) return v;
  }
  return null;
}

// Bricks ships its own Google marker lib with ?v=<Bricks version>; core assets use timestamps.
function bricksVersion(doc) {
  for (const u of etchAssetUrls(doc)) {
    if (!/\/wp-content\/themes\/bricks\//i.test(u)) continue;
    for (const name of ['v', 'ver']) {
      const v = etchQueryParam(u, name);
      if (v && ETCH_SEMVER.test(v)) return v;
    }
  }
  // The marker lib URL is often only inside inline script config (escaped slashes).
  const html = doc.documentElement ? doc.documentElement.innerHTML : '';
  const m = html.match(/themes\\?\/bricks\\?\/[^"'\s]*bricks-google-marker[^"'\s]*?[?&]v=(\d+\.\d+(?:\.\d+)*)/i);
  return m ? m[1] : null;
}

function bricksEvidence(doc, urls) {
  const ev = [];
  const asset = urls.find((u) => /\/wp-content\/themes\/bricks\//i.test(u));
  if (asset) ev.push(`Bricks theme asset: ${asset}`);
  const body = doc.body ? doc.body.classList : null;
  if (body && body.contains('wp-theme-bricks')) ev.push('body class "wp-theme-bricks"');
  if (body && body.contains('bricks-is-frontend')) ev.push('body class "bricks-is-frontend"');
  const els = doc.querySelectorAll('[class*="brxe-"]').length;
  if (els) ev.push(`${els} Bricks elements (brxe-*)`);
  return ev;
}

function etchAddons(doc) {
  const urls = etchAssetUrls(doc);
  const has = (re) => urls.some((u) => re.test(u));
  const addons = [];

  // Automatic.css: plugin assets, generated files in uploads/automatic-css/,
  // WP handles "automaticcss-*", or acss-framework/acss-tokens in Studio exports.
  const acss =
    has(/\/wp-content\/plugins\/automaticcss-plugin\//i) ||
    has(/\/wp-content\/uploads\/automatic-css\//i) ||
    has(/(^|\/)acss-(framework|tokens)[^/]*\.css/i) ||
    !!doc.querySelector('link[id^="automaticcss-"], style[id^="automaticcss-"]');
  if (acss) {
    // ACSS writes "/* File: automatic.css - Version: 4.0.2 - ... */" into its CSS.
    let ver = null;
    for (const st of doc.querySelectorAll('style[id^="automaticcss-"]')) {
      const m = (st.textContent || '').slice(0, 300).match(/Version:\s*(\d+\.\d+(?:\.\d+)*)/i);
      if (m) { ver = m[1]; break; }
    }
    if (!ver) {
      const core = etchWpCoreVersion(doc, urls);
      for (const u of urls) {
        if (!/\/wp-content\/(plugins\/automaticcss-plugin|uploads\/automatic-css)\//i.test(u)) continue;
        const v = etchQueryParam(u, 'ver');
        if (v && ETCH_SEMVER.test(v) && v !== core) { ver = v; break; }
      }
    }
    addons.push(ver ? `Automatic.css ${ver}` : 'Automatic.css');
  }

  // Frames (Digital Gravy, Bricks only): plugin assets under frames-plugin/. Its ?ver= is a timestamp.
  if (has(/\/wp-content\/plugins\/frames-plugin\//i)) addons.push('Frames');

  return addons;
}

function detectEtchProduct(doc) {
  const urls = [...doc.querySelectorAll('link[href], script[src], img[src]')]
    .map((el) => el.getAttribute('href') || el.getAttribute('src') || '');
  const has = (re) => urls.find((u) => re.test(u));

  const wp = [];
  const studio = [];
  const generic = [];

  // EtchWP: the WordPress plugin and its companion block theme.
  const plugin = has(/\/wp-content\/plugins\/etch\//i);
  if (plugin) wp.push(`Etch plugin asset: ${plugin}`);
  const theme = has(/\/wp-content\/themes\/etch-theme\//i);
  if (theme) wp.push(`Etch theme asset: ${theme}`);
  if (doc.body && doc.body.classList.contains('wp-theme-etch-theme')) {
    wp.push('body class "wp-theme-etch-theme"');
  }

  // Etch Studio: static export with generator meta and root-relative Etch CSS.
  const gen = doc.querySelector('meta[name="generator" i]');
  const genContent = gen ? gen.getAttribute('content') || '' : '';
  if (/^etch\b/i.test(genContent.trim())) studio.push(`<meta name="generator" content="${genContent}">`);
  const studioCss = urls.find(
    (u) => /(^|\/)css\/etch-(reset|block-styles)\.css/i.test(u) && !/\/wp-content\//i.test(u)
  );
  if (studioCss) studio.push(`Etch Studio stylesheet: ${studioCss}`);

  // Shared Etch markup.
  const elements = doc.querySelectorAll('[data-etch-element]').length;
  if (elements) generic.push(`${elements} elements with data-etch-element`);
  if (doc.querySelector('.etch-nav, [data-etch-nav]')) generic.push('Etch nav component');

  // WordPress signs, used to split the generic markers.
  const isWp =
    !!doc.querySelector('link[rel="https://api.w.org/"]') ||
    !!has(/\/wp-(content|includes)\//i);

  if (wp.length) return { product: 'EtchWP', confidence: 'high', evidence: [...wp, ...generic] };
  if (studio.length && !isWp) return { product: 'Etch Studio', confidence: 'high', evidence: [...studio, ...generic] };
  if (generic.length) {
    return isWp
      ? { product: 'EtchWP', confidence: 'medium', evidence: [...generic, 'WordPress detected'] }
      : { product: 'Etch Studio', confidence: 'medium', evidence: [...generic, 'no WordPress detected'] };
  }
  if (studio.length) return { product: 'EtchWP', confidence: 'low', evidence: [...studio, 'WordPress detected'] };
  const bricks = bricksEvidence(doc, urls);
  if (bricks.length) {
    const strong = bricks.some((e) => !e.includes('brxe-'));
    return { product: 'Bricks', confidence: strong ? 'high' : 'medium', evidence: bricks };
  }
  return { product: null, confidence: null, evidence: [] };
}
