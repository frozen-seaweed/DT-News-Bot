// api/main-digest.js
import {
  fetchGoogleNewsRSS,
  fetchNaverNewsAPI,
  fetchDailycarRSS,
  fetchGlobalAutonewsHTML,
  fetchCustomNewsAPI,
} from './common/adapters.js';
import { classifyCategory } from './common/classify.js';
import { passesBlacklist, withinFreshWindow, notDuplicated7d } from './common/filters.js';
import { rankArticles, buildPrefVectorFromLikes } from './common/ranking.js';
import { sendMessage } from './common/telegram.js';
import { formatDateKST, shortenUrl } from './common/utils.js';
import { kv } from './common/kv.js';

const CHAT_ID = process.env.CHAT_ID_MAIN;
const REPORT_ID = process.env.CHAT_ID_REPORT;

async function collect() {
  const arr = [];

  // Google: 국내 모빌리티(ko), 글로벌(en), 신기술(ko)
  arr.push(...await fetchGoogleNewsRSS({
    query: '(현대차 OR 기아 OR 자동차 OR 자율주행 OR 전기차 OR 완성차) -연예 -프로야구',
    lang: 'ko', region: 'KR'
  }));
  arr.push(...await fetchGoogleNewsRSS({
    query: '(EV OR autonomous OR mobility OR robotaxi OR charging) (Tesla OR BYD OR Hyundai OR Kia OR GM OR Waymo)',
    lang: 'en', region: 'US'
  }));
  arr.push(...await fetchGoogleNewsRSS({
    query: '(인공지능 OR AI OR 생성형 OR 로봇 OR 로보틱스 OR 웹3 OR 블록체인 OR 반도체 OR 칩)',
    lang: 'ko', region: 'KR'
  }));

  // NAVER: 국내 모빌리티 + 신기술(국문)
  arr.push(...await fetchNaverNewsAPI({ query: '자동차 OR 자율주행 OR 전기차 OR 완성차' }));
  arr.push(...await fetchNaverNewsAPI({ query: '인공지능 OR AI OR 로봇 OR 로보틱스 OR 웹3 OR 블록체인 OR 반도체 OR 칩' }));

  // 고정 소스
  arr.push(...await fetchDailycarRSS());
  arr.push(...await fetchGlobalAutonewsHTML());
  arr.push(...await fetchCustomNewsAPI());

  return arr;
}

function group(items) {
  const g = { '국내 모빌리티': [], '글로벌 모빌리티': [], 'AI/Web3': [] };
  for (const it of items) g[classifyCategory(it)].push(it);
  return g;
}

async function prefs() {
  const raw = await kv.get('likes:recent');
  const likes = raw ? JSON.parse(raw) : [];
  return buildPrefVectorFromLikes(likes);
}

function poolsWithMin(itemsAll, targets, hoursList = [24, 36, 48, 72]) {
  let last = group(itemsAll.filter((x) => withinFreshWindow(x, hoursList.at(-1))));
  for (const h of hoursList) {
    const g = group(itemsAll.filter((x) => withinFreshWindow(x, h)));
    const ok =
      (g['국내 모빌리티'].length >= (targets.ko || 0)) &&
      (g['글로벌 모빌리티'].length >= (targets.en || 0)) &&
      (g['AI/Web3'].length >= (targets.ai || 0));
    last = g;
    if (ok) return g;
  }
  return last;
}

// ✅ 포맷 수정 + 숏링크 적용
function header() {
  return `[DT News | ${formatDateKST()}]`;
}

async function section(title, arr) {
  const lines = [`\n[${title}]`];
  for (const it of arr) {
    const shortUrl = await shortenUrl(it.url);
    lines.push(`■ ${it.title}`);
    lines.push(shortUrl);
  }
  return lines.join('\n');
}

export default async function handler(req, res) {
  try {
    let items = await collect();
    items = items.filter(passesBlacklist);

    // 7일 중복 제거
    const uniq = [];
    const seen = new Set();
    for (const it of items) {
      const key = it.url;
      if (it.title && it.url && !seen.has(key) && await notDuplicated7d(it)) {
        seen.add(key);
        uniq.push(it);
      }
    }

    const pools = poolsWithMin(uniq, { ko: 2, en: 2, ai: 2 });
    const pref = await prefs();
    const score = (_s) => 1;
    const pick2 = (l) => rankArticles(l, { prefMap: pref, sourceScore: score }).slice(0, 2);

    const ko2 = pick2(pools['국내 모빌리티']);
    const en2 = pick2(pools['글로벌 모빌리티']);
    const ai2 = pick2(pools['AI/Web3']); // 이미 한국어만 들어옴

    const blocks = [header()];
    if (ko2.length) blocks.push(await section('국내', ko2));
    if (en2.length) blocks.push(await section('글로벌', en2));
    if (ai2.length) blocks.push(await section('AI 신기술', ai2));
    const text = blocks.join('\n\n');

    await sendMessage(CHAT_ID, text, { disablePreview: true });
    await kv.incrby('expo:count', 1);

    res.status(200).json({ ok: true, sent: true, counts: { ko: ko2.length, en: en2.length, ai: ai2.length } });
  } catch (e) {
    try { await sendMessage(REPORT_ID || CHAT_ID, `❗️main-digest failed: ${String(e?.message || e)}`); } catch {}
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
