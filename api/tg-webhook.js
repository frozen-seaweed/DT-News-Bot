import { answerCallbackQuery } from './common/telegram.js';
import { kv } from './common/kv.js';

export default async function handler(req, res) {
  try {
    const body = await req.json();

    // 일반 텍스트 메시지 (/mode ...)
    if (body?.message?.text) {
      const text = body.message.text.trim();
      if (text === '/mode learn') { await kv.set('mode', 'learn'); }
      if (text === '/mode prod') { await kv.set('mode', 'prod'); }
      return res.status(200).json({ ok: true });
    }

    // 버튼 콜백 처리
    if (body?.callback_query) {
      console.log('👉 CALLBACK QUERY RAW:', body.callback_query);

      const { id, data, message } = body.callback_query;
      const [type, category, articleId] = (data || '').split('|');
      if (!type || !category || !articleId) return res.status(200).json({ ok: true });

      if (type === 'like') {
        const raw = await kv.get('likes:recent');
        const arr = raw ? JSON.parse(raw) : [];

        const title = message?.text?.split('\n')?.[0]
          ?.replace(/\[#[^\]]+\]\s*\d+\.\s*/, '') || '';

        arr.push({ title, category, ts: Date.now() });

        // 30일 내 것만 유지
        const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
        const arr2 = arr.filter(x => x.ts >= cutoff);

        await kv.set('likes:recent', JSON.stringify(arr2));
        console.log('👍 LIKE STORED:', arr2.length);

        const result = await answerCallbackQuery(id, '기록되었습니다.');
        console.log('📩 answerCallbackQuery result:', result);
      } else if (type === 'dislike') {
        await kv.incrby('dislike:count', 1);
        console.log('👎 DISLIKE STORED');
        const result = await answerCallbackQuery(id, '관심 없음 처리되었습니다.');
        console.log('📩 answerCallbackQuery result:', result);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('❌ tg-webhook error:', e);
    return res.status(200).json({ ok: true });
  }
}
