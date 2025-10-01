// api/test-naver.js
import { fetchNaverNewsAPI } from './common/adapters.js';

export default async function handler(req, res) {
  try {
    const items = await fetchNaverNewsAPI({ query: '현대차 OR 기아 OR 전기차' });
    res.status(200).json({
      ok: true,
      count: items.length,
      sample: items.slice(0, 5), // 첫 5개만 확인
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
