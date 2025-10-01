// api/common/adapters.js
// 통합 수집 어댑터 — Google News RSS, NAVER OpenAPI, Dailycar, GlobalAutonews

import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripTags = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const toISO = (d) => (d ? new Date(d).toISOString() : null);

function norm(item) {
  // 공통 스키마
  return {
    title: item.title,
    url: item.url,
    source: item.source || '',
    publishedAt: item.publishedAt || null,
    lang: item.lang || 'ko', // 기본 ko
  };
}

/** Google News RSS */
export async function fetchGoogleNewsRSS({ query, lang = 'en', region = 'US', limit = 30 }) {
  try {
    const hl = lang === 'ko' ? 'ko' : 'en-US';
    const gl = region || (lang === 'ko' ? 'KR' : 'US');
    const ceid = `${gl}:${lang === 'ko' ? 'ko' : 'en'}`;

    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await res.text();
    const j = parser.parse(xml);
    const items = j?.rss?.channel?.item || [];

    const mapped = items.slice(0, limit).map((it) =>
      norm({
        title: stripTags(it.title),
        url: (it.link || '').replace(/^https?:\/\/news\.google\.com\/.*url=(.*)/, (_, u) => decodeURIComponent(u)),
        source: stripTags(it?.source?.['#text'] || it?.source || 'GoogleNews'),
        publishedAt: toISO(it.pubDate),
        lang: lang === 'ko' ? 'ko' : 'en',
      })
    );

    return mapped.filter((x) => x.title && x.url);
  } catch {
    return [];
  }
}

/** NAVER Open API (검색 뉴스) — 환경변수 필요 */
export async function fetchNaverNewsAPI({ query, display = 100, sort = 'date' }) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];

  try {
    const api =
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`;
    const r = await fetch(api, {
      headers: {
        'X-Naver-Client-Id': id,
        'X-Naver-Client-Secret': secret,
      },
    });
    if (!r.ok) return [];
    const j = await r.json();
    const items = Array.isArray(j.items) ? j.items : [];

    return items.map((it) =>
      norm({
        title: stripTags(it.title),
        url: it.originallink || it.link,
        source: 'NAVER',
        publishedAt: toISO(it.pubDate || it.datetime),
        lang: 'ko',
      })
    ).filter((x) => x.title && x.url);
  } catch {
    return [];
  }
}

/** Dailycar RSS (국문) */
export async function fetchDailycarRSS(limit = 20) {
  try {
    const url = 'https://www.dailycar.co.kr/rss/rss.xml';
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const xml = await r.text();
    const j = parser.parse(xml);
    const items = j?.rss?.channel?.item || [];
    return items.slice(0, limit).map((it) =>
      norm({
        title: stripTags(it.title),
        url: it.link,
        source: 'Dailycar',
        publishedAt: toISO(it.pubDate),
        lang: 'ko',
      })
    );
  } catch {
    return [];
  }
}

/** Global-Autonews (국문 사이트) — 최근 기사 일부 스크랩 */
export async function fetchGlobalAutonewsHTML(limit = 20) {
  try {
    const r = await fetch('http://www.global-autonews.com/home.php', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await r.text();
    const $ = cheerio.load(html);
    const out = [];
    $('a').each((_, a) => {
      const href = $(a).attr('href') || '';
      const title = stripTags($(a).text());
      if (title && href && /home\.php\?ps_idx=/.test(href)) {
        out.push(
          norm({
            title,
            url: /^https?:/.test(href) ? href : `http://www.global-autonews.com/${href.replace(/^\//, '')}`,
            source: 'Global-Autonews',
            publishedAt: null,
            lang: 'ko',
          })
        );
      }
    });
    // 중복 제거
    const uniq = [];
    const seen = new Set();
    for (const it of out) {
      const key = it.url;
      if (!seen.has(key)) {
        seen.add(key);
        uniq.push(it);
      }
    }
    return uniq.slice(0, limit);
  } catch {
    return [];
  }
}

/** 외부 커스텀 API가 생기면 여기에 추가 */
export async function fetchCustomNewsAPI() {
  return [];
}
