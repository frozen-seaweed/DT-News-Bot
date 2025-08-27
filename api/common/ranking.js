import { isKoreanText } from './utils.js';


// 간이 키워드 토큰화(공백 및 특수문자 기준)
function tokenize(s='') {
return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length >= 2);
}


export function buildPrefVectorFromLikes(likeEntries=[]) {
// likeEntries: [{title, category}]
const map = new Map();
for (const e of likeEntries) {
const toks = tokenize(e.title);
for (const t of toks) map.set(t, (map.get(t)||0) + 1);
}
return map; // term -> weight
}


function similarityScore(prefMap, title) {
if (!prefMap || prefMap.size === 0) return 0;
const toks = tokenize(title);
let s = 0;
for (const t of toks) if (prefMap.has(t)) s += prefMap.get(t);
// 간단 정규화
return s / Math.sqrt(toks.length + 1);
}


export function rankArticles(items, { prefMap=null, sourceScore=(_=>1) }={}) {
const now = Date.now();
const scored = items.map((it, idx) => {
const relevance = 1; // 분류 기준 충족 가정
const prefSim = similarityScore(prefMap, it.title);
const src = sourceScore(it.source||'') || 1;
const freshness = Math.max(0, 1 - (now - new Date(it.pubDate).getTime())/(48*3600*1000)); // 0~1, 48h 기준
return {
it, idx,
score: 0.35*relevance + 0.25*prefSim + 0.15*src + 0.15*freshness + 0.10*(isKoreanText(it.title)?1:1)
};
});
scored.sort((a,b)=> b.score - a.score || a.idx - b.idx);
return scored.map(s => s.it);
}
