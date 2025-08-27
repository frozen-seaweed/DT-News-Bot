const BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;


async function kvFetch(path, init={}) {
const url = `${BASE}${path}`;
const headers = { 'Authorization': `Bearer ${TOKEN}` };
const r = await fetch(url, { ...init, headers: { ...headers, ...(init.headers||{}) }});
if (!r.ok) throw new Error(`KV ${r.status}: ${await r.text()}`);
return r.json();
}


export const kv = {
async get(key) {
const r = await kvFetch(`/get/${encodeURIComponent(key)}`);
return r.result;
},
async setex(key, value, ttlSec) {
const r = await kvFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?ex=${ttlSec}`);
return r.result;
},
async set(key, value) {
const r = await kvFetch(`/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`);
return r.result;
},
async incrby(key, n=1) {
const r = await kvFetch(`/incrby/${encodeURIComponent(key)}/${n}`);
return r.result;
},
async hget(key, field) {
const r = await kvFetch(`/hget/${encodeURIComponent(key)}/${encodeURIComponent(field)}`);
return r.result;
},
async hset(key, field, val) {
const r = await kvFetch(`/hset/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${encodeURIComponent(val)}`);
return r.result;
}
};
