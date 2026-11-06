const BADGE = {
  EtchWP: { text: 'WP', color: '#2271b1' },
  'Etch Studio': { text: 'ST', color: '#7c3aed' },
  Bricks: { text: 'BR', color: '#b8860b' },
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'etch-result' || !sender.tab) return;
  const tabId = sender.tab.id;
  chrome.storage.session.set({ [`tab-${tabId}`]: { ...msg.result, url: msg.url } });
  const b = BADGE[msg.result.product];
  chrome.action.setBadgeText({ tabId, text: b ? b.text : '' });
  if (b) chrome.action.setBadgeBackgroundColor({ tabId, color: b.color });
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`tab-${tabId}`));
