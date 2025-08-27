import { answerCallbackQuery } from './common/telegram.js';
import { kv } from './common/kv.js';


const API_KEY = process.env.API_KEY;


export default async function handler(req, res) {
try {
// 텔레그램 Webhook은 인증 헤더가 없으므로 API_KEY 검사 없음
const body = await req.json();


if (body?.message?.text) {
const text = body.message.text.trim();
if (text === '/mode learn') { await kv.set('mode', 'learn'); }
if (text === '/mode prod') { await kv.set('mode', 'prod'); }
return res.status(200).json({ ok:true });
}


if (body?.callback_query) {
const { id, data, message, from } = body.callback_query;
const [type, category, articleId] = (data||'').split('|');
if (!type || !category || !articleId) return res.status(200).json({ ok:true });


if (type === 'like') {
// 최근 30일 좋아요 누적(간단 저장)
const raw = await kv.get('likes:recent');
const arr = raw ? JSON.parse(raw) : [];
arr.push({ title: message?.text?.split('\n')?.[0]?.replace(/\[#[^\]]+\]\s*\d+\.\s*/,'')||'', category, ts: Date.now() });
// 30일 경과 제거
const cutoff = Date.now() - 30*24*3600*1000;
const arr2 = arr.filter(x => x.ts >= cutoff);
await kv.set('likes:recent', JSON.stringify(arr2));
await answerCallbackQuery(id, '기록되었습니다.');
} else if (type === 'dislike') {
await kv.incrby('dislike:count', 1);
await kv.incrby('expo:count', 0); // 노출은 main-digest에서 카운트
await answerCallbackQuery(id, '관심 없음 처리되었습니다.');
}
return res.status(200).json({ ok:true });
}


return res.status(200).json({ ok:true });
} catch (e) { return res.status(200).json({ ok:true }); }
}
