/* Small fetch wrapper: timeouts, one polite retry, and a browser-ish UA.
   Retailer endpoints are undocumented, so failures are expected and must be
   reported rather than swallowed. */

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export async function request(url, { headers = {}, timeoutMs = 12000, retries = 1, accept = 'application/json' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: {
          'accept': accept,
          'accept-language': 'en-GB,en;q=0.9',
          'user-agent': DEFAULT_UA,
          ...headers,
        },
      });
      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, url, text.slice(0, 400));
      return { text, res };
    } catch (err) {
      lastErr = err;
      // 4xx will not fix itself; only retry transport errors and 5xx.
      if (err instanceof HttpError && err.status < 500) break;
      if (attempt < retries) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Compact one-line form of an error, for messages that already name the URL. */
export function brief(err) {
  if (err instanceof HttpError) {
    const body = (err.body || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return `HTTP ${err.status}${body ? ': ' + body : ''}`;
  }
  return err?.name === 'AbortError' ? 'timed out' : (err?.message || String(err));
}

export async function getJson(url, opts = {}) {
  const { text } = await request(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 200)}`);
  }
}

export async function getText(url, opts = {}) {
  const { text } = await request(url, { accept: 'text/html,application/xhtml+xml', ...opts });
  return text;
}

/** Walk a nested object and return every value at a dotted-ish path guess. */
export function pick(obj, paths, fallback = undefined) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const key of path.split('.')) {
      if (cur && typeof cur === 'object' && key in cur) cur = cur[key];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return fallback;
}

/** Find the first array of objects under any of the given keys. */
export function findArray(obj, keys) {
  for (const k of keys) {
    const v = pick(obj, [k]);
    if (Array.isArray(v)) return v;
  }
  // Last resort: breadth-first search for the biggest array of objects.
  const queue = [obj];
  let best = null;
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object') continue;
    for (const v of Object.values(cur)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        if (!best || v.length > best.length) best = v;
      } else if (v && typeof v === 'object') queue.push(v);
    }
  }
  return best || [];
}
