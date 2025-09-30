export const KST_OFFSET = 9 * 60 * 60 * 1000;

export function nowKST() {
  const now = new Date();
  return new Date(now.getTime() + KST_OFFSET);
}

export function formatDateKST(d = nowKST()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

export function isKoreanText(s = '') {
  return /[가-힣]/.test(s);
}

export function isEnglishText(s = '') {
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  return letters > Math.max(10, s.length * 0.4);
}

export function normalizeUrl(u = '') {
  try {
    const url = new URL(u);
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid']
      .forEach(k => url.searchParams.delete(k));
    return url.toString();
  } catch {
    return u;
  }
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function clampWords(str = '', maxWords = 18) {
  const words = str.split(/\s+/);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ') + '…';
}

export function clampBytesUTF8(str = '', maxBytes = 220) {
  const enc = new TextEncoder();
  let out = '';
  for (const ch of str) {
    const next = out + ch;
    if (enc.encode(next).length > maxBytes) return out + '…';
    out = next;
  }
  return out;
}

export function sha1(str) {
  const buf = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-1', buf).then(arr =>
    Array.from(new Uint8Array(arr)).map(b=>b.toString(16).padStart(2,'0')).join('')
  );
}

// ✅ TinyURL API 기반 숏링크
export async function shortenUrl(url) {
  try {
    const api = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
    const r = await fetch(api);
    if (!r.ok) return url;
    const short = await r.text();
    return short.startsWith('http') ? short : url;
  } catch {
    return url;
  }
}
