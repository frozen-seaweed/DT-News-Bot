// api/train-digest.js — min-per-category(4) + error notify
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
import { kv } from './common/kv.js';
import { sha1 } from './common/utils.js';

const CHAT_ID = process.env.CHAT_ID_LIKE;
const REPORT_ID = process.env.CHAT_ID_REPORT;

async function collectCandidates() {
  const arr = [];
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
  arr.push(...(await fetchNaverNewsAPI({ query: '자동차 OR 자율주행 OR 전기차 OR 완성차' })));
  arr.push(...(await fetchDailycarRSS()));
  arr.push(...(await fetchGlobalAutonewsHTML()));
  arr.push(...(await fetchCustomNewsAPI()));
  return arr;
}

function groupByCategory(items) {
  const groups = { '국내 모빌리티': [], '글로벌 모빌리티': [], 'AI/Web3': [] };
  for (const it of items) groups[classifyCategory(it)].push(it);
  return groups;
}
async function loadPrefMap() {
  const raw = await kv.get('likes:recent');
  const likes = raw ? JSON.parse(raw) : [];
  return buildPrefVectorFromLikes(likes);
}

// hours 창을 넓혀 카테고리별 최소개수를 맞추는 풀 구성
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
  return lastGroups;
}

export default async function handler(req, res) {
  try {
    // 1) 수집 + 필터
    let items = await collectCandidates();
    items = items.filter(passesBlacklist);

    // 2) 7일 중복 제거
    const deduped = [];
    for (const it of items) if (it.title && it.url && (await notDuplicated7d(it))) deduped.push(it);

    // 3) 창 확장으로 카테고리별 최소 4개 보장
    const pools = poolsWithMin(deduped, { ko: 4, en: 4, ai: 4 });

    // 4) 랭킹 + 버튼 전송
    const prefMap = await loadPrefMap();
    const sourceScore = (_src) => 1;
    const pick4 = (list) => rankArticles(list, { prefMap, sourceScore }).slice(0, 4);

    const ko4 = pick4(pools['국내 모빌리티'] || []);
    const en4 = pick4(pools['글로벌 모빌리티'] || []);
    const ai4 = pick4(pools['AI/Web3'] || []);

    // 안내 헤더
    await sendMessage(
      CHAT_ID,
      '[국내 모빌리티]\n[글로벌 모빌리티]\n[AI·Web3 신기술]\n— 각 기사에 "좋아요 / 관심 없어요" 버튼을 사용해 주세요.',
      { disablePreview: true }
    );

    const sendItem = async (cat, it, idx) => {
      const oneLine = summarizeOneLine(it);
      const body = `[#${cat}] ${idx + 1}. ${it.title}\n${oneLine}\n${it.url}`;
      const compactId = (await sha1(it.url)).slice(0, 16);
      const buttons = [[
        { text: '좋아요',      callback_data: `like|${cat}|${compactId}` },
        { text: '관심 없어요', callback_data: `dislike|${cat}|${compactId}` },
      ]];
      await sendMessage(CHAT_ID, body, { disablePreview: true, buttons });
    };

    for (const [cat, arr] of [
      ['국내 모빌리티', ko4],
      ['글로벌 모빌리티', en4],
      ['AI·Web3 신기술', ai4],
    ]) {
      for (let i = 0; i < arr.length; i++) await sendItem(cat, arr[i], i);
    }

    res.status(200).json({ ok: true, sent: true });
  } catch (e) {
    try {
      await sendMessage(REPORT_ID || CHAT_ID, `❗️train-digest failed: ${String(e?.message || e)}`, { disablePreview: true });
    } catch {}
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
