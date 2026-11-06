(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = `tab-${tab.id}`;
  const r = (await chrome.storage.session.get(key))[key];
  const $ = (id) => document.getElementById(id);
  if (!r) { $('product').textContent = 'No result (reload the page)'; return; }
  $('product').textContent = r.product
    ? `Built with ${r.product}${r.version ? ` ${r.version}` : ''}`
    : 'Not Etch or Bricks';
  $('conf').textContent = r.confidence ? `Confidence: ${r.confidence}` : 'No Etch or Bricks markers found.';
  if (r.addons && r.addons.length) {
    const div = document.createElement('div');
    div.id = 'addons';
    div.className = 'conf';
    div.textContent = `Add-ons: ${r.addons.join(', ')}`;
    $('conf').after(div);
  }
  for (const e of r.evidence) {
    const li = document.createElement('li');
    li.textContent = e;
    $('evidence').append(li);
  }
})();
