#!/usr/bin/env node
/**
 * docs/ の Markdown を静的な HTML に変換して site/ に書き出す。
 * 依存パッケージはなく、Node.js だけで動く。
 *
 * 対応する記法は、この資料で実際に使っているものに限る。
 *   見出し / 段落 / 箇条書き / 番号付き / 表 / 引用 / 水平線
 *   強調 / コード / リンク / コードブロック
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'site');

const SITE_NAME = '正義論とアルゴリズム';
const DOI = '10.5281/zenodo.22335676';
const REPO = 'https://github.com/cpsbvbng26-dotcom/justice-and-algorithms';
const REPO_BLOB = REPO + '/blob/main/';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* ---------------------------------------------------------------- *
 * 行内の記法
 * ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- *
 * Content-Security-Policy
 *
 * このサイトは外部から何も読み込まない。それを「そう書いてある」ではなく
 * ブラウザが強制する制約にする。default-src 'none' から始めて、実際に
 * 使っているものだけを名指しで許す。
 *
 * インラインの <style> <script> は中身の SHA-256 で許す。'unsafe-inline'
 * は使わない —— 使えば注入されたスクリプトも通り、置く意味が無くなる。
 * 生成のたびに計算し直すので、中身を変えても入れ直す手間はない。
 * ---------------------------------------------------------------- */
function withCSP(html) {
  const sha = (t) =>
    "'sha256-" + crypto.createHash('sha256').update(t, 'utf8').digest('base64') + "'";
  const blocks = (tag) => {
    const re = new RegExp('<' + tag + '(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)</' + tag + '>', 'g');
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) out.push(sha(m[1]));
    return out;
  };
  const csp = [
    "default-src 'none'",
    "script-src 'self' " + blocks('script').join(' '),
    'style-src ' + blocks('style').join(' '),
    "img-src 'self' data:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'"
  ].join('; ').replace(/\s+/g, ' ').replace(/ ;/g, ';');

  const tag = '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n';
  return html.replace(/(<meta name="viewport"[^>]*>\n?)/, '$1' + tag);
}

function inline(text) {
  // コードは先に取り出して、他の変換から守る
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, function (m, c) {
    codes.push('<code>' + esc(c) + '</code>');
    return '%%CODE' + (codes.length - 1) + '%%';
  });

  s = esc(s);

  // 画像。リンクの中に置かれる（バッジ）ことがあるので、リンクより先に変換する。
  //
  // 外部ホストの画像は <img> にせず、代替テキストだけを残す。生成したサイトが
  // third-party へリクエストを出さないようにするため。README のバッジはこの経路を
  // 通るので、GitHub 上ではバッジのまま、サイト上ではリンクつきの文字列になる。
  // 言語モデル利用の開示のような中身のある記述が、画像の読み込み可否に左右されないほうがよい。
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, src) {
    if (/^https?:/.test(src)) return alt;
    return '<img src="' + src + '" alt="' + alt + '" loading="lazy">';
  });

  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
    let to = href;
    let external = /^https?:/.test(href);

    if (!external && !/^#/.test(href)) {
      if (/\.md(#|$)/.test(href)) {
        to = href.replace(/\.md(#|$)/, '.html$1');       // 変換済みのページへ
      } else {
        to = REPO_BLOB + href.replace(/^\.\//, '');      // 変換対象外のファイルは元の場所へ
        external = true;
      }
    }

    const attrs = external ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + to + '"' + attrs + '>' + label + '</a>';
  });

  // <https://example.com/> の形の自動リンク。esc 済みなので山括弧は実体参照になっている
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>');

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  return s.replace(/%%CODE(\d+)%%/g, function (m, i) { return codes[Number(i)]; });
}

/* ---------------------------------------------------------------- *
 * ブロック
 * ---------------------------------------------------------------- */

function render(md) {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = [];
  let i = 0;

  const isTableSep = (l) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.indexOf('-') !== -1;
  const isBlockStart = (l) =>
    /^(#{1,4}\s|```|>|[-*]\s|\d+\.\s)/.test(l) || /^---+$/.test(l.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // コードブロック
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }

    // 水平線
    if (/^---+$/.test(line.trim())) { out.push('<hr>'); i++; continue; }

    // 見出し
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push('<h' + level + '>' + inline(h[2].trim()) + '</h' + level + '>');
      i++;
      continue;
    }

    // 表
    if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim()) {
        body.push(cells(lines[i++]));
      }
      out.push('<div class="table-wrap"><table><thead><tr>'
        + head.map((c) => '<th>' + inline(c) + '</th>').join('')
        + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>');
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push('<blockquote>' + inline(buf.join(' ')) + '</blockquote>');
      continue;
    }

    // 箇条書き・番号付き
    const bullet = /^[-*]\s+/;
    const ordered = /^\d+\.\s+/;
    if (bullet.test(line) || ordered.test(line)) {
      const tag = bullet.test(line) ? 'ul' : 'ol';
      const re = bullet.test(line) ? bullet : ordered;
      const items = [];
      while (i < lines.length
             && (re.test(lines[i]) || (items.length && /^\s{2,}\S/.test(lines[i])))) {
        if (re.test(lines[i])) items.push(lines[i++].replace(re, ''));
        else items[items.length - 1] += ' ' + lines[i++].trim();   // 継続行
      }
      out.push('<' + tag + '>'
        + items.map((t) => '<li>' + inline(t) + '</li>').join('')
        + '</' + tag + '>');
      continue;
    }

    // 段落
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])
           && !(lines[i].indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i++]);
    }
    if (buf.length) out.push('<p>' + inline(buf.join(' ')) + '</p>');
    else i++;
  }

  return out.join('\n');
}

