/* キーボードだけで使えるか、どの幅でも読めるかを、ブラウザを起こして測る。
 *
 *   node build.js && node verification/check_keyboard.js
 *
 * 他の検査は HTML を文字列として見る。ここだけは違う。焦点がどこに置かれ、
 * そのとき見えているかは、字面からは出ない。
 *
 * 要るもの —— playwright と Chromium。無ければ 1 を返して止まる。
 * 走らなかった検査は、通った検査ではない。
 *   PLAYWRIGHT_CHROMIUM=/path/to/chrome   実行ファイルを指す（任意）
 *
 * CI では別の仕事にしてある。ブラウザの都合で落ちたのか、中身が壊れたのかを見分けるため。
 */
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const SITE = path.resolve(__dirname, '..', 'site');
/* 広い幅から狭い幅まで。390px では通り、360px でだけ横へ流れる頁がありうる。 */
const WIDTHS = [1440, 1200, 900, 390, 360];

function pages(dir = SITE, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) return ['pdf', 'node_modules'].includes(e.name) ? [] : pages(path.join(dir, e.name), r);
    return e.name.endsWith('.html') ? [r] : [];
  }).sort();
}

let pass = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; return; }
  console.log('  落  ' + label + (detail ? ' —— ' + detail : ''));
  failures.push(label);
}

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* 次を試す */ }
  for (const dir of ['/opt/node22/lib/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
    try { return require(path.join(dir, 'playwright')); } catch (e) { /* 次 */ }
  }
  return null;
}

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  for (const base of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(os.homedir(), '.cache', 'ms-playwright')].filter(Boolean)) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).filter((x) => /^chromium-/.test(x)).sort().reverse()) {
      const exe = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

async function launch(pw, exe) {
  const args = ['--no-sandbox'];
  if (exe) {
    try { return await pw.chromium.launch({ executablePath: exe, args }); } catch (e) { /* playwright 自身の一式を試す */ }
  }
  return pw.chromium.launch({ args });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.pdf': 'application/pdf' };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(SITE, p);
      if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); return rep.end('not found'); }
      rep.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(f));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

/* 焦点を受けた要素について、枠が出ているか、大きさ、文書の中の位置。 */
const PROBE = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    tag: el.tagName,
    text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('href') || '').trim().slice(0, 40),
    ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none',
    w: Math.round(r.width), h: Math.round(r.height),
    order: [...document.querySelectorAll('*')].indexOf(el),
  };
};

async function walk(pg) {
  const seen = [];
  let trap = null;
  await pg.keyboard.press('Tab');
  for (let i = 0; i < 600; i++) {
    const info = await pg.evaluate(PROBE);
    if (!info) break;
    const key = info.tag + '|' + info.text + '|' + info.order;
    if (seen.some((x) => x.key === key)) { if (seen[0].key !== key) trap = key; break; }
    seen.push(Object.assign({ key }, info));
    await pg.keyboard.press('Tab');
  }
  return { seen, trap };
}

(async () => {
  if (!fs.existsSync(SITE)) { console.error('site/ が無い。先に node build.js を走らせる。この検査は走らなかった。'); process.exit(1); }
  const pw = loadPlaywright();
  if (!pw) { console.error('playwright が無い。この検査は走らなかった。走らなかった検査は、通った検査ではない。'); process.exit(1); }
  let browser;
  try { browser = await launch(pw, findChromium()); } catch (e) {
    console.error('Chromium を起こせなかった。この検査は走らなかった。PLAYWRIGHT_CHROMIUM を指すか、playwright install chromium を先に走らせる。');
    console.error(String(e.message || e).split('\n')[0]);
    process.exit(1);
  }
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const list = pages();
  console.log('キーボードと幅 —— ' + list.length + ' 頁を Tab で辿り、' + WIDTHS.join(' / ') + ' px で測る');

  for (const page of list) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(base + page, { waitUntil: 'load' });
    const { seen, trap } = await walk(pg);
    ok(page + '：焦点が先へ進む（罠が無い）', trap === null, trap || '');
    ok(page + '：Tab で辿れる要素がある', seen.length > 0);
    const blind = seen.filter((x) => !x.ring);
    ok(page + '：焦点の枠が出ない要素が無い', blind.length === 0, blind.slice(0, 4).map((x) => x.tag + ' ' + x.text).join(' / ') + (blind.length > 4 ? ' ほか計 ' + blind.length : ''));
    const flat = seen.filter((x) => x.w === 0 || x.h === 0);
    ok(page + '：大きさの無い要素に焦点が乗らない', flat.length === 0, flat.map((x) => x.tag + ' ' + x.text).join(' / '));
    const jumps = seen.filter((x, i) => i > 0 && x.order < seen[i - 1].order);
    ok(page + '：辿る順が読む順と同じ', jumps.length === 0, jumps.map((x) => x.tag + ' ' + x.text).join(' / '));
    const doc = await pg.evaluate(() => ({
      lang: document.documentElement.getAttribute('lang') || '',
      h1: document.querySelectorAll('h1').length,
      noAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src')),
      unlabelled: [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((el) =>
        !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).map((el) => el.name || el.id || el.type),
    }));
    ok(page + '：言語の指定・h1 が一つ・画像の代替テキスト・入力欄の名前がそろう',
      /^(ja|en)$/.test(doc.lang) && doc.h1 === 1 && doc.noAlt.length === 0 && doc.unlabelled.length === 0,
      'lang ' + doc.lang + '、h1 ' + doc.h1 + '、alt 無し ' + doc.noAlt.join(',') + '、名前無し ' + doc.unlabelled.join(','));
    ok(page + '：読み込みで例外が出ない', errors.length === 0, errors.join(' / '));
    await ctx.close();

    for (const w of WIDTHS) {
      const c2 = await browser.newContext({ viewport: { width: w, height: 900 } });
      const p2 = await c2.newPage();
      await p2.goto(base + page, { waitUntil: 'load' });
      const over = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(page + '：' + w + 'px で横へ流れない', over <= 1, over + 'px はみ出す');
      if (w <= 390) {
        const g = await p2.evaluate(() => {
          const W = document.documentElement.clientWidth; let L = Infinity, R = Infinity;
          for (const el of document.querySelectorAll('main p, main li, main h1, main h2, main h3, main dt, main dd, article p, article li')) {
            const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
            L = Math.min(L, b.left); R = Math.min(R, W - b.right);
          }
          return { L: Math.round(L), R: Math.round(R) };
        });
        ok(page + '：' + w + 'px で本文の左右に 12px 以上の余白がある', g.L >= 12 && g.R >= 12, '左 ' + g.L + ' / 右 ' + g.R);
      }
      await c2.close();
    }
  }
  await browser.close();
  server.close();

  console.log('\n' + '-'.repeat(56));
  if (failures.length) { console.log(pass + ' 件が通り、' + failures.length + ' 件が通りませんでした。'); process.exit(1); }
  console.log(pass + ' 件すべて通りました。');
})().catch((e) => { console.error(e); process.exit(1); });
