/**
 * Post-build prerender for the public marketing pages.
 *
 * Why: the app is client-rendered, so `dist/index.html` ships an empty #root —
 * a crawler that doesn't run JS sees ~11 words on the homepage. Google does
 * render JS, but rendering is a second, separately-queued pass and a brand-new
 * domain gets very little of that budget, which delays indexing badly.
 *
 * What this does: serves the freshly built `dist/`, opens each public route in
 * headless Chromium, waits for React to paint, and writes the resulting HTML to
 * `dist/<route>/index.html`. nginx already resolves those via
 * `try_files $uri $uri/ /index.html`, so no server change is needed.
 *
 * The SPA still boots normally on top — this only changes what the FIRST
 * response contains.
 *
 * Failure policy: never block a deploy. If Chromium is missing or a route
 * times out, we log and carry on with the plain SPA build.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');

/**
 * nginx falls back to this file for any URL with no prerendered page — SPA
 * routes like /app/... and, importantly, URLs that do not exist.
 *
 * It must be the UN-prerendered shell. Falling back to index.html served the
 * rendered homepage for every unknown URL at HTTP 200, so a crawler reading the
 * initial HTML saw a duplicate front page instead of the 404 React renders.
 */
const SHELL = join(DIST, 'spa-shell.html');
const PORT = 4179;

// Public, indexable routes only. App/admin routes are disallowed in robots.txt
// and are behind auth, so prerendering them would be pointless and leak markup.
const ROUTES = [
  '/', '/how-it-works', '/challenges', '/instruments', '/pricing', '/faqs',
  '/prop-firm-india', '/nifty-prop-firm', '/banknifty-prop-firm', '/sensex-prop-firm',
  '/funded-trading-account-india', '/instant-funding-prop-firm-india', '/prop-trading-india',
  '/prop-challenge-india',
  '/inr-upi-prop-firm-india', '/indian-stock-market-prop-firm',
  '/about', '/contact-us', '/blog',
  '/privacy-policy', '/terms', '/refund-policy', '/risk-disclaimer',

  // Every blog post is listed in sitemap.xml. Without these, nginx falls back
  // to index.html and each of the eight URLs served a byte-identical copy of
  // the HOMEPAGE to crawlers — eight duplicates of /, not eight articles.
  '/blog/best-prop-firm-india-2026',
  '/blog/best-nifty-prop-trading-challenge-india',
  '/blog/how-prop-firms-work',
  '/blog/risk-management-funded-learners',
  '/blog/why-learners-fail-challenges',
  '/blog/how-payouts-work',
  '/blog/psychology-consistent-learners',
  '/blog/funded-vs-personal-capital',
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain', '.xml': 'application/xml',
};

/** Mirror of the production nginx rule: real file, else the SPA shell. */
function serveDist() {
  return createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = join(DIST, urlPath);
    if (!extname(urlPath) || !existsSync(file)) file = join(DIST, 'index.html');
    try {
      const buf = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
}

async function main() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    console.log('[prerender] puppeteer not installed — skipping, shipping the SPA build as-is.');
    return;
  }

  // Snapshot the shell BEFORE any route overwrites index.html, then flip its
  // head to noindex. nginx serves this file only for URLs that have no
  // prerendered page — unknown URLs, and the private SPA routes (/app, /login,
  // /admin) which robots.txt already disallows. All of those should be noindex,
  // and saying so in the raw HTML means Google does not have to render the page
  // to learn it. Seo.jsx still sets index,follow on any real page that renders.
  {
    let shell = await readFile(join(DIST, 'index.html'), 'utf8');
    shell = shell
      .replace(/<meta name="robots" content="[^"]*"\s*\/?>/i,
               '<meta name="robots" content="noindex, follow" />')
      // Neutral title: this shell also serves real signed-in pages (/app/...,
      // /admin), which do not set their own title — a "Page not found" title
      // here showed on the tab of working pages. A genuine 404 sets that title
      // itself when NotFoundPage renders.
      .replace(/<title>[^<]*<\/title>/i, '<title>DhanFunded</title>');
    if (!/name="robots"/i.test(shell)) {
      shell = shell.replace('</head>', '    <meta name="robots" content="noindex, follow" />\n  </head>');
    }
    await writeFile(SHELL, shell, 'utf8');
    console.log('[prerender] saved spa-shell.html (nginx fallback, noindex)');
  }

  const server = serveDist();
  await new Promise((r) => server.listen(PORT, r));

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    console.log(`[prerender] could not start Chromium (${err.message}) — skipping.`);
    server.close();
    return;
  }

  let done = 0;
  const render = async (route) => {
    try {
      const page = await browser.newPage();
      // The charting library and video are irrelevant to the marketing HTML and
      // just slow the render down.
      await page.setRequestInterception(true);
      page.on('request', (r) => {
        const u = r.url();
        if (u.includes('/charting_library/') || u.endsWith('.mp4')) r.abort();
        else r.continue();
      });

      await page.goto(`http://127.0.0.1:${PORT}${route}`, {
        waitUntil: 'networkidle0',
        timeout: 45000,
      });
      // #root having children means React has painted — except index.html now
      // ships a #df-splash placeholder inside #root, so that has to be gone too.
      await page.waitForFunction(
        'document.querySelector("#root")?.children.length > 0 && !document.querySelector("#df-splash")',
        { timeout: 20000 });

      let html = await page.content();
      // The service worker must not be registered while a crawler parses this,
      // and the prerendered copy should never be cached as the live shell.
      html = html.replace('<head>', '<head>\n    <!-- prerendered -->');

      // Flat `pricing.html`, NOT `pricing/index.html`. With a directory, nginx
      // sees `$uri` as a dir and 301s `/pricing` → `/pricing/`, which fights
      // the canonical tag and the sitemap (both slash-less). A sibling .html
      // file is served directly via `try_files $uri $uri.html ...`.
      const outFile = route === '/' ? join(DIST, 'index.html') : join(DIST, `${route.slice(1)}.html`);
      await mkdir(dirname(outFile), { recursive: true });
      await writeFile(outFile, html, 'utf8');

      const words = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length;
      console.log(`[prerender] ${route.padEnd(44)} ${words} words`);
      await page.close();
      return true;
    } catch (err) {
      console.log(`[prerender] ${route} failed: ${err.message}`);
      return false;
    }
  };

  // Chromium loses a tab now and then mid-navigation. One retry costs a second
  // and keeps the page from shipping as the noindex SPA shell.
  for (const route of ROUTES) {
    if (await render(route) || await render(route)) done++;
    else console.log(`[prerender] ${route} — leaving SPA fallback.`);
  }

  await browser.close();
  server.close();
  console.log(`[prerender] ${done}/${ROUTES.length} routes written.`);
}

main().catch((e) => {
  console.log('[prerender] aborted:', e.message);
  process.exit(0); // never fail the build
});
