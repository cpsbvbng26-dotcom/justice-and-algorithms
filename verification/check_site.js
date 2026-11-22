/* 生成したサイトに、記法の取りこぼしが残っていないかを見る。
 *
 * build.js は自前の小さな Markdown 変換なので、未対応の記法があると
 * 「*斜体*」のようにアスタリスクごと本文に出てしまう。読者には見えるが、
 * 生成した側からは気づきにくい。ここで落とす。
 *
 *   node build.js && node verification/check_site.js
 *
 * 依存パッケージなし。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');

if (!fs.existsSync(SITE)) {
  console.error('site/ がありません。先に node build.js を実行してください。');
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : full.endsWith('.html') ? [full] : [];
  });
}

/* 検査の対象から外すもの。
 *
 *   <style> <script>  CSS のコメント区切りが * を含む
 *   <code> <pre>      コード例は Markdown 記法をそのまま載せて当然で、
 *                     変換されずに残った記法とは区別しなければならない
 *                     （README が「壊れて出ていた例」を引用しているのがこれ）
 */
function bodyOnly(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
    .replace(/<code[\s\S]*?<\/code>/g, '');
}

const failures = [];
let checked = 0;

function check(label, hits) {
  checked += 1;
  if (hits.length === 0) {
    console.log('  OK   ' + label);
  } else {
    console.log('  FAIL ' + label + ' — ' + hits.length + ' 件');
    hits.slice(0, 5).forEach((h) => console.log('         ' + h));
    failures.push(label);
  }
}

const pages = walk(SITE);
console.log('生成物 ' + pages.length + ' ページを検査します。\n');

// 1. 変換されずに残ったアスタリスク強調
const emphasis = [];
for (const file of pages) {
  const body = bodyOnly(fs.readFileSync(file, 'utf8'));
  for (const m of body.matchAll(/\*[^*\s<][^*<\n]{0,60}\*/g)) {
    emphasis.push(path.relative(ROOT, file) + ': ' + m[0]);
  }
}
check('アスタリスクのまま残った強調がない', emphasis);

// 2. 変換されずに残った自動リンク
const autolinks = [];
for (const file of pages) {
  const body = bodyOnly(fs.readFileSync(file, 'utf8'));
  for (const m of body.matchAll(/&lt;https?:\/\/[^\s&]+&gt;/g)) {
    autolinks.push(path.relative(ROOT, file) + ': ' + m[0]);
  }
}
check('山括弧のまま残った自動リンクがない', autolinks);

// 3. 変換されずに残ったリンク記法
const rawLinks = [];
for (const file of pages) {
  const body = bodyOnly(fs.readFileSync(file, 'utf8'));
  for (const m of body.matchAll(/\[[^\]\n]{1,80}\]\([^)\s]{1,200}\)/g)) {
    rawLinks.push(path.relative(ROOT, file) + ': ' + m[0]);
  }
}
check('Markdown のまま残ったリンク記法がない', rawLinks);

// 4. 文献の識別子が、生成物でもリンクになっていること
const doiPages = pages.filter((f) => /issues[\\/][^\\/]+\.html$/.test(f)
  && !/README\.html$/.test(f));
const missing = [];
for (const file of doiPages) {
  const html = fs.readFileSync(file, 'utf8');
  const anchors = (html.match(/href="https:\/\/(doi\.org|arxiv\.org|proceedings\.mlr\.press|www\.propublica\.org)\//g) || []).length;
  if (anchors === 0) missing.push(path.relative(ROOT, file) + ': 識別子のリンクが 0 件');
}
check('論点編の各ページに文献の識別子リンクがある', missing);

// 5. 生成物が third-party へリクエストを出していないこと。
//    バッジのような外部画像は build.js が代替テキストに落とす方針なので、
//    <img src="http..."> が残っていたらその方針が崩れている。
const external = [];
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<img[^>]+src="https?:\/\/([^/"]+)[^"]*"/g)) {
    external.push(path.relative(ROOT, file) + ': ' + m[1]);
  }
}
check('外部ホストから画像を読み込んでいない', external);


// 6. Content-Security-Policy。build.js が生成のたびに埋める。
//    無い／緩んでいる／ページの中身と食い違う、を落とす。
const crypto = require('crypto');
const sha = (t) => "'sha256-" + crypto.createHash('sha256').update(t, 'utf8').digest('base64') + "'";
const hashesIn = (html, tag) => {
  const re = new RegExp('<' + tag + '(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)</' + tag + '>', 'g');
  const out = []; let m;
  while ((m = re.exec(html)) !== null) out.push(sha(m[1]));
  return out;
};

const noCsp = [], weak = [], mismatch = [];
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  if (!m) { noCsp.push(rel); continue; }
  const csp = m[1];
  if (csp.indexOf("default-src 'none'") !== 0) weak.push(rel + ": default-src が 'none' でない");
  if (/unsafe-inline|unsafe-eval|unsafe-hashes|\*/.test(csp)) weak.push(rel + ': 緩められている');
  for (const h of hashesIn(html, 'style').concat(hashesIn(html, 'script'))) {
    if (csp.indexOf(h) < 0) mismatch.push(rel);
  }
}
check('すべてのページに CSP がある', noCsp);
check('CSP が緩められていない', weak);
check('CSP のハッシュがページの中身と一致する', [...new Set(mismatch)]);

