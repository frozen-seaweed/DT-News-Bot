// api/main-digest.js — 모든 카테고리 4개씩, is.gd 링크 포함, 부족 시 있는 만큼 발송
import {
  fetchGoogleNewsRSS,
  fetchNaverNewsAPI,
  fetchDailycarRSS,
  fetchGlobalAutonewsHTML,
  fetchCustomNewsAPI,
} from '../common/adapters.js';
import { classifyCategory } from '../common/classify.js';
import { passesBlacklist, withinFreshWindow, notDuplicated7d } from '../common/filters.js';
import { rankArticles, buildPrefVectorFromLikes } from '../common/ranking.js';
import { sendMessage } from '../common/telegram.js';
import { formatDateKST } from '../common/utils.js';
import { kv } from '../common/kv.js';

const CHAT_ID = process.env.CHAT_ID_MAIN;
const REPORT_ID = process.env.CHAT_ID_REPORT;

// ------------------------------
// 뉴스 수집
// ------------------------------
async function collect() {
  const arr = [];

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

  arr.push(...await fetchNaverNewsAPI({ query: '자동차 OR 자율주행 OR 전기차 OR 완성차' }));
  arr.push(...await fetchNaverNewsAPI({ query: '인공지능 OR AI OR 로봇 OR 로보틱스 OR 웹3 OR 블록체인 OR 반도체 OR 칩' }));

  arr.push(...await fetchDailycarRSS());
  arr.push(...await fetchGlobalAutonewsHTML());
  arr.push(...await fetchCustomNewsAPI());

  return arr;
}

// ------------------------------
// 카테고리 그룹화
// ------------------------------
function group(items) {
  const g = { '국내 모빌리티': [], '글로벌 모빌리티': [], 'AI·Web3 신기술': [] };
  for (const it of items) {
    const cat = classifyCategory(it);
    if (cat.includes('국내')) g['국내 모빌리티'].push(it);
    else if (cat.includes('글로벌')) g['글로벌 모빌리티'].push(it);
    else g['AI·Web3 신기술'].push(it);
  }
  return g;
}

// ------------------------------
// 유저 선호도
// ------------------------------
async function prefs() {
  const raw = await kv.get('likes:recent');
  const likes = raw ? JSON.parse(raw) : [];
  return buildPrefVectorFromLikes(likes);
}

// ------------------------------
// is.gd 단축 링크 생성
// ------------------------------
async function shortenUrl(url) {
  if (!url) return '';
  try {
    const api = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
    const short = await fetch(api).then(r => r.text());
    return short.startsWith('http') ? short : url;
  } catch {
    return url;
  }
}

// ------------------------------
// 기사 수 확보 (부족해도 반환)
// ------------------------------
function poolsWithMin(itemsAll, targets, hoursList = [24, 36, 48, 72]) {
  let result = {};
  for (const h of hoursList) {
    const g = group(itemsAll.filter((x) => withinFreshWindow(x, h)));
    if (
      g['국내 모빌리티'].length >= (targets.ko || 0) ||
      g['글로벌 모빌리티'].length >= (targets.en || 0) ||
      g['AI·Web3 신기술'].length >= (targets.ai || 0)
    ) {
      result = g;
      break;
    }
    result = g;
  }
  return result;
}

// ------------------------------
// 포맷 정의
// ------------------------------
function header() {
  return `[DT News | ${formatDateKST()}]`;
}

async function section(title, arr) {
  const lines = [`[${title}]`];
  for (const it of arr) {
    const source = it.source || it.site || '';
    const url = it.url || it.link || '';
    const shortUrl = await shortenUrl(url);
    lines.push(`■ ${it.title}${source ? ` - ${source}` : ''}`);
    if (shortUrl) lines.push(shortUrl);
    lines.push('');
  }
  return lines.join('\n');
}

// ------------------------------
// 메인 실행
// ------------------------------
export default async function handler(req, res) {
  console.log('[main-digest] invoked at', new Date().toISOString());
  try {
    let items = await collect();
    items = items.filter(passesBlacklist);

    // 중복 제거
    const uniq = [];
    const seen = new Set();
    for (const it of items) {
      const key = it.url;
      if (it.title && it.url && !seen.has(key) && await notDuplicated7d(it)) {
        seen.add(key);
        uniq.push(it);
      }
    }

    const pools = poolsWithMin(uniq, { ko: 4, en: 4, ai: 4 });
    const pref = await prefs();
    const score = (_s) => 1;
    const pickTopN = (l, n = 4) => rankArticles(l, { prefMap: pref, sourceScore: score }).slice(0, n);

    const koList = pickTopN(pools['국내 모빌리티'], 4);
    const enList = pickTopN(pools['글로벌 모빌리티'], 4);
    const aiList = pickTopN(pools['AI·Web3 신기술'], 4);

    const blocks = [header()];
    if (koList.length) blocks.push(await section('국내 모빌리티', koList));
    if (enList.length) blocks.push(await section('글로벌 모빌리티', enList));
    if (aiList.length) blocks.push(await section('AI·Web3 신기술', aiList));

    const text = blocks.join('\n\n');

    await sendMessage(CHAT_ID, text, { disablePreview: true });
    await kv.incrby('expo:count', 1);

    console.log('[main-digest] sent successfully.');
    res.status(200).json({ ok: true, sent: true, counts: { ko: koList.length, en: enList.length, ai: aiList.length } });

  } catch (e) {
    console.error('[main-digest] failed:', e);
    try {
      await sendMessage(REPORT_ID || CHAT_ID, `❗️main-digest failed: ${String(e?.message || e)}`);
    } catch {}
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
