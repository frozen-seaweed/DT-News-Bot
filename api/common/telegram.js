const BOT = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT}`;


export async function sendMessage(chat_id, text, { disablePreview=true, buttons=null }={}) {
const body = { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: disablePreview };
if (buttons) body.reply_markup = { inline_keyboard: buttons };
const r = await fetch(`${API}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
if (!r.ok) throw new Error(await r.text());
return r.json();
}


export function likeButtons(articleId, category) {
return [[
{ text: '좋아요', callback_data: `like|${category}|${articleId}` },
{ text: '관심 없어요', callback_data: `dislike|${category}|${articleId}` }
]];
}


export async function answerCallbackQuery(id, text='') {
await fetch(`${API}/answerCallbackQuery`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ callback_query_id: id, text })});
}
