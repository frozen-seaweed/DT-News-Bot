// api/main-digest.js — 4 articles per category version
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

  // Google News
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

  // Naver
  arr.push(...await fetchNaverNewsAPI({ query: '자동차 OR 자율주행 OR 전기차 OR 완성차' }));
  arr.push(...await fetchNaverNewsAPI({ query: '인공지능 OR AI OR 로봇 OR 로보틱스 OR 웹3 OR 블록체인 OR 반도체 OR 칩' }));

  // RSS / HTML
  arr.push(...await fetchDailycarRSS());
  arr.push(...await fetchGlobalAutonewsHTML());
  arr.push(...await fetchCustomNewsAPI());

  return arr;
}

// ------------------------------
// 카테고리 분류
// ------------------------------
function group(items) {
  const g = { '국내': [], '글로벌': [], 'AI 신기술': [] };
  for (const it of items) {
    const cat = classifyCategory(it);
    if (cat === '국내 모빌리티') g['국내'].push(it);
    else if (cat === '글로벌 모빌리티') g['글로벌'].push(it);
    else g['AI 신기술'].push(it);
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
// 기사 수 확보
// ------------------------------
function poolsWithMin(itemsAll, targets, hoursList = [24, 36, 48, 72]) {
  let last = group(itemsAll.filter((x) => withinFreshWindow(x, hoursList.at(-1))));
  for (const h of hoursList) {
    const g = group(itemsAll.filter((x) => withinFreshWindow(x, h)));
    const ok =
      (g['국내'].length >= (targets.ko || 0)) &&
      (g['글로벌'].length >= (targets.en || 0)) &&
      (g['AI 신기술'].length >= (targets.ai || 0));
    last = g;
    if (ok) return g;
  }
  return last;
}

// ------------------------------
// 포맷 정의
// ------------------------------
function header() {
  return `[DT News | ${formatDateKST()}]`;
}

function section(title, arr) {
  const lines = [`[${title}]`];
  for (const it of arr) {
    const source = it.source || it.site || '';
    lines.push(`■ ${it.title}${source ? ` - ${source}` : ''}`);
    lines.push(it.url);
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

    // 4개 보장
    const pools = poolsWithMin(uniq, { ko: 4, en: 4, ai: 4 });
    const pref = await prefs();
    const score = (_s) => 1;
    const pickTopN = (l, n = 4) => rankArticles(l, { prefMap: pref, sourceScore: score }).slice(0, n);

    const ko4 = pickTopN(pools['국내'], 4);
    const en4 = pickTopN(pools['글로벌'], 4);
    const ai4 = pickTopN(pools['AI 신기술'], 4);

    const blocks = [header()];
    if (ko4.length) blocks.push(section('국내', ko4));
    if (en4.length) blocks.push(section('글로벌', en4));
    if (ai4.length) blocks.push(section('AI 신기술', ai4));

    const text = blocks.join('\n\n');

    await sendMessage(CHAT_ID, text, { disablePreview: true });
    await kv.incrby('expo:count', 1);

    console.log('[main-digest] sent successfully.');
    res.status(200).json({ ok: true, sent: true, counts: { ko: ko4.length, en: en4.length, ai: ai4.length } });

  } catch (e) {
    console.error('[main-digest] failed:', e);
    try {
      await sendMessage(REPORT_ID || CHAT_ID, `❗️main-digest failed: ${String(e?.message || e)}`);
    } catch {}
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
