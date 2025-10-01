// 상단에 추가
import {
  fetchGoogleNewsRSS,
  fetchNaverNewsAPI,
  fetchDailycarRSS,
  fetchGlobalAutonewsHTML,
} from '../common/adapters.js';

const NEED = 4;

const dedup = (arr) => {
  const seen = new Set();
  return arr.filter(it => {
    const k = (it.url || it.title).trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

async function atLeast(fetchers, need = NEED) {
  const bag = [];
  const seen = new Set();
  for (const f of fetchers) {
    const items = await f();
    for (const it of items) {
      const k = it.url || it.title;
      if (!k || seen.has(k)) continue;
      seen.add(k);
      bag.push(it);
      if (bag.length >= need) return bag.slice(0, need);
    }
  }
  return bag.slice(0, need);
}

// 국내 4개 강제
async function getKO4() {
  return atLeast([
    () => fetchNaverNewsAPI({ query: '자동차 OR 전기차 OR 모빌리티', display: 50, sort: 'date' }),
    () => fetchGoogleNewsRSS({ query: '자동차 OR 전기차', lang: 'ko', region: 'KR', limit: 50 }),
    () => fetchDailycarRSS(50),
    () => fetchGlobalAutonewsHTML(50),
  ]);
}

// 글로벌 4개 강제
async function getEN4() {
  const queries = [
    'automotive industry',
    'electric vehicle OR EV',
    'autonomous driving OR ADAS',
    'mobility business',
  ];
  const regions = ['US', 'GB', 'CA', 'AU'];
  const steps = [];
  for (const q of queries) {
    for (const r of regions) {
      steps.push(() => fetchGoogleNewsRSS({ query: q, lang: 'en', region: r, limit: 50 }));
    }
  }
  return atLeast(steps);
}

// AI 4개 강제
async function getAI4() {
  return atLeast([
    () => fetchGoogleNewsRSS({ query: 'autonomous driving AI OR driver assistance AI', lang: 'en', region: 'US', limit: 50 }),
    () => fetchNaverNewsAPI({ query: '자율주행 인공지능 OR ADAS', display: 50, sort: 'date' }),
    () => fetchGoogleNewsRSS({ query: 'robotaxi OR self-driving', lang: 'en', region: 'US', limit: 50 }),
  ]);
}

// 기존 핸들러 내부에서 수집하는 부분을 아래로 교체
const [koNews, enNews, aiNews] = await Promise.all([
  getKO4().then(dedup),
  getEN4().then(dedup),
  getAI4().then(dedup),
]);

// counts, preview 구성 시 koNews/enNews/aiNews 사용
