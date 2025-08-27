// api/common/adapters.js — stable exports
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import { normalizeUrl } from './utils.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

async function fetchText(url, init) {
  try {
    const r = await fetch(url, init);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

export async function fetchGoogleNewsRSS({ query, lang = 'ko', region = 'KR' }) {
  const params = new URLSearchParams({ q: query, hl: lang, gl: region, ceid: `${region}:${lang}` });
  const url = `https://news.google.com/rss/search?${params.toString()}`;
  const xml = await fetchText(url);
  if (!xml) return [];
  let data;
  try {
    data = parser.parse(xml);
  } catch {
    return [];
  }
  const items = data?.rss?.channel?.item ?? [];
  return items.map((it) => ({
    title: (it.title || '').toString().trim(),
    url: normalizeUrl(typeof it.link === 'string' ? it.link : (Array.isArray(it.link) ? it.link[0] : '')),
    description: (it.description || '').toString().replace(/<[^>]+>/g, '').trim(),
    pubDate: it.pubDate ? new Date(it.pubDate) : new Date(),
    source: (it.source?.['#text'] || it.source || '').toString(),
  }));
}

export async function fetchNaverNewsAPI({ query }) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=30&sort=date`;
  const r = await fetch(url, { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } });
  if (!r.ok) return [];
  const j = await r.json();
  const items = j.items || [];
  return items.map((it) => ({
    title: (it.title || '').replace(/<b>|<\/b>/g, ''),
    url: normalizeUrl(it.link || ''),
    description: (it.description || '').replace(/<[^>]+>/g, '').trim(),
    pubDate: it.pubDate ? new Date(it.pubDate) : new Date(),
    source: 'Naver',
  }));
}

export async function fetchDailycarRSS() {
  const urls = [
    'https://www.dailycar.co.kr/rss/rss.xml',
    'https://dailycar.co.kr/rss/rss.xml',
    'https://www.dailycar.co.kr/rss',
  ];
  for (const u of urls) {
    const xml = await fetchText(u);
    if (!xml) continue;
    let data;
    try {
      data = parser.parse(xml);
    } catch {
      continue;
    }
    const items = data?.rss?.channel?.item ?? [];
    if (items.length) {
      return items.map((it) => ({
        title: (it.title || '').toString().trim(),
        url: normalizeUrl((it.link || '').toString()),
        description: (it.description || '').toString().replace(/<[^>]+>/g, '').trim(),
        pubDate: it.pubDate ? new Date(it.pubDate) : new Date(),
        source: 'Dailycar',
      }));
    }
  }
  return [];
}

export async function fetchGlobalAutonewsHTML() {
  const base = 'http://www.global-autonews.com/home.php';
  const html = await fetchText(base);
  if (!html) return [];
  const $ = cheerio.load(html);
  const out = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (!href || !text) return;
    const abs = href.startsWith('http') ? href : new URL(href, base).toString();
    if (/article|content|news|view|report|board|bbs/i.test(abs)) {
      out.push({
        title: text,
        url: normalizeUrl(abs),
        description: '',
        pubDate: new Date(),
        source: 'Global Autonews',
      });
    }
  });
  return out.slice(0, 30);
}

export async function fetchCustomNewsAPI() {
  const endpoint = process.env.CUSTOM_NEWS_API_URL;
  if (!endpoint) return [];
  const r = await fetch(endpoint);
  if (!r.ok) return [];
  const j = await r.json();
  const arr = Array.isArray(j) ? j : [];
  return arr.map((x) => ({
    title: (x.title || '').toString(),
    url: normalizeUrl((x.url || '').toString()),
    description: (x.description || '').toString(),
    pubDate: x.pubDate ? new Date(x.pubDate) : new Date(),
    source: (x.source || 'Custom').toString(),
  }));
}
