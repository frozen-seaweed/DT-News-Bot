import { normalizeUrl, sha1 } from './utils.js';
import { kv } from './kv.js';


const FORBIDDEN = ['김건희'];


export function passesBlacklist(item) {
const blob = `${item.title} ${item.description||''} ${item.url}`;
return !FORBIDDEN.some(w => blob.includes(w));
}


export function withinFreshWindow(item, hours=24) {
const pub = item.pubDate ? new Date(item.pubDate) : new Date();
const now = new Date();
return (now - pub) <= hours * 60 * 60 * 1000;
}


export async function notDuplicated7d(item) {
const keyBase = 'dedupe:' + await sha1((item.title||'') + '|' + normalizeUrl(item.url||''));
const existing = await kv.get(keyBase);
if (existing) return false; // 이미 본 것
await kv.setex(keyBase, '1', 7*24*60*60); // 7일 TTL
return true;
}