// 7. 種類と状態の札。README の題のすぐ下に一行置く。目録と食い違えば横断の検査が落とす。
//    ここでは札の形と、引用情報の type を見る。
{
  const rm = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').split('\n');
  const cff = fs.readFileSync(path.join(ROOT, 'CITATION.cff'), 'utf8');
  const bad = [];
  if (!(/^# /.test(rm[0]) && rm[1] === '' && rm[2] === '種類：エッセイ　状態：凍結')) bad.push('README の 3 行目: ' + rm[2]);
  if (!/^type: dataset$/m.test(cff)) bad.push('CITATION.cff の type: ' + ((/^type: (.*)$/m.exec(cff) || [])[1] || '無い'));
  check('README の題の下に種類と状態の札があり、CITATION.cff の type が dataset である', bad);
}

// 8. 立場と論点の図。build.js が docs/map.md から描く。ここでは表を独立に読み直し、
//    図の線の組が表と一つも違わないことを見る。立場はすべて図に出ていること。
{
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'map.md'), 'utf8');
  const rows = (h) => {
    const ls = md.slice(md.indexOf(h)).split('\n');
    const k = ls.findIndex((l) => l.startsWith('|'));
    const out = [];
    for (let j = k + 2; j < ls.length && ls[j].startsWith('|'); j++) out.push(ls[j].split('|').slice(1, -1).map((c) => c.trim()));
    return out;
  };
  const name = (c) => (/^\[([^\]]+)\]/.exec(c) || [, c])[1];
  const doc = (c) => (/\]\(([^)]+)\)/.exec(c) || [, ''])[1];
  const trad = rows('## 何を最終的な基準に置くか').map((r) => ({
    name: name(r[0]),
    title: (/^#\s+(.*)$/m.exec(fs.readFileSync(path.join(ROOT, 'docs', doc(r[0])), 'utf8')) || [, ''])[1]
  }));
  const want = new Set();
  const unknown = [];
  for (const r of rows('## 論点との交差')) {
    for (const n of r[1].split('/').map((x) => x.trim())) {
      const t = trad.find((x) => x.name === n) || trad.find((x) => x.title.indexOf(n) >= 0);
      if (!t) { unknown.push(n); continue; }
      want.add(t.name + ' → ' + name(r[0]));
    }
  }
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const fig = (/<figure class="map-figure">[\s\S]*?<\/figure>/.exec(html) || [''])[0];
  const got = new Set([...fig.matchAll(/<line data-from="([^"]+)" data-to="([^"]+)"/g)].map((m) => m[1] + ' → ' + m[2]));
  const nodes = [...fig.matchAll(/<text data-node="立場"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
  const hits = [];
  if (!fig) hits.push('index.html に図が無い');
  if (!/<title id="map-title">/.test(fig) || !/<desc id="map-desc">/.test(fig)) hits.push('図に題と説明が無い');
  unknown.forEach((n) => hits.push('交差の表の「' + n + '」が立場の表に無い'));
  [...want].filter((x) => !got.has(x)).forEach((x) => hits.push('図に無い線: ' + x));
  [...got].filter((x) => !want.has(x)).forEach((x) => hits.push('表に無い線: ' + x));
  trad.filter((t) => nodes.indexOf(t.name) < 0).forEach((t) => hits.push('図に無い立場: ' + t.name));
  check('入口の図の線が、対応表の「論点との交差」と一致する', hits);
}

// 9. 読むのにかかる時間の目安。build.js が字数から数えて頁に書く。数え直して突き合わせる。
{
  const hits = [];
  for (const file of pages) {
    const html = fs.readFileSync(file, 'utf8');
    const main = (/<main[^>]*>([\s\S]*?)<\/main>/.exec(html) || [, ''])[1];
    const m = /<p class="reading-time">読むのにかかる時間の目安は約 (\d+) 分です（本文 (\d+) 字を、一分に (\d+) 字として build.js が数えました）。<\/p>/.exec(main);
    const n = main
      .replace(/<p class="reading-time">[\s\S]*?<\/p>/, '')
      .replace(/<pre[\s\S]*?<\/pre>/g, '')
      .replace(/<figure[\s\S]*?<\/figure>/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z]+;|&#\d+;/g, 'x')
      .replace(/\s+/g, '').length;
    if (!m) hits.push(path.relative(ROOT, file) + ': 目安が無い');
    else if (Number(m[2]) !== n || Number(m[1]) !== Math.ceil(n / Number(m[3])) || m[3] !== '500') {
      hits.push(path.relative(ROOT, file) + ': 名乗り ' + m[1] + ' 分・' + m[2] + ' 字 / 実際 ' + Math.ceil(n / 500) + ' 分・' + n + ' 字');
    }
  }
  check('すべての頁に読む時間の目安があり、字数から数え直したものと合う', hits);
}

// 10. 「この資料が言っていないこと」は、資料が自分で断っていることだけを集める。
//     各行が根拠にした文が、指した先に実際にあること。
{
  const rm = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\*\*/g, '').replace(/\s+/g, '');
  const 根拠 = [
    ['README.md', 'この資料は、どの立場が正しいかを決めません。'],
    ['docs/00-how-to-read.md', 'どの立場が正しいかを決めません。'],
    ['docs/00-how-to-read.md', 'また、特定の企業や製品を評価しません。'],
    ['docs/map.md', '結論そのものではなく、結論に至る根拠の違いに注目します。'],
    ['README.md', '各立場の要約は入門的な水準で、原典の議論を単純化しています'],
    ['README.md', '専門的な研究者ではありません'],
    ['.zenodo.json', 'Not peer-reviewed.']
  ];
  const i = rm.indexOf('## この資料が言っていないこと');
  const 行 = i < 0 ? [] : rm.slice(i, rm.indexOf('\n## ', i + 1)).split('\n').filter((l) => l.startsWith('- '));
  const hits = 根拠.filter(([f, t]) => read(f).indexOf(t.replace(/\s+/g, '')) < 0).map(([f, t]) => f + ' に「' + t + '」が無い');
  if (行.length !== 6) hits.push('行の数 ' + 行.length + '（根拠の表は 6 行を前提にしている）');
  for (const l of 行) for (const m of l.matchAll(/\]\(([^)]+)\)/g)) if (!fs.existsSync(path.join(ROOT, m[1]))) hits.push('指した先が無い: ' + m[1]);
  check('「この資料が言っていないこと」の各行の根拠が、指した先にある', hits);
}

// 11. 外部の反応は、外部評価の記録から写す。記録の所在へのリンクがあること。
//     兄弟ディレクトリに cpsbvbng26-dotcom があれば（ECOSYSTEM_ROOT でも指せる）、記録の
//     「出した先」の表の行が、写した行と一字一句同じであることと、「受けた評価」に行が無いことを見る。
{
  const SRC = 'https://github.com/cpsbvbng26-dotcom/cpsbvbng26-dotcom/blob/main/docs/external-evaluations.md';
  const rm = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const hits = [];
  if (rm.indexOf('](' + SRC + ')') < 0) hits.push('記録へのリンクが無い');
  const mine = rm.split('\n').filter((l) => l.startsWith('| MERLOT'));
  if (mine.length !== 1) hits.push('写した行が無い');
  const eco = process.env.ECOSYSTEM_ROOT || path.resolve(ROOT, '..');
  const f = path.join(eco, 'cpsbvbng26-dotcom', 'docs', 'external-evaluations.md');
  if (fs.existsSync(f)) {
    const t = fs.readFileSync(f, 'utf8');
    const table = (h) => {
      const ls = t.slice(t.indexOf(h)).split('\n');
      const k = ls.findIndex((l) => l.startsWith('|'));
      const out = [];
      for (let j = k + 2; j < ls.length && ls[j].startsWith('|'); j++) out.push(ls[j].split('|').slice(1, -1).map((c) => c.trim().replace(/\*\*/g, '')));
      return out;
    };
    const 出 = table('## 出した先').filter((r) => r[1] === '正義論とアルゴリズム');
    const 受 = table('## 受けた評価').filter((r) => r[2] === '正義論とアルゴリズム');
    const 写 = mine.map((l) => l.split('|').slice(1, -1).map((c) => c.trim()).join(' | '));
    const 元 = 出.map((r) => [r[0], r[2], r[3]].join(' | '));
    if (写.join('\n') !== 元.join('\n')) hits.push('記録 ' + 元.join(' / ') + ' / 写し ' + 写.join(' / '));
    if (受.length) hits.push('「受けた評価」に行がある: ' + 受.length);
    if (rm.indexOf('同じ記録の「受けた評価」の表に、この資料の行はありません。') < 0) hits.push('「受けた評価」についての文が無い');
  }
  check('外部の反応が、外部評価の記録と合う' + (fs.existsSync(f) ? '' : '（兄弟に記録が無いので、所在と行の有無だけを見た）'), hits);
}

