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

function inline(text) {
  // コードは先に取り出して、他の変換から守る
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, function (m, c) {
    codes.push('<code>' + esc(c) + '</code>');
    return '%%CODE' + (codes.length - 1) + '%%';
  });

  s = esc(s);

  // 画像。リンクの中に置かれる（バッジ）ことがあるので、リンクより先に変換する
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
    '<img src="$2" alt="$1" loading="lazy">');

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
    fs.writeFileSync(dest, layout(pageTitle, render(md), depth));
  }

  fs.renameSync(path.join(OUT, 'README.html'), path.join(OUT, 'index.html'));
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'assets', 'theme.js'), path.join(OUT, 'assets', 'theme.js'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  console.log('生成しました: site/ (' + files.length + ' ページ)');
}

build();
