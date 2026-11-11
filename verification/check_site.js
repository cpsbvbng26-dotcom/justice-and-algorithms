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
    ['docs/map.md', '結論そのものではなく、結論に至る根拠の違いに注目してください。'],
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
