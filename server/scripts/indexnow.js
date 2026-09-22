/**
 * Submit every sitemap URL to IndexNow (Bing + Yandex).
 *
 * Google does NOT take part in IndexNow — for Google the only lever is Search
 * Console ("Request indexing" + the sitemap). This covers the rest: Bing has
 * already crawled this host, and Bing's index also feeds DuckDuckGo and
 * ChatGPT search, so it is the fastest way to stop being invisible everywhere.
 *
 * The key is served at https://dhanfunded.com/indexnow.txt (client/public) and
 * passed as keyLocation, which IndexNow allows instead of naming the file
 * after the key itself.
 *
 * Usage:  node scripts/indexnow.js            (from /var/www/dhanfunded/server)
 */
const fs = require('fs');
const path = require('path');

const SITE = (process.env.PUBLIC_SITE_URL || 'https://dhanfunded.com').replace(/\/$/, '');
const HOST = new URL(SITE).host;
const KEY_FILE = path.join(__dirname, '..', '..', 'client', 'public', 'indexnow.txt');

async function main() {
  const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (!/^[a-f0-9]{16,}$/i.test(key)) throw new Error('indexnow.txt does not contain a valid key');

  // The live sitemap is the source of truth — it is what the crawlers read.
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  const urlList = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (urlList.length === 0) throw new Error('no <loc> URLs found in sitemap.xml');

  // Confirm the key file is actually reachable; IndexNow rejects the whole
  // submission (422) when it cannot fetch keyLocation.
  const keyUrl = `${SITE}/indexnow.txt`;
  const keyRes = await fetch(keyUrl);
  const served = (await keyRes.text()).trim();
  if (!keyRes.ok || served !== key) {
    throw new Error(`keyLocation not serving the key yet (HTTP ${keyRes.status}) — deploy first`);
  }

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: keyUrl, urlList }),
  });
  const body = await res.text();
  // 200 = accepted, 202 = accepted, still validating the key.
  console.log(`IndexNow: HTTP ${res.status} for ${urlList.length} URLs${body ? ' — ' + body.slice(0, 200) : ''}`);
  if (res.status >= 400) process.exit(1);
}

main().catch((e) => { console.error('IndexNow failed:', e.message); process.exit(1); });
