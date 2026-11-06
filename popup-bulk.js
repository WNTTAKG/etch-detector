document.getElementById('bulk-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('bulk.html') });
});
