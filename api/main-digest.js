import { fetchGoogleNewsRSS, fetchNaverNewsAPI, fetchDailycarRSS, fetchGlobalAutonewsHTML, fetchCustomNewsAPI } from './common/adapters.js';
}


function buildSection(title, items) {
const lines = [`[${title}]`];
items.forEach((it, i) => {
lines.push(`${i+1}. ${it.title}`);
lines.push(summarizeOneLine(it));
});
return lines.join('\n');
}


export default async function handler(req, res) {
try {
if (req.headers['x-api-key'] && req.headers['x-api-key'] !== API_KEY) {
return res.status(403).json({ error:'forbidden' });
}


let items = await collectCandidates();
// 필터: 금칙어, 최신 24h(부족 시 36→48), 7일 중복
items = items.filter(passesBlacklist);


let filtered = items.filter(it => withinFreshWindow(it, 24));
if (filtered.length < 30) filtered = items.filter(it => withinFreshWindow(it, 36));
if (filtered.length < 30) filtered = items.filter(it => withinFreshWindow(it, 48));


const deduped = [];
for (const it of filtered) {
if (it.title && it.url && await notDuplicated7d(it)) deduped.push(it);
}


const groups = groupByCategory(deduped);


// 랭킹 + 2개 선발
const prefMap = await loadPrefMap();
const sourceScore = (_src) => 1; // 초기 동일


const pick = (list) => rankArticles(list, { prefMap, sourceScore }).slice(0, 2);


const ko2 = pick(groups['국내 모빌리티']);
const en2 = pick(groups['글로벌 모빌리티']);
const ai2 = pick(groups['AI/Web3']);


// 메시지 구성
const blocks = [ headerLine() ];
if (ko2.length) blocks.push(buildSection('국내 모빌리티', ko2));
if (en2.length) blocks.push(buildSection('글로벌 모빌리티', en2));
if (ai2.length) blocks.push(buildSection('AI·Web3 신기술', ai2));


const text = blocks.join('\n\n');


// 전송
await sendMessage(CHAT_ID, text, { disablePreview: true });


// 노출 카운트(정확도 계산용)
await kv.incrby('expo:count', 1);


return res.status(200).json({ ok:true, sent:true, counts:{ ko:ko2.length, en:en2.length, ai:ai2.length } });
} catch (e) {
return res.status(500).json({ error: String(e?.message||e) });
}
}
