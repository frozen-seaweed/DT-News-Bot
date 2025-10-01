// api/train-digest.js
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
import { kv } from './common/kv.js';
import { sha1, shortenUrl } from './common/utils.js';

const CHAT_ID = process.env.CHAT_ID_LIKE;
const REPORT_ID = process.env.CHAT_ID_REPORT;

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
  // NAVER
  arr.push(...await fetchNaverNewsAPI({ query: '자동차 OR 자율주행 OR 전기차 OR 완성차' }));
  arr.push(...await fetchNaverNewsAPI({ query: '인공지능 OR AI OR 로봇 OR 로보틱스 OR 웹3 OR 블록체인 OR 반도체 OR 칩' }));
  // 기타
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
    last = g; if (ok) return g;
  }
  return last;
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
        seen.add(key); uniq.push(it);
      }
    }

    // ✅ 카테고리별 최소 8개씩 확보
    const pools = poolsWithMin(uniq, { ko: 8, en: 8, ai: 8 });
    const pref = await prefs();
    const score = (_s) => 1;
    const pick8 = (l) => rankArticles(l, { prefMap: pref, sourceScore: score }).slice(0, 8);

    const ko8 = pick8(pools['국내 모빌리티']);
    const en8 = pick8(pools['글로벌 모빌리티']);
    const ai8 = pick8(pools['AI/Web3']);

    // ✅ 안내 문구
    await sendMessage(
      CHAT_ID,
      '👍: 해당 기사로 익일에 메인 뉴스로 발송됩니다.\n👎: 해당 기사는 앞으로 추천하지 않습니다. (완전히 관련 없는 기사에만 눌러주세요.)',
      { disablePreview: true }
    );

    const sendItem = async (cat, it) => {
      const cleanTitle = it.title.split(' - ')[0];
      const shortUrl = await shortenUrl(it.url);
      const body = `[#${cat}] ${cleanTitle}\n${shortUrl}`;

      const compactId = (await sha1(it.url)).slice(0, 16);
      const buttons = [[
        { text: '👍',      callback_data: `like|${cat}|${compactId}` },
        { text: '👎', callback_data: `dislike|${cat}|${compactId}` },
      ]];
      await sendMessage(CHAT_ID, body, { disablePreview: true, buttons });
    };

    for (const [cat, arr] of [
      ['국내 모빌리티', ko8],
      ['글로벌 모빌리티', en8],
      ['AI·Web3 신기술', ai8],
    ]) {
      for (const it of arr) await sendItem(cat, it);
    }

    res.status(200).json({ ok: true, sent: true });
  } catch (e) {
    try { await sendMessage(REPORT_ID || CHAT_ID, `❗️train-digest failed: ${String(e?.message || e)}`); } catch {}
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
