// api/main-digest.js — min-per-category(2) + error notify
import {
  fetchGoogleNewsRSS,
  fetchNaverNewsAPI,
  fetchDailycarRSS,
  fetchGlobalAutonewsHTML,
  fetchCustomNewsAPI,
} from './common/adapters.js';
import { classifyCategory } from './common/classify.js';
import {
  passesBlacklist,
  withinFreshWindow,
  notDuplicated7d,
} from './common/filters.js';
import {
  rankArticles,
  buildPrefVectorFromLikes,
} from './common/ranking.js';
import { summarizeOneLine } from './common/summarizer.js';
import { sendMessage } from './common/telegram.js';
import { formatDateKST } from './common/utils.js';
import { kv } from './common/kv.js';

const CHAT_ID = process.env.CHAT_ID_MAIN;
const REPORT_ID = process.env.CHAT_ID_REPORT; // 에러 알림용

async function collectCandidates() {
  const arr = [];

  // Google News
  const gKoMob = await fetchGoogleNewsRSS({
    query: '(현대차 OR 기아 OR 자동차 OR 자율주행 OR 전기차 OR 완성차) -연예 -프로야구',
    lang: 'ko', region: 'KR',
  });
  const gEnMob = await fetchGoogleNewsRSS({
    query: '(EV OR autonomous OR mobility OR robotaxi OR charging) (Tesla OR BYD OR Hyundai OR Kia OR GM OR Waymo)',
    lang: 'en', region: 'US',
  });
  const gAI = await fetchGoogleNewsRSS({
    query: '(AI OR LLM OR robotics OR Web3 OR blockchain OR DePIN OR semiconductor)',
    lang: 'en', region: 'US',
  });
  arr.push(...gKoMob, ...gEnMob, ...gAI);

  // Naver(있으면)
  arr.push(...(await fetchNaverNewsAPI({ query: '자동차 OR 자율주행 OR 전기차 OR 완성차' })));

  // 지정 소스
  arr.push(...(await fetchDailycarRSS()));
  arr.push(...(await fetchGlobalAutonewsHTML()));
  arr.push(...(await fetchCustomNewsAPI()));

  return arr;
}

function groupByCategory(items) {
  const groups = { '국내 모빌리티': [], '글로벌 모빌리티': [], 'AI/Web3': [] };
  for (const it of items) {
    const cat = classifyCategory(it);
    if (groups[cat]) groups[cat].push(it);
  }
  return groups;
}

async function loadPrefMap() {
  const raw = await kv.get('likes:recent');
  const likes = raw ? JSON.parse(raw) : [];
  return buildPrefVectorFromLikes(likes);
}

// 주어진 hours 리스트를 순차 적용해 "카테고리별 최소개수"를 보장하는 풀 구성
function poolsWithMin(itemsAll, targets, hoursList = [24, 36, 48, 72]) {
  let lastGroups = groupByCategory(itemsAll.filter(it => withinFreshWindow(it, hoursList.at(-1))));
  for (const h of hoursList) {
    const groups = groupByCategory(itemsAll.filter(it => withinFreshWindow(it, h)));
    const ok =
      (groups['국내 모빌리티']?.length || 0) >= (targets.ko || 0) &&
      (groups['글로벌 모빌리티']?.length || 0) >= (targets.en || 0) &&
      (groups['AI/Web3']?.length || 0) >= (targets.ai || 0);
    lastGroups = groups;
    if (ok) return groups;
  }
  return lastGroups; // 부족하면 마지막(가장 넓은 창) 반환
}

function headerLine() {
  return `${formatDateKST()} | DT AI News Bot`;
}
function buildSection(title, items) {
  const lines = [`[${title}]`];
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.title}`);
    lines.push(summarizeOneLine(it));
  });
  return lines.join('\n');
}

export default async function handler(req, res) {
  try {
    // 1) 수집
    let items = await collectCandidates();

    // 2) 블랙리스트
    items = items.filter(passesBlacklist);

    // 3) 중복 제거(7일)
    const deduped = [];
    for (const it of items) {
      if (it.title && it.url && (await notDuplicated7d(it))) deduped.push(it);
    }

    // 4) 창 확장 로직으로 카테고리별 최소개수 보장(2,2,2)
    const pools = poolsWithMin(deduped, { ko: 2, en: 2, ai: 2 });

    // 5) 랭킹
    const prefMap = await loadPrefMap();
    const scoreBySource = (_s) => 1;
    const pick2 = (list) => rankArticles(list, { prefMap, sourceScore: scoreBySource }).slice(0, 2);

    const ko2 = pick2(pools['국내 모빌리티'] || []);
    const en2 = pick2(pools['글로벌 모빌리티'] || []);
    const ai2 = pick2(pools['AI/Web3'] || []);

    // 6) 메시지
    const blocks = [headerLine()];
    if (ko2.length) blocks.push(buildSection('국내 모빌리티', ko2));
    if (en2.length) blocks.push(buildSection('글로벌 모빌리티', en2));
    if (ai2.length) blocks.push(buildSection('AI·Web3 신기술', ai2));
    const text = blocks.join('\n\n');

    await sendMessage(CHAT_ID, text, { disablePreview: true });
    await kv.incrby('expo:count', 1);

    res.status(200).json({ ok: true, sent: true, counts: { ko: ko2.length, en: en2.length, ai: ai2.length } });
  } catch (e) {
    // 실패 알림
    try {
      await sendMessage(REPORT_ID || CHAT_ID, `❗️main-digest failed: ${String(e?.message || e)}`, { disablePreview: true });
    } catch {}
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
