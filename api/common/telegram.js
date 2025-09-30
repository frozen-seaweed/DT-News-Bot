const BOT = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT}`;

export async function sendMessage(chat_id, text, { disablePreview = true, buttons = null } = {}) {
  const body = { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: disablePreview };
  if (buttons) body.reply_markup = { inline_keyboard: buttons };

  const r = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    console.error('❌ sendMessage error:', err);
    throw new Error(err);
  }
  return r.json();
}

export function likeButtons(articleId, category) {
  return [[
    { text: '좋아요', callback_data: `like|${category}|${articleId}` },
    { text: '관심 없어요', callback_data: `dislike|${category}|${articleId}` }
  ]];
}

export async function answerCallbackQuery(id, text = '') {
  try {
    console.log('👉 answerCallbackQuery sending:', id, text);
    const r = await fetch(`${API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id, text }),
    });
    const result = await r.json().catch(() => null);

    if (!r.ok) {
      console.error('❌ answerCallbackQuery error:', result || (await r.text()));
      return { ok: false, error: result };
    }
    return { ok: true, result };
  } catch (e) {
    console.error('❌ answerCallbackQuery exception:', e);
    return { ok: false, error: String(e) };
  }
}
