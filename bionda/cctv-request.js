// Retry short upstream interruptions only while opening a directory for the first time.
export async function fetchCctvDirectory(url, { signal, onRetry, cache } = {}) {
  const options = { signal, headers: { Accept: 'application/json' }, cache };
  let response = await fetch(url, options);
  const delays = [1500, 4000];
  for (const delay of delays) {
    if (!onRetry || ![502, 503, 504].includes(response.status)) break;
    onRetry();
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, delay);
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
    // Let automatic retries reuse a recovered server cache even after a manual refresh.
    const retryUrl = new URL(url, location.href);
    retryUrl.searchParams.delete('refresh');
    response = await fetch(retryUrl, { ...options, cache: 'no-store' });
  }
  return response;
}