/* ---------------------------------------------------------------- *
 * 立場と論点の図
 *
 * 入口の頁に、六つの立場と五つの論点の対応を一枚の図で置く。
 * 線は docs/map.md の「論点との交差」の表（最も強く反応する立場）から引く。
 * 図を手で描かない。表を直せば図も変わり、check_site.js が表と図を突き合わせる。
 *
 * 立場の名は「何を最終的な基準に置くか」の表の名に揃える。交差の表が別の名で
 * 呼んでいるとき（ロールズ）は、リンク先の頁の題に含まれる名で引き当てる。
 * 引き当てられない名があれば、生成を止める。
 * ---------------------------------------------------------------- */

function tableAfter(md, heading) {
  const i = md.indexOf(heading);
  if (i < 0) throw new Error('docs/map.md に「' + heading + '」がありません');
  const lines = md.slice(i).split('\n');
  const k = lines.findIndex((l) => l.startsWith('|'));
  const rows = [];
  for (let j = k + 2; j < lines.length && lines[j].startsWith('|'); j++) {
    rows.push(lines[j].replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  }
  return rows;
}

function mapData() {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'map.md'), 'utf8');
  const link = (c) => /^\[([^\]]+)\]\(([^)]+)\)$/.exec(c) || [c, c, ''];
  const traditions = tableAfter(md, '## 何を最終的な基準に置くか').map((r) => {
    const m = link(r[0]);
    const doc = m[2] ? fs.readFileSync(path.join(ROOT, 'docs', m[2]), 'utf8') : '';
    return { name: m[1], title: (/^#\s+(.*)$/m.exec(doc) || [, ''])[1], basis: r[1], question: r[2] };
  });
  const resolve = (n) => {
    const t = traditions.find((x) => x.name === n) || traditions.find((x) => x.title.indexOf(n) >= 0);
    if (!t) throw new Error('docs/map.md の交差の表の「' + n + '」を、立場の表に引き当てられません');
    return t.name;
  };
  const issues = tableAfter(md, '## 論点との交差').map((r) => ({
    name: link(r[0])[1],
    strongest: r[1].split('/').map((x) => resolve(x.trim()))
  }));
  return { traditions, issues };
}

function mapFigure() {
  const { traditions, issues } = mapData();
  const W = 430, top = 44, gap = 44, lx = 140, rx = 255;
  const ly = (i) => top + i * gap + (issues.length > traditions.length ? (issues.length - traditions.length) * gap / 2 : 0);
  const ry = (i) => top + i * gap + (traditions.length > issues.length ? (traditions.length - issues.length) * gap / 2 : 0);
  const H = top + Math.max(traditions.length, issues.length) * gap - gap / 2;
  const out = [];
  const pairs = [];
  issues.forEach((iss, i) => iss.strongest.forEach((t) => pairs.push([t, iss.name, i])));
  out.push('<figure class="map-figure">');
  out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="map-title map-desc">');
  out.push('<title id="map-title">立場と論点の対応</title>');
  out.push('<desc id="map-desc">' + esc(issues.map((x) => x.name + 'に最も強く反応する立場は、' + x.strongest.join('と') + '。').join('')) + '</desc>');
  out.push('<text class="map-head" x="' + lx + '" y="16" text-anchor="end">立場</text>');
  out.push('<text class="map-head" x="' + rx + '" y="16">論点</text>');
  for (const [t, iss, i] of pairs) {
    const a = traditions.findIndex((x) => x.name === t);
    out.push('<line data-from="' + esc(t) + '" data-to="' + esc(iss) + '" x1="' + (lx + 8) + '" y1="' + (ly(a) - 5)
      + '" x2="' + (rx - 8) + '" y2="' + (ry(i) - 5) + '"></line>');
  }
  traditions.forEach((t, i) => {
    out.push('<circle cx="' + (lx + 8) + '" cy="' + (ly(i) - 5) + '" r="3"></circle>');
    out.push('<text data-node="立場" x="' + lx + '" y="' + ly(i) + '" text-anchor="end">' + esc(t.name) + '</text>');
  });
  issues.forEach((x, i) => {
    out.push('<circle cx="' + (rx - 8) + '" cy="' + (ry(i) - 5) + '" r="3"></circle>');
    out.push('<text data-node="論点" x="' + rx + '" y="' + ry(i) + '">' + esc(x.name) + '</text>');
  });
  out.push('</svg>');
  out.push('<figcaption>線は、<a href="docs/map.html">対応表</a>の「論点との交差」で、その論点に最も強く反応するとされた立場を結んでいます。図は表から <code>build.js</code> が描いています。</figcaption>');
  out.push('</figure>');
  return out.join('\n');
}

/* ---------------------------------------------------------------- *
 * 読むのにかかる時間の目安
 *
 * 頁の本文の字数から計算する。数を手で書かない（決めごと 5）。
 * 数えるのは、本文からタグと空白とコードブロックを除いた字。一分に 500 字として割り、切り上げる。
 * check_site.js が同じ数え方で数え直し、頁に書いた数と突き合わせる。
 * ---------------------------------------------------------------- */
const PER_MINUTE = 500;
function countChars(html) {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
    .replace(/<figure[\s\S]*?<\/figure>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;|&#\d+;/g, 'x')
    .replace(/\s+/g, '')
    .length;
}
function withReadingTime(body) {
  const n = countChars(body);
  const p = '<p class="reading-time">読むのにかかる時間の目安は約 ' + Math.ceil(n / PER_MINUTE)
    + ' 分です（本文 ' + n + ' 字を、一分に ' + PER_MINUTE + ' 字として build.js が数えました）。</p>';
  return /<\/h1>/.test(body) ? body.replace(/<\/h1>/, '</h1>\n' + p) : p + '\n' + body;
}

/* ---------------------------------------------------------------- *
 * 出力
 * ---------------------------------------------------------------- */

const NAV = [
  ['index.html', '概観'],
  ['docs/00-how-to-read.html', '読み方'],
  ['docs/traditions/README.html', '立場'],
  ['docs/issues/README.html', '論点'],
  ['docs/map.html', '対応表']
];

function layout(title, body, depth) {
  const up = '../'.repeat(depth);
  const nav = NAV.map((n) => '      <a href="' + up + n[0] + '">' + n[1] + '</a>').join('\n');
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'style.css'), 'utf8');

  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>' + esc(title) + '</title>',
    '<meta name="description" content="アルゴリズムによる判断をめぐる論点を、政治哲学の正義論に接続して整理する資料。">',
    '<meta name="robots" content="index, follow">',
    '<meta name="theme-color" content="#faf9f7">',
    '<style>',
    css,
    '</style>',
    '</head>',
    '<body>',
    '',
    '<a class="skip-link" href="#main">本文へスキップ</a>',
    '',
    '<header>',
    '  <div class="wrap head-row">',
    '    <a class="mark serif" href="' + up + 'index.html">正義論とアルゴリズム</a>',
    '    <nav class="nav">',
    nav,
    '      <button id="themeToggle" class="theme-toggle" type="button" aria-label="テーマを切り替える">☾</button>',
    '    </nav>',
    '  </div>',
    '</header>',
    '',
    '<main id="main" class="wrap prose" tabindex="-1">',
    body,
    '</main>',
    '',
    '<footer>',
    '  <div class="wrap foot">',
    '    <span>CC BY 4.0 &nbsp;/&nbsp; <a href="https://doi.org/' + DOI + '">' + DOI + '</a></span>',
    '    <span><a href="' + REPO + '">GitHub</a></span>',
    '  </div>',
    '</footer>',
    '',
    '<script src="' + up + 'assets/theme.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function build() {
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (['.git', '.github', 'site', 'assets'].indexOf(name) === -1) walk(full);
      } else if (name.endsWith('.md')) {
        files.push(full);
      }
    }
  })(ROOT);

  fs.rmSync(OUT, { recursive: true, force: true });

  for (const src of files) {
    const rel = path.relative(ROOT, src).replace(/\.md$/, '.html');
    const dest = path.join(OUT, rel);
    const md = fs.readFileSync(src, 'utf8');
    const m = md.match(/^#\s+(.*)$/m);
    const title = m ? m[1] : SITE_NAME;
    const depth = rel.split(path.sep).length - 1;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const pageTitle = title === SITE_NAME ? SITE_NAME : title + ' | ' + SITE_NAME;
    /* 図の印。render() は注釈を落とすので、その前に段落の印へ替えておく。 */
    const FIG = '<!-- 図:立場と論点 -->';
    let body = render(md.split(FIG).join('%%MAPFIGURE%%'));
    body = body.replace('<p>%%MAPFIGURE%%</p>', mapFigure);
    body = withReadingTime(body);
    fs.writeFileSync(dest, withCSP(layout(pageTitle, body, depth)));
  }

  fs.renameSync(path.join(OUT, 'README.html'), path.join(OUT, 'index.html'));
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'assets', 'theme.js'), path.join(OUT, 'assets', 'theme.js'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  console.log('生成しました: site/ (' + files.length + ' ページ)');
}

build();
