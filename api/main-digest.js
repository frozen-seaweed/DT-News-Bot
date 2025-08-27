// api/main-digest.js — stable version
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

async function collectCandidates() {
  const arr = [];

  // Google News — 카테고리별 대표 쿼리
  const gKoMob = await fetchGoogleNewsRSS({
    query: '(현대차 OR 기아 OR 자동차 OR 자율주행 OR 전기차 OR 완성차) -연예 -프로야구',
    lang: 'ko',
    region: 'KR',
  });
  const gEnMob = await fetchGoogleNewsRSS({
    query:
      '(EV OR autonomous OR mobility OR robotaxi OR charging) (Tesla OR BYD OR Hyundai OR Kia OR GM OR Waymo)',
    lang: 'en',
    region: 'US',
  });
  const gAI = await fetchGoogleNewsRSS({
    query:
      '(AI OR LLM OR robotics OR Web3 OR blockchain OR DePIN OR semiconductor)',
    lang: 'en',
    region: 'US',
  });
  arr.push(...gKoMob, ...gEnMob, ...gAI);

  // Naver Open API(있으면)
  const nKo = await fetchNaverNewsAPI({
    query: '자동차 OR 자율주행 OR 전기차 OR 완성차',
  });
  arr.push(...nKo);

  // Dailycar RSS
  arr.push(...(await fetchDailycarRSS()));

  // Global Autonews HTML
  arr.push(...(await fetchGlobalAutonewsHTML()));

  // Custom(기존 사내 스크래퍼)
  arr.push(...(await fetchCustomNewsAPI()));

  return arr;
}

function groupByCategory(items) {
  const groups = {
    '국내 모빌리티': [],
    '글로벌 모빌리티': [],
    'AI/Web3': [],
  };
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
    let items = await collectCandidates();

    // 금칙어 필터
    items = items.filter(passesBlacklist);

    // 최신성 24h → 부족 시 36h → 48h
    let filtered = items.filter((it) => withinFreshWindow(it, 24));
    if (filtered.length < 30) filtered = items.filter((it) => withinFreshWindow(it, 36));
    if (filtered.length < 30) filtered = items.filter((it) => withinFreshWindow(it, 48));

    // 7일 중복 제거
    const deduped = [];
    for (const it of filtered) {
      if (it.title && it.url && (await notDuplicated7d(it))) {
        deduped.push(it);
      }
    }

    // 분류
    const groups = groupByCategory(deduped);

    // 랭킹 & 선발(카테고리별 2개)
    const prefMap = await loadPrefMap();
    const sourceScore = (_src) => 1; // 초기 동일
    const pick2 = (list) => rankArticles(list, { prefMap, sourceScore }).slice(0, 2);

    const ko2 = pick2(groups['국내 모빌리티']);
    const en2 = pick2(groups['글로벌 모빌리티']);
    const ai2 = pick2(groups['AI/Web3']);

    // 메시지 생성
    const blocks = [headerLine()];
    if (ko2.length) blocks.push(buildSection('국내 모빌리티', ko2));
    if (en2.length) blocks.push(buildSection('글로벌 모빌리티', en2));
    if (ai2.length) blocks.push(buildSection('AI·Web3 신기술', ai2));
    const text = blocks.join('\n\n');

    // 전송
    await sendMessage(CHAT_ID, text, { disablePreview: true });

    // 노출 카운트(정확도 계산용)
    await kv.incrby('expo:count', 1);

    res.status(200).json({
      ok: true,
      sent: true,
      counts: { ko: ko2.length, en: en2.length, ai: ai2.length },
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
