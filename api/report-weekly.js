// api/report-weekly.js — stable + chatId echo for debugging + Naver API quick test
import { kv } from '../common/kv.js';
import { sendMessage } from '../common/telegram.js';
import { formatDateKST } from '../common/utils.js';
import { fetchNaverNewsAPI } from '../common/adapters.js'; // ✅ add

function getApiKeyFromReq(req) {
  // header 우선, 없으면 ?key= 허용(브라우저 테스트용)
  const h = typeof req.headers.get === 'function'
    ? req.headers.get('x-api-key')
    : (req.headers['x-api-key'] || req.headers['X-API-Key']);
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('key');
  return h || q;
}

function getChatId() {
  // REPORT→MAIN→LIKE 순서로 폴백 (무조건 숫자여야 함)
  return process.env.CHAT_ID_REPORT || process.env.CHAT_ID_MAIN || process.env.CHAT_ID_LIKE || '';
}

export default async function handler(req, res) {
  try {
    const apiKey = getApiKeyFromReq(req);
    if (apiKey !== process.env.API_KEY) {
      return res.status(200).json({ ok: false, error: 'forbidden (api key mismatch)' });
    }

    const chatId = getChatId();
    if (!/^-?\d+$/.test(chatId)) {
      return res.status(200).json({ ok: false, error: `invalid CHAT_ID: "${chatId}"` });
    }

    // URL 파싱 (dry, q, naver 토글)
    const url = new URL(req.url, 'http://localhost');
    const dry = url.searchParams.get('dry') === '1';
    const q = url.searchParams.get('q') || '전기차 OR 자율주행';
    const naverToggle = url.searchParams.get('naver') ?? '1'; // 기본 on

    // 집계(없으면 0)
    const exposures = parseInt((await kv.get('expo:count')) || '0', 10);
    const dislikes = parseInt((await kv.get('dislike:count')) || '0', 10);
    const likesArr = JSON.parse((await kv.get('likes:recent')) || '[]');
    const likes = Array.isArray(likesArr) ? likesArr.length : 0;

    const acc = exposures ? ((exposures - dislikes) / exposures) : 0;
    const accPct = Math.round(acc * 1000) / 10; // 소수1자리

    // ✅ Naver API 연결 테스트 (응답에 샘플만 포함, 메시지 전송 없음)
    let naverSample = [];
    if (naverToggle !== '0') {
      try {
        const naver = await fetchNaverNewsAPI({ query: q });
        naverSample = Array.isArray(naver) ? naver.slice(0, 3) : [];
      } catch (e) {
        naverSample = [{ ok: false, error: String(e?.message || e) }];
      }
    }

    const text =
`📊 Weekly Report — ${formatDateKST()}
• Exposures: ${exposures}
• Likes: ${likes}
• Dislikes: ${dislikes}
• Accuracy: ${accPct}%`;

    if (!dry) {
      const tg = await sendMessage(chatId, text, { disablePreview: true });
      return res.status(200).json({
        ok: true,
        sent: true,
        chatId,
        telegram: tg,
        naverQuery: q,
        naverSample
      });
    } else {
      return res.status(200).json({
        ok: true,
        sent: false,
        chatId,
        preview: text,
        naverQuery: q,
        naverSample
      });
    }
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e), chatId: getChatId() });
  }
}
