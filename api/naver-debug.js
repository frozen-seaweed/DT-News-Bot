// api/naver-debug.js — Naver News API quick diag (safe to delete later)
export default async function handler(req, res) {
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const q = urlObj.searchParams.get('q') || '전기차';

    const id = process.env.NAVER_CLIENT_ID;
    const secret = process.env.NAVER_CLIENT_SECRET;
    if (!id || !secret) {
      return res.status(200).json({ ok:false, reason:'no_keys',
        hint:'add NAVER_CLIENT_ID/SECRET in Vercel env and Redeploy' });
    }

    const api = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=5&sort=date`;
    const r = await fetch(api, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }
    });

    const status = r.status;
    const txt = await r.text();
    let j = {}; try { j = JSON.parse(txt); } catch {}
    const items = Array.isArray(j.items) ? j.items : [];
    const titles = items.map(it => (it.title || '').replace(/<[^>]+>/g,'')).slice(0,5);

    return res.status(200).json({ ok:true, status, count: items.length, titles, rawError: j.errorMessage || null });
  } catch (e) {
    return res.status(200).json({ ok:false, error: String(e?.message || e) });
  }
}
