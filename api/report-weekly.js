import { sendMessage } from './common/telegram.js';
import { nowKST } from './common/utils.js';
import { kv } from './common/kv.js';


const CHAT_ID = process.env.CHAT_ID_REPORT;
const API_KEY = process.env.API_KEY;


function pct(a,b){ return b>0 ? (100*a/b).toFixed(1)+'%' : '0.0%'; }


export default async function handler(req, res) {
try {
if (req.headers['x-api-key'] !== API_KEY) return res.status(403).json({ error:'forbidden' });


const dislikes = parseInt(await kv.get('dislike:count')||'0',10);
const expos = parseInt(await kv.get('expo:count')||'0',10);
const acc = 1 - (expos>0 ? dislikes/expos : 0);


const text = [
`📊 Weekly Report — ${nowKST().toISOString().slice(0,10)}`,
`Exposures: ${expos}`,
`Dislikes: ${dislikes} (무관율 ${pct(dislikes,expos)})`,
`Accuracy(=1-무관율): ${(acc*100).toFixed(1)}%`,
`학습 종료 조건(>=80%): ${acc>=0.8 ? '달성 ✅' : '미달성'}`
].join('\n');


await sendMessage(CHAT_ID, text, { disablePreview:true });


// 자동 전환: 80% 이상이면 모드 prod로 세팅
if (acc >= 0.8) await kv.set('mode','prod');


return res.status(200).json({ ok:true, acc });
} catch (e) { return res.status(500).json({ error:String(e?.message||e) }); }
}
