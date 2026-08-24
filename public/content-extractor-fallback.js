// Fallback for tabs that were already open when the extension was installed or
// updated. The regular content script provides richer Defuddle/Turndown output;
// this stable, dependency-free script makes the retry path work in production.
if (!globalThis.__twinMarksFallbackExtractorInstalled) {
  globalThis.__twinMarksFallbackExtractorInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'EXTRACT_PAGE_CONTENT') return undefined;

    const metaDescription =
      document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      '';

    sendResponse({
      title: document.title,
      url: window.location.href,
      text: document.body?.innerText || '',
      h1: document.querySelector('h1')?.innerText || '',
      metaDescription,
    });

    return undefined;
  });
}
