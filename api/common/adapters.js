import { XMLParser } from 'fast-xml-parser';
export async function fetchDailycarRSS() {
const candidates = [
'https://www.dailycar.co.kr/rss/rss.xml',
'https://dailycar.co.kr/rss/rss.xml',
'https://www.dailycar.co.kr/rss'
];
for (const u of candidates) {
try {
const r = await fetch(u);
if (!r.ok) continue;
const xml = await r.text();
const data = parser.parse(xml);
const items = data?.rss?.channel?.item || [];
if (items.length) {
return items.map(it => ({
title: (it.title||'').trim(),
url: normalizeUrl(it.link||''),
description: (it.description||'').replace(/<[^>]+>/g,'').trim(),
pubDate: it.pubDate ? new Date(it.pubDate) : new Date(),
source: 'Dailycar'
}));
}
} catch {}
}
return [];
}


export async function fetchGlobalAutonewsHTML() {
const url = 'http://www.global-autonews.com/home.php';
const r = await fetch(url);
if (!r.ok) return [];
const html = await r.text();
const $ = cheerio.load(html);
const out = [];
$('a').each((_, el) => {
const href = $(el).attr('href') || '';
const text = $(el).text().trim();
if (!href || !text) return;
const abs = href.startsWith('http') ? href : new URL(href, url).toString();
// 간단 휴리스틱: 기사성 링크 필터
if (/article|content|news|view|report/i.test(abs)) {
out.push({
title: text,
url: normalizeUrl(abs),
description: '',
pubDate: new Date(),
source: 'Global Autonews'
});
}
});
// 상위 30개만
return out.slice(0, 30);
}


export async function fetchCustomNewsAPI() {
const endpoint = process.env.CUSTOM_NEWS_API_URL;
if (!endpoint) return [];
const r = await fetch(endpoint);
if (!r.ok) return [];
const j = await r.json();
// 기대 스키마: [{title, url, pubDate, source, description}]
return (Array.isArray(j) ? j : []).map(x => ({
title: x.title||'',
url: normalizeUrl(x.url||''),
description: x.description||'',
pubDate: x.pubDate ? new Date(x.pubDate) : new Date(),
source: x.source||'Custom'
}));
}