/* 11b. 読みやすさと配信。autonomy-and-self-cultivation と justice-and-algorithms の check_site.js に同じ形で置く。
 * 配色の比（WCAG）、端末の設定に従う暗い配色、画像の代替テキスト、頁の重さ、頁の下の欄、
 * sitemap.xml と robots.txt、正の URL（canonical）。文字を 200% にしたときと 360px の幅は、
 * ブラウザを起こす check_keyboard.js が測る。 */
{
  /* 配信先は build.js が持つ。リポジトリの名から組んだ URL と同じであることも見る。 */
  const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
  const BASE = (/const BASE = '([^']+)'/.exec(src) || [])[1] || '';
  const NAME = (/const REPO = 'https:\/\/github\.com\/cpsbvbng26-dotcom\/([^']+)'/.exec(src) || [])[1] || '';
  check('配信先が、このリポジトリの Pages の URL である', BASE && BASE === 'https://cpsbvbng26-dotcom.github.io/' + NAME + '/' ? [] : ['BASE ' + BASE + ' / REPO ' + NAME]);
  /* 一頁の HTML の上限。PDF は読みに行く人だけが落とすので数えない。通信の遅い人のために、
   * いちばん重い頁の倍ほどに置いた。 */
  const MAX_BYTES = 100 * 1000;
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'style.css'), 'utf8');
  const tokens = (m) => (m ? Object.fromEntries([...m[1].matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((x) => [x[1], x[2].toLowerCase()])) : null);
  const light = tokens(css.match(/^:root \{([^}]*)\}/m));
  const dark = tokens(css.match(/^:root\[data-theme="dark"\] \{([^}]*)\}/m));
  const media = tokens(css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/));
  const lum = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  const low = [];
  for (const [name, t] of [['ライト', light], ['ダーク', dark]]) {
    if (!t) { low.push(name + 'の定義が無い'); continue; }
    for (const ground of ['bg', 'card']) for (const ink of ['text', 'muted', 'faint', 'accent']) {
      const r = t[ink] && t[ground] ? ratio(t[ink], t[ground]) : 0;
      if (r < 4.5) low.push(name + ' --' + ink + ' / --' + ground + ' ' + r.toFixed(2) + ':1');
    }
  }
  check('文字の色が、地の色に対して WCAG の 4.5:1 以上ある（ライトとダーク）', low);

  const themeHits = [];
  if (!media) themeHits.push('@media (prefers-color-scheme: dark) の定義が無い');
  else if (JSON.stringify(media) !== JSON.stringify(dark)) themeHits.push('端末の設定の暗い配色と、切り替えの暗い配色が違う');
  for (const file of pages) {
    const html = fs.readFileSync(file, 'utf8');
    if (html.indexOf('id="themeToggle"') < 0 || html.indexOf('assets/theme.js"></script>') < 0) themeHits.push(path.relative(SITE, file) + ' に切り替えが無い');
  }
  check('暗い配色は、端末の設定にも切り替えにも従い、二つが同じ色を使う', themeHits);

  const altHits = [];
  for (const file of pages) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/<img\b[^>]*>/g)) {
      const alt = /\balt="([^"]*)"/.exec(m[0]);
      const rel = path.relative(SITE, file);
      if (!alt) altHits.push(rel + ' alt が無い');
      else if (/^(画像|写真|図)|^(image|picture|photo)\b/i.test(alt[1]) || /\.(png|jpe?g|svg|gif|webp)$/i.test(alt[1])) altHits.push(rel + ' 「' + alt[1] + '」');
    }
  }
  check('画像の代替テキストが、CONTRIBUTING.md の決めに沿う（「画像」で始めない、ファイル名にしない）', altHits);

  const heavy = pages.map((f) => [path.relative(SITE, f), fs.statSync(f).size]).filter(([, n]) => n > MAX_BYTES).map(([f, n]) => f + ' ' + n + ' バイト');
  check('どの頁の HTML も ' + MAX_BYTES + ' バイト以下', heavy);

  const footHits = [];
  for (const file of pages) {
    const html = fs.readFileSync(file, 'utf8');
    const foot = (/<footer>([\s\S]*?)<\/footer>/.exec(html) || ['', ''])[1];
    const rel = path.relative(SITE, file);
    if (foot.indexOf('運営 根本卓哉') < 0) footHits.push(rel + ' 運営');
    if (foot.indexOf('/issues/new?template=error-report.yml">連絡') < 0) footHits.push(rel + ' 連絡');
    if (foot.indexOf('cpsbvbng26-dotcom/blob/main/DISCLAIMER.md">免責事項') < 0) footHits.push(rel + ' 免責');
    if (/nusquama/i.test(html)) footHits.push(rel + ' 創作のサイトへつないでいる');
  }
  check('どの頁の下の欄にも、運営・連絡・免責があり、創作のサイトへはつながない', footHits);

  const rels = pages.map((f) => path.relative(SITE, f).split(path.sep).join('/'));
  const canonHits = [];
  for (const file of pages) {
    const rel = path.relative(SITE, file).split(path.sep).join('/');
    const want = rel === 'index.html' ? BASE : BASE + rel;
    const got = [...fs.readFileSync(file, 'utf8').matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((m) => m[1]);
    if (got.length !== 1 || got[0] !== want) canonHits.push(rel + ' ' + (got.join(' ') || '無い'));
  }
  check('どの頁にも、正の URL（canonical）がちょうど一つあり、配信先の自分を指す', canonHits);

  const mapHits = [];
  const sm = fs.existsSync(path.join(SITE, 'sitemap.xml')) ? fs.readFileSync(path.join(SITE, 'sitemap.xml'), 'utf8') : '';
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const want = rels.filter((r) => r !== 'CLAUDE.html').map((r) => (r === 'index.html' ? BASE : BASE + r)).sort();
  if (JSON.stringify(locs) !== JSON.stringify(want)) mapHits.push('sitemap.xml ' + locs.length + ' 件 / 頁 ' + want.length + ' 件');
  const robots = fs.existsSync(path.join(SITE, 'robots.txt')) ? fs.readFileSync(path.join(SITE, 'robots.txt'), 'utf8') : '';
  if (robots.indexOf('Sitemap: ' + BASE + 'sitemap.xml') < 0) mapHits.push('robots.txt が sitemap.xml を指していない');
  check('sitemap.xml が CLAUDE.html のほかの全頁を挙げ、robots.txt がそれを指す', mapHits);
}

