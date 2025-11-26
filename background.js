const PATCHMAN_URL = chrome.runtime.getURL('patchman.html');

chrome.action.onClicked.addListener(async () => {
  // Query for existing Patchman tab using URL pattern
  const existingTabs = await chrome.tabs.query({ url: PATCHMAN_URL });

  if (existingTabs.length > 0) {
    // Tab exists, focus it
    const tab = existingTabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    // Create new tab
    await chrome.tabs.create({ url: PATCHMAN_URL });
  }
});
