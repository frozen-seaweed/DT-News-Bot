import { fetchGoogleNewsRSS, fetchNaverNewsAPI, fetchDailycarRSS, fetchGlobalAutonewsHTML, fetchCustomNewsAPI } from './common/adapters.js';
const gAI = await fetchGoogleNewsRSS({ query: '(AI OR LLM OR robotics OR Web3 OR blockchain OR DePIN OR semiconductor)', lang:'en', region:'US' });
arr.push(...gKoMob, ...gEnMob, ...gAI);
arr.push(...await fetchNaverNewsAPI({ query: '자동차 OR 자율주행 OR 전기차 OR 완성차' }));
arr.push(...await fetchDailycarRSS());
arr.push(...await fetchGlobalAutonewsHTML());
arr.push(...await fetchCustomNewsAPI());
return arr;
}


function groupByCategory(items) {
const groups = { '국내 모빌리티':[], '글로벌 모빌리티':[], 'AI/Web3':[] };
for (const it of items) groups[classifyCategory(it)].push(it);
return groups;
}


async function loadPrefMap() {
const raw = await kv.get('likes:recent');
const likes = raw ? JSON.parse(raw) : [];
return buildPrefVectorFromLikes(likes);
}


export default async function handler(req, res) {
try {
if (req.headers['x-api-key'] && req.headers['x-api-key'] !== API_KEY) {
return res.status(403).json({ error:'forbidden' });
}


let items = await collectCandidates();
items = items.filter(passesBlacklist);


let filtered = items.filter(it => withinFreshWindow(it, 24));
if (filtered.length < 30) filtered = items.filter(it => withinFreshWindow(it, 36));
if (filtered.length < 30) filtered = items.filter(it => withinFreshWindow(it, 48));


const deduped = [];
for (const it of filtered) if (it.title && it.url && await notDuplicated7d(it)) deduped.push(it);


const groups = groupByCategory(deduped);


const prefMap = await loadPrefMap();
const sourceScore = (_src) => 1;
const pick = (list) => rankArticles(list, { prefMap, sourceScore }).slice(0, 4);


const ko4 = pick(groups['국내 모빌리티']);
const en4 = pick(groups['글로벌 모빌리티']);
const ai4 = pick(groups['AI/Web3']);


// 섹션별 안내 메시지 + 개별 기사(버튼)
const header = '[국내 모빌리티]\n[글로벌 모빌리티]\n[AI·Web3 신기술]\n— 각 기사에 "좋아요 / 관심 없어요" 버튼을 사용해 주세요.';
await sendMessage(CHAT_ID, header, { disablePreview:true });


const sendItem = async (cat, it, idx) => {
const body = `[#${cat}] ${idx+1}. ${it.title}\n${summarizeOneLine(it)}\n${it.url}`;
const id = encodeURIComponent(it.url);
await sendMessage(CHAT_ID, body, { disablePreview:true, buttons: [
[{ text: '좋아요', callback_data: `like|${cat}|${id}` }, { text: '관심 없어요', callback_data: `dislike|${cat}|${id}` }]
]});
};


for (const [cat, arr] of [['국내 모빌리티', ko4], ['글로벌 모빌리티', en4], ['AI·Web3 신기술', ai4]]) {
for (let i=0;i<arr.length;i++) await sendItem(cat, arr[i], i);
}


return res.status(200).json({ ok:true, sent:true });
} catch (e) { return res.status(500).json({ error:String(e?.message||e) }); }
}