/* 13. デザインに関する法的な扱い（docs/design-legal.md）。2026-11-22 に足した。
 * 頁に書いた事実を、実際のファイルと突き合わせる。条文の写し、頁に置いた条文、LICENSE からの引用、書体、配るファイル、
 * 部品の表、見やすさ、頁の下の欄のつなぎ、作者と記録。中身は 問題13(状態) にまとめ、壊した状態でも走らせて、
 * どれを壊しても落ちることを見る（最後の項目）。部品を変えたら、頁とここを同じ PR で直す。 */
{
  const { execFileSync } = require('child_process');
  const H = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
  const rd = (f) => (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '');
  const PAGE = 'docs/design-legal.md';
  const PAGE_HTML = 'docs/design-legal.html';
  const COPY = 'verification/statutes-texts.json';
  /* 部品の表の行。表とここが一つでも違えば落ちる。行を足すなら、その行の事実を確かめる式もここに足す。 */
  const 部品 = ['配る書体', '名指す書体', 'ロゴと印', 'ファビコン', '共有用の画像', '図', '記号', '配色', '配置', '外から読む素材'];
  /* 11b が数える色の組。頁の見やすさの節は、この名を挙げる。 */
  const 文字の色 = ['text', 'muted', 'faint', 'accent'], 地の色 = ['bg', 'card'];
  const 作者を見るファイル = ['assets/style.css', 'assets/theme.js', 'build.js'];
  const 書体の拡張子 = /\.(woff2?|ttf|otf|eot)$/i, 画像の拡張子 = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)$/i;

  const listAll = (dir, rel) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? rel + '/' + e.name : e.name;
    return e.isDirectory() ? listAll(path.join(dir, e.name), r) : [r];
  });
  const repoTexts = (function walk(dir, rel) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) return ['.git', 'site', 'node_modules', 'verification'].includes(e.name) ? [] : walk(path.join(dir, e.name), r);
      return /\.(md|json|cff|toml|ya?ml)$/.test(e.name) && r !== PAGE ? [[r, fs.readFileSync(path.join(dir, e.name), 'utf8')]] : [];
    });
  })(ROOT, '');
  const git = (args, cwd) => { try { return execFileSync('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
  /* 作者の欄。浅い取り出し（CI）では履歴が無いので見ない。 */
  const 作者 = (function () {
    if ((git(['rev-parse', '--is-shallow-repository'], ROOT) || '').trim() !== 'false') return null;
    return Object.fromEntries(作者を見るファイル.map((f) => [f, [...new Set((git(['log', '--no-merges', '--format=%an', '--', f], ROOT) || '').split('\n').filter(Boolean))]]));
  })();
  /* 写したもとのコミット。兄弟に運営者の別のリポジトリがあり、そのコミットを持っていれば、その文と記した sha256 とも突き合わせる。 */
  const もと = (function () {
    let commit = '';
    try { commit = JSON.parse(rd(COPY)).from.commit; } catch (e) { return null; }
    const dir = path.join(process.env.ECOSYSTEM_ROOT || path.resolve(ROOT, '..'), 'nusquama');
    if (!/^[0-9a-f]{40}$/.test(commit) || !fs.existsSync(dir)) return null;
    const t = git(['show', commit + ':verification/statutes-texts.json'], dir), r = git(['show', commit + ':verification/statutes.json'], dir);
    if (t === null || r === null) return null;
    try {
      const rec = {};
      for (const e of JSON.parse(r).statutes || []) rec[e.name + ' ' + e.label] = e;
      return { texts: JSON.parse(t), rec };
    } catch (e) { return null; }
  })();

  const 状態 = {
    md: rd(PAGE), html: fs.existsSync(path.join(SITE, PAGE_HTML)) ? fs.readFileSync(path.join(SITE, PAGE_HTML), 'utf8') : '',
    copy: rd(COPY), css: rd('assets/style.css'), theme: rd('assets/theme.js'), build: rd('build.js'), license: rd('LICENSE'),
    readme: rd('README.md'), contributing: rd('CONTRIBUTING.md'), keyboard: rd('verification/check_keyboard.js'),
    assets: fs.readdirSync(path.join(ROOT, 'assets')).sort(), site: listAll(SITE, '').sort(),
    pages: Object.fromEntries(pages.map((f) => [path.relative(SITE, f).split(path.sep).join('/'), fs.readFileSync(f, 'utf8')])),
    texts: repoTexts, 作者, もと
  };

  const 節 = (md, head) => {
    const lv = /^#+/.exec(head)[0].length;
    const ls = md.split('\n');
    const i = ls.indexOf(head);
    if (i < 0) return '';
    let j = i + 1;
    while (j < ls.length && !(new RegExp('^#{1,' + lv + '} ').test(ls[j]))) j++;
    return ls.slice(i + 1, j).join('\n');
  };
  const 表 = (text) => text.split('\n').filter((l) => /^\|/.test(l)).slice(2).map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const 符 = (s) => [...String(s).matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const 色 = (css, re) => { const m = css.match(re); return m ? Object.fromEntries([...m[1].matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((x) => [x[1], x[2].toLowerCase()])) : {}; };
  const 輝 = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const 比 = (a, b) => { const x = 輝(a), y = 輝(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  function 問題13(s) {
    const g = { 写し: [], 条文: [], 引用: [], 書体: [], 配る: [], 部品: [], 見やすさ: [], 下の欄: [], 記録: [] };
    let C = null;
    try { C = JSON.parse(s.copy); } catch (e) { g.写し.push(COPY + ' が読めない'); }
    const T = (C && C.texts) || {};

    /* 写し。各条の文の sha256 が記した値と合い、もとのコミットが手元にあれば、その文と記した値とも合う。 */
    if (C) {
      if (!C.from || !/^[0-9a-f]{40}$/.test(C.from.commit || '') || !/^\d{4}-\d{2}-\d{2}$/.test(C.from.fetched || '')) g.写し.push('from の commit か fetched の形');
      if (!Object.keys(T).length) g.写し.push('条が無い');
      for (const [k, v] of Object.entries(T)) {
        if (!v || typeof v['文'] !== 'string' || H(v['文']) !== v.sha256) g.写し.push(k + ' の sha256 が文と合わない');
        if (!v || !v['法令名'] || !/^\w+$/.test(v.law_id || '')) g.写し.push(k + ' の法令名か law_id');
        if (s.もと) {
          if (s.もと.texts[k] !== (v && v['文'])) g.写し.push(k + ' がもとのコミットの文と違う');
          const r = s.もと.rec[k];
          if (!r || r.sha256 !== (v && v.sha256) || r.title !== (v && v['法令名']) || r.law_id !== (v && v.law_id)) g.写し.push(k + ' がもとの記録（sha256・法令名・law_id）と違う');
        }
      }
    }

    /* 頁に置いた条文。印（<!-- 条:… -->）の次の行が条の名、その次の引用が文。全文なら一字一句同じ、切り出しなら文の一部。 */
    const 置いた = new Set();
    const 印 = /<!-- 条:([^:>]+?)(?::(切り出し))? -->\n([^\n]*)\n\n((?:> [^\n]*\n?)+)/g;
    let 印の数 = 0;
    for (const m of s.md.matchAll(印)) {
      印の数++;
      const [, k, cut, label, block] = m;
      const q = block.trimEnd().split('\n').map((l) => l.replace(/^> /, '')).join('\n');
      置いた.add(k);
      const v = T[k];
      if (!v) { g.条文.push('写しに無い条を置いた：' + k); continue; }
      if (!label.startsWith(k + '（')) g.条文.push(k + ' の条の名の行：' + label);
      if (cut) {
        if (!(v['文'].includes(q) && q !== v['文'])) g.条文.push(k + ' の切り出しが、写しの文の一部でない');
        if (!/切り出し/.test(label) || /全文/.test(label)) g.条文.push(k + ' の条の名の行が、切り出したと断らない');
      } else {
        if (q !== v['文']) g.条文.push(k + ' が写しの文と一字一句同じでない');
        if (!/（全文）$/.test(label)) g.条文.push(k + ' の条の名の行が、全文と断らない');
      }
      if (s.html.indexOf('<blockquote>' + escH(q.replace(/\n/g, ' ')) + '</blockquote>') < 0) g.条文.push(k + ' が生成した頁に一字一句出ていない');
    }
    Object.keys(T).filter((k) => !置いた.has(k)).forEach((k) => g.条文.push('写したが頁に置いていない：' + k));
    if (!印の数) g.条文.push('条文の印が無い');
    if (C && C.from) {
      if (s.md.indexOf('（コミット ' + String(C.from.commit).slice(0, 7) + '）') < 0) g.条文.push('写しのもとのコミットを書いていない');
      if (s.md.indexOf('e-Gov 法令 API から ' + C.from.fetched + ' に取り寄せた') < 0) g.条文.push('取り寄せた日と所を書いていない');
    }
    /* 地の文の「第N条」は、同じ行で前に出た法令の名の条として読み、写しにあること。名の無い条も落とす。 */
    const 名 = new Map();
    for (const [k, v] of Object.entries(T)) { const law = k.replace(/ 第.*$/, ''); 名.set(law, law); 名.set(v['法令名'], law); }
    const 名の並び = [...名.keys()].sort((a, b) => b.length - a.length);
    const 名の形 = 名の並び.length ? new RegExp('(' + 名の並び.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g') : null;
    s.md.split('\n').filter((l) => !/^>/.test(l) && !/^<!--/.test(l)).forEach((line) => {
      for (const m of line.matchAll(/第\s*(\d+)\s*条/g)) {
        const ns = 名の形 ? [...line.slice(0, m.index).matchAll(名の形)] : [];
        const law = ns.length ? 名.get(ns[ns.length - 1][1]) : null;
        const pre = law ? law + ' 第' + m[1] + '条' : null;
        if (!pre || !Object.keys(T).some((k) => k === pre || k.startsWith(pre + '第'))) g.条文.push('写しに無い条を挙げた：' + (pre || '名の無い 第' + m[1] + '条'));
      }
    });
    /* 略した名の前に、e-Gov が返した正式の名を書く。 */
    for (const [k, v] of Object.entries(T)) {
      const law = k.replace(/ 第.*$/, '');
      if (law !== v['法令名'] && !(s.md.indexOf(v['法令名']) >= 0 && s.md.indexOf(v['法令名']) < s.md.indexOf(law))) g.条文.push(law + ' の前に正式の名「' + v['法令名'] + '」が無い');
    }

    /* LICENSE からの引用。印の無い引用は、LICENSE の第 2 節 b 項の号の文で、前の行がその号を名指す。 */
    const 他 = s.md.replace(印, '');
    const ob = s.license.slice(s.license.indexOf('b. Other rights.'), s.license.indexOf('Section 3 –'));
    let 引用の数 = 0;
    for (const m of 他.matchAll(/([^\n]*)\n\n((?:> [^\n]*\n?)+)/g)) {
      引用の数++;
      const q = m[2].trimEnd().split('\n').map((l) => l.replace(/^> /, '')).join(' ');
      const n = (/LICENSE の第 2 節 b 項 (\d) 号/.exec(m[1]) || [])[1];
      const line = ob.split('\n').map((l) => l.trim()).find((l) => l.startsWith(n + '. '));
      if (!n || !line || !line.slice(3).startsWith(q)) g.引用.push('LICENSE の第 2 節 b 項の号に無い引用：' + q.slice(0, 30));
      else if (s.html.indexOf('<blockquote>' + escH(q) + '</blockquote>') < 0) g.引用.push('生成した頁に出ていない引用：' + q.slice(0, 30));
    }
    if (!引用の数) g.引用.push('LICENSE からの引用が無い');

    /* 書体。配るものは無く、名指す並びは style.css と同じ。 */
    if (/@font-face|url\(|@import/i.test(s.css)) g.書体.push('assets/style.css に @font-face・url(・@import がある');
    s.site.filter((f) => 書体の拡張子.test(f)).forEach((f) => g.書体.push('配る書体のファイル：' + f));
    for (const [rel, html] of Object.entries(s.pages)) {
      const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html) || [, ''])[1];
      if (/font-src/.test(csp)) g.書体.push(rel + ' の CSP に font-src がある');
    }
    const 並び = [...s.css.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim());
    const 書いた並び = 節(s.md, '### 書体').split('\n').filter((l) => /^- /.test(l)).map((l) => 符(l)[0]);
    if (!並び.length || JSON.stringify([...new Set(並び)].sort()) !== JSON.stringify([...書いた並び].sort())) g.書体.push('頁の並び ' + 書いた並び.length + ' / style.css の並び ' + new Set(並び).size);

    /* 配るファイル。表が site/ と過不足なく一致し、頁の数が合う。 */
    const 配る表 = 表(節(s.md, '## 配るファイル'));
    const 名乗り = 配る表.map((r) => 符(r[0])[0]);
    const 頁の数 = Number((/^`\*\.html`（(\d+) 頁）$/.exec((配る表.find((r) => /^`\*\.html`/.test(r[0])) || [''])[0]) || [])[1]);
    const 実際 = s.site.filter((f) => !/\.html$/.test(f));
    const html数 = s.site.filter((f) => /\.html$/.test(f)).length;
    if (頁の数 !== html数) g.配る.push('頁の数 名乗り ' + 頁の数 + ' / 実際 ' + html数);
    const 名乗り他 = 名乗り.filter((x) => x !== '*.html').sort();
    if (JSON.stringify(名乗り他) !== JSON.stringify(実際)) g.配る.push('表 ' + 名乗り他.join(', ') + ' / site/ ' + 実際.join(', '));

    /* 部品の表。行の名が決めた並びと同じで、ファイルの欄のファイルがあり、行ごとの事実が実際と合う。 */
    const 部品表 = 表(節(s.md, '## 部品の一覧'));
    if (JSON.stringify(部品表.map((r) => r[0])) !== JSON.stringify(部品)) g.部品.push('行の名：' + 部品表.map((r) => r[0]).join('・'));
    for (const r of 部品表) {
      if (r.length !== 5) g.部品.push(r[0] + ' の欄の数 ' + r.length);
      if (r[1] !== '無い') 符(r[1]).forEach((f) => { if (!fs.existsSync(path.join(ROOT, f))) g.部品.push(r[0] + ' のファイルが無い：' + f); });
    }
    const 全頁 = Object.entries(s.pages);
    for (const [rel, html] of 全頁) {
      if (/<img\b/i.test(html)) g.部品.push(rel + ' に <img> がある');
      const svg = (html.match(/<svg\b/g) || []).length, fig = (html.match(/<figure class="map-figure">\s*<svg\b/g) || []).length;
      if (svg !== fig) g.部品.push(rel + ' に図のほかの <svg> がある');
      if (/<link[^>]+rel="[^"]*icon[^"]*"/i.test(html)) g.部品.push(rel + ' にファビコンの指定がある');
      if (/<meta\b[^>]*(property|name)="(og|twitter):image/i.test(html)) g.部品.push(rel + ' に共有用の画像の指定がある');
      if (!/<a class="mark serif" href="[^"]*index\.html">正義論とアルゴリズム<\/a>/.test(html)) g.部品.push(rel + ' の頁の上のサイトの名が文字でない');
      const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html) || [, ''])[1];
      if (csp.indexOf("default-src 'none'") !== 0 || csp.indexOf("img-src 'self' data:;") < 0) g.部品.push(rel + ' の CSP');
      if (/<(img|script|iframe|video|audio|source|embed|object)\b[^>]*\s(src|data)="(https?:)?\/\//i.test(html)) g.部品.push(rel + ' が外のホストから読む');
      for (const l of html.match(/<link\b[^>]*>/g) || []) if (!/rel="canonical"/.test(l)) g.部品.push(rel + ' の <link>：' + l.slice(0, 40));
    }
    const 図 = (/<figure class="map-figure">[\s\S]*?<\/figure>/.exec(s.pages['index.html'] || '') || [''])[0];
    const svgだけ = (/<svg[\s\S]*?<\/svg>/.exec(図) || [''])[0];
    if (!svgだけ || /\bhref=|<image\b|<use\b|<foreignObject\b/.test(svgだけ)) g.部品.push('入口の図が無いか、外のものを指す');
    s.site.filter((f) => 画像の拡張子.test(f)).forEach((f) => g.部品.push('配る画像のファイル：' + f));
    if (!(s.theme.indexOf("'☀'") >= 0 && s.theme.indexOf("'☾'") >= 0 && s.build.indexOf('>☾</button>') >= 0)) g.部品.push('切り替えの記号が文字でない');
    const L = 色(s.css, /^:root \{([^}]*)\}/m), D = 色(s.css, /^:root\[data-theme="dark"\] \{([^}]*)\}/m);
    if (s.theme.indexOf("theme === 'dark' ? '" + D.bg + "' : '" + L.bg + "'") < 0 || s.build.indexOf('<meta name="theme-color" content="' + L.bg + '">') < 0) g.部品.push('theme-color が地の色と違う');
    if (JSON.stringify(s.assets) !== JSON.stringify(['style.css', 'theme.js'])) g.部品.push('assets/ ' + s.assets.join(', '));

    /* 見やすさ。いちばん低い組と比、動きを減らす設定、拡大と幅、代替テキストの決め。 */
    const 低 = (t) => {
      let best = null;
      for (const ground of 地の色) for (const ink of 文字の色) { const r = t[ink] && t[ground] ? 比(t[ink], t[ground]) : 0; if (!best || r < best[2]) best = [ink, ground, r]; }
      return best;
    };
    const [lI, lG, lR] = 低(L), [dI, dG, dR] = 低(D);
    const 書いた = 'いちばん低い組は、ライトの `--' + lI + '` と `--' + lG + '` で ' + lR.toFixed(2) + ':1、ダークの `--' + dI + '` と `--' + dG + '` で ' + dR.toFixed(2) + ':1 です';
    if (s.md.indexOf(書いた) < 0) g.見やすさ.push('数え直した比：' + 書いた);
    if (lR < 4.5 || dR < 4.5 || s.md.indexOf('WCAG の 4.5:1 以上の比があります') < 0) g.見やすさ.push('4.5:1');
    if (s.md.indexOf('文字の色（' + 文字の色.map((x) => '`--' + x + '`').join('・') + '）は、地の色（' + 地の色.map((x) => '`--' + x + '`').join('・') + '）に対して') < 0) g.見やすさ.push('数える色の名');
    const rm = (/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(s.css) || [, ''])[1];
    if (!/transition-duration: \.01ms !important/.test(rm) || s.md.indexOf('色の移り変わりの時間を 0.01ms に縮めます') < 0) g.見やすさ.push('動きを減らす設定');
    if (/@keyframes|animation\s*:/.test(s.css)) g.見やすさ.push('動きの効果がある');
    if (!/const WIDTHS = \[[^\]]*\b360\]/.test(s.keyboard) || !/const ZOOM_WIDTHS = \[[^\]]*\b360\]/.test(s.keyboard) || s.keyboard.indexOf("fontSize = '200%'") < 0) g.見やすさ.push('check_keyboard.js が 360px と 200% を測らない');
    if (s.contributing.indexOf('\n## 画像の代替テキスト\n') < 0) g.見やすさ.push('CONTRIBUTING.md に代替テキストの決めが無い');
    if (!/<title id="map-title">[^<]+<\/title>/.test(図) || !/<desc id="map-desc">[^<]+<\/desc>/.test(図)) g.見やすさ.push('入口の図に題と説明が無い');

    /* 頁の下の欄。どの頁からもこの頁へつなぎ、CC BY 4.0 と書く。sitemap.xml にも載る。 */
    for (const [rel, html] of 全頁) {
      const foot = (/<footer>([\s\S]*?)<\/footer>/.exec(html) || ['', ''])[1];
      const up = '../'.repeat(rel.split('/').length - 1);
      if (foot.indexOf('<a href="' + up + PAGE_HTML + '">デザインに関する法的な扱い</a>') < 0) g.下の欄.push(rel + ' からつないでいない');
      if (foot.indexOf('CC BY 4.0') < 0) g.下の欄.push(rel + ' に CC BY 4.0 が無い');
    }
    if (!s.pages[PAGE_HTML]) g.下の欄.push(PAGE_HTML + ' が生成されていない');

    /* 作者と記録。README の開示と許諾の表、登録の記録の有無、商標の節が挙げる名。 */
    if (s.readme.indexOf('言語モデルは著作者ではありません。') < 0) g.記録.push('README の「言語モデルは著作者ではありません。」');
    const lic = 表(節(s.readme, '## ライセンス'));
    if (!lic.some((r) => /本文/.test(r[0]) && /CC BY 4\.0/.test(r[1])) || !lic.some((r) => /生成のスクリプト/.test(r[0]) && /MIT/.test(r[1]))) g.記録.push('README のライセンスの表');
    if (lic.some((r) => /assets|style\.css|theme\.js/.test(r[0]))) g.記録.push('README のライセンスの表が assets/ を名指す（頁は名指されていないと書く）');
    for (const [f, t] of s.texts) if (/(商標|意匠)の?(出願|登録)|(出願|登録)番号/.test(t)) g.記録.push(f + ' に登録か出願の記録がある（頁は無いと書く）');
    const 名の行 = (s.md.split('\n').find((l) => /などです。$/.test(l)) || '').replace(/などです。$/, '');
    const 他の頁 = 全頁.filter(([rel]) => rel !== PAGE_HTML).map(([, h]) => h.replace(/<[^>]*>/g, '')).join('\n');
    const 名々 = 名の行.split('、').map((x) => x.trim()).filter(Boolean);
    if (!名々.length) g.記録.push('商標の節に名の行が無い');
    名々.filter((n) => 他の頁.indexOf(n) < 0).forEach((n) => g.記録.push('どの頁にも書いていない名：' + n));
    if (s.作者) {
      for (const f of 作者を見るファイル) if (JSON.stringify(s.作者[f]) !== JSON.stringify(['Claude'])) g.記録.push(f + ' の作者の欄：' + (s.作者[f] || []).join(', '));
    }
    if (s.md.indexOf(作者を見るファイル.map((f) => '`' + f + '`').join('、') + ' は、運営者の求めで Claude Code（Anthropic）が書きました。') < 0 || s.md.indexOf('この三つのファイルの作者の欄はどれも Claude です。') < 0 || 作者を見るファイル.length !== 3) g.記録.push('作者の文');
    return g;
  }

  const 今 = 問題13(状態);
  const 見出し = {
    写し: '条文の写しの各条の sha256 が文と合う（' + Object.keys((JSON.parse(状態.copy || '{}').texts) || {}).length + ' 条）' + (状態.もと ? '。写したもとのコミットの文と記録とも同じ' : '（写したもとのコミットが手元に無いので、文と sha256 だけを見た）'),
    条文: 'デザインの頁に置いた条文が、写しと一字一句同じか、その一部で、全文か切り出しかを断り、挙げた条がすべて写しにある',
    引用: 'デザインの頁の LICENSE からの引用が、LICENSE の第 2 節 b 項の号の文と同じ',
    書体: 'デザインの頁のとおり、書体を配らず、名指す並びが style.css と同じ',
    配る: 'デザインの頁の配るファイルの表が、site/ のファイルと過不足なく一致する',
    部品: 'デザインの頁の部品の表の行と事実（ロゴ・ファビコン・共有用の画像・図・記号・配色・外から読む素材）が、実際の頁と合う',
    見やすさ: 'デザインの頁の見やすさの節の比と設定が、style.css と check_keyboard.js から数え直したものと合う',
    下の欄: 'どの頁の下の欄も、デザインの頁へつなぎ、CC BY 4.0 と書く',
    記録: 'デザインの頁の作者・許諾・登録・名の記述が、README・リポジトリの記録・頁と合う' + (状態.作者 ? '' : '（浅い取り出しなので、作者の欄は見ていない）')
  };
  for (const k of Object.keys(見出し)) check(見出し[k], 今[k]);

  /* 壊して確かめる。どれか一つを壊すと、どれかの項目が落ちること。 */
  const 替 = (k, a, b) => Object.assign({}, 状態, { [k]: 状態[k].split(a).join(b) });
  const 頁替 = (rel, a, b) => Object.assign({}, 状態, { pages: Object.assign({}, 状態.pages, { [rel]: 状態.pages[rel].replace(a, b) }) });
  const 写し替 = (f) => { const c = JSON.parse(状態.copy); f(c); return Object.assign({}, 状態, { copy: JSON.stringify(c) }); };
  const 一条 = '著作権法 第21条';
  const 壊し = [
    ['写しの文を一字変える', 写し替((c) => { c.texts[一条]['文'] = c.texts[一条]['文'].replace('専有', '保有'); })],
    ['写しの文と sha256 をそろえて変える', 写し替((c) => { const t = c.texts[一条]['文'].replace('専有', '保有'); c.texts[一条]['文'] = t; c.texts[一条].sha256 = H(t); })],
    ['頁の全文の条を一字変える', 替('md', '著作権法 第21条（全文）\n\n> （複製権） 第二十一条 著作者は、その著作物を複製する権利を専有する。', '著作権法 第21条（全文）\n\n> （複製権） 第二十一条 著作者は、その著作物を複製する権利を有する。')],
    ['切り出しを全文と書く', 替('md', '著作権法 第20条（第1項を、写しの文から切り出しました）', '著作権法 第20条（全文）')],
    ['切り出しの印を外す', 替('md', '<!-- 条:著作権法 第19条:切り出し -->', '<!-- 条:著作権法 第19条 -->')],
    ['写しのもとのコミットを外す', 替('md', '（コミット 85dd680）', '')],
    ['写しに無い条を地の文に挙げる', 替('md', '\n## 人と団体\n', '\n著作権法第32条も関わります。\n\n## 人と団体\n')],
    ['名の無い条を挙げる', 替('md', '\n## 人と団体\n', '\n第5条も関わります。\n\n## 人と団体\n')],
    ['条を一つ頁から落とす', 替('md', /<!-- 条:商標法 第25条 -->[\s\S]*?\n\n> [^\n]*\n/.exec(状態.md)[0], '')],
    ['正式の名を外す', 替('md', '障害を理由とする差別の解消の推進に関する法律（以下、障害者差別解消法）', '障害者差別解消法')],
    ['LICENSE の引用を一語変える', 替('md', 'Patent and trademark rights are not licensed', 'Patent and trademark rights are licensed')],
    ['LICENSE の号を違える', 替('md', 'LICENSE の第 2 節 b 項 2 号', 'LICENSE の第 2 節 b 項 3 号')],
    ['style.css に @font-face を足す', 替('css', '* { box-sizing: border-box; }', '@font-face { font-family: X; src: local(X); }\n* { box-sizing: border-box; }')],
    ['本文の書体の並びから一つ外す', 替('css', '"Noto Sans JP", "Yu Gothic", system-ui', '"Noto Sans JP", system-ui')],
    ['頁の CSP に font-src を足す', 頁替('index.html', "default-src 'none';", "default-src 'none'; font-src 'self';")],
    ['site/ に画像を足す', Object.assign({}, 状態, { site: 状態.site.concat(['assets/logo.png']).sort() })],
    ['site/ に書体を足す', Object.assign({}, 状態, { site: 状態.site.concat(['assets/font.woff2']).sort() })],
    ['頁の数を違える', 替('md', '`*.html`（' + 状態.site.filter((f) => /\.html$/.test(f)).length + ' 頁）', '`*.html`（' + (状態.site.filter((f) => /\.html$/.test(f)).length + 1) + ' 頁）')],
    ['部品の表からファビコンの行を落とす', 替('md', /\n\| ファビコン \|[^\n]*/.exec(状態.md)[0], '')],
    ['頁にファビコンを足す', 頁替('index.html', '<link rel="canonical"', '<link rel="icon" href="favicon.ico">\n<link rel="canonical"')],
    ['頁に共有用の画像を足す', 頁替('index.html', '<meta name="robots"', '<meta property="og:image" content="og.png">\n<meta name="robots"')],
    ['頁に画像を足す', 頁替('index.html', '</main>', '<img src="x.png" alt="x"></main>')],
    ['図に外のものを指させる', 頁替('index.html', '</svg>', '<image href="x.png"></image></svg>')],
    ['外のスクリプトを読む', 頁替('index.html', '</body>', '<script src="https://cdn.example.org/x.js"></script></body>')],
    ['外の CSS を読む', 頁替('index.html', '<link rel="canonical"', '<link rel="stylesheet" href="https://fonts.example.org/x.css">\n<link rel="canonical"')],
    ['切り替えの記号を外す', 替('theme', "'☀'", "''")],
    ['theme-color を地の色と違える', 替('theme', "'#121214'", "'#000000'")],
    ['assets/ に他人の CSS を足す', Object.assign({}, 状態, { assets: 状態.assets.concat(['vendor.css']).sort() })],
    ['比を違える', 替('md', /で (\d\.\d\d):1、ダーク/.exec(状態.md)[0], 'で 9.99:1、ダーク')],
    ['動きを減らす設定を外す', 替('css', 'transition-duration: .01ms !important', 'transition-duration: .3s !important')],
    ['動きの効果を足す', 替('css', '* { box-sizing: border-box; }', '@keyframes x { from { opacity: 0; } }\n* { box-sizing: border-box; }')],
    ['頁の下の欄のつなぎを一頁から外す', 頁替('docs/map.html', '">デザインに関する法的な扱い</a>', '">デザイン</a>')],
    ['README の開示の一文を外す', 替('readme', '言語モデルは著作者ではありません。', '')],
    ['リポジトリに商標の登録の記録を足す', Object.assign({}, 状態, { texts: 状態.texts.concat([['docs/x.md', '2026 年に商標登録を出願しました。']]) })],
    ['作者の欄に別の人が入る', Object.assign({}, 状態, { 作者: Object.assign({}, 状態.作者 || Object.fromEntries(作者を見るファイル.map((f) => [f, ['Claude']])), { 'assets/style.css': ['Claude', 'someone'] }) })],
    ['名の行にどの頁にも無い名を足す', 替('md', 'Zenodo などです。', 'Zenodo、Figma などです。')]
  ];
  const 通った = 壊し.filter(([, x]) => Object.values(問題13(x)).every((v) => v.length === 0)).map(([n]) => n);
  check('壊して確かめる：デザインの頁の写し・条文・引用・書体・配るファイル・部品・見やすさ・下の欄・記録のどれを壊しても落ちる（'
    + (壊し.length - 通った.length) + ' / ' + 壊し.length + '）', 通った);
}

// 12. README が名乗るページ数と項目数が、実際と合うこと（決めごと 5）。
//    一度、ページと検査が増えたのに「17 ページを 5 項目で」のまま残っていた。
//    この項目自身も数に入れる。
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const claim = /生成物 (\d+) ページを (\d+) 項目で検査します/.exec(readme);
const total = checked + 1;
check('README が名乗るページ数と項目数が実際と合う',
  claim && Number(claim[1]) === pages.length && Number(claim[2]) === total
    ? []
    : ['名乗り ' + (claim ? claim[1] + ' ページ・' + claim[2] + ' 項目' : '無い')
       + ' / 実際 ' + pages.length + ' ページ・' + total + ' 項目']);

console.log();
if (failures.length) {
  console.log(failures.length + ' 項目が通りませんでした。');
  process.exit(1);
}
console.log('すべて通りました。');
