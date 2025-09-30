import { answerCallbackQuery } from './common/telegram.js';
import { kv } from './common/kv.js';

export default async function handler(req, res) {
  try {
    const body = await req.json();

    if (body?.message?.text) {
      const text = body.message.text.trim();
      if (text === '/mode learn') { await kv.set('mode', 'learn'); }
      if (text === '/mode prod') { await kv.set('mode', 'prod'); }
      return res.status(200).json({ ok: true });
    }

    if (body?.callback_query) {
      const { id, data, message } = body.callback_query;
      const [type, category, articleId] = (data || '').split('|');
      if (!type || !category || !articleId) return res.status(200).json({ ok: true });

      if (type === 'like') {
        const raw = await kv.get('likes:recent');
        const arr = raw ? JSON.parse(raw) : [];

        const title = message?.text?.split('\n')?.[0]
          ?.replace(/\[#[^\]]+\]\s*\d+\.\s*/, '') || '';

        arr.push({ title, category, ts: Date.now() });

        // 30일 내 것만 남기기
        const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
        const arr2 = arr.filter(x => x.ts >= cutoff);

        await kv.set('likes:recent', JSON.stringify(arr2));

        console.log('👍 LIKE STORED:', arr2.length, arr2.at(-1));  // ✅ 로그 추가
        await answerCallbackQuery(id, '기록되었습니다.');
      } else if (type === 'dislike') {
        await kv.incrby('dislike:count', 1);
        await answerCallbackQuery(id, '관심 없음 처리되었습니다.');
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch
