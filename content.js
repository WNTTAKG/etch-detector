chrome.runtime.sendMessage({ type: 'etch-result', result: detectEtch(document), url: location.href });
