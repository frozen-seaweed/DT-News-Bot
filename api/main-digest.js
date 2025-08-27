// api/main-digest.js — health check stub
export default async function handler(req, res) {
  res.status(200).json({ ok: true, msg: 'main-digest alive' });
}
