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

// <style> と <script> の中身は見ない。CSS のコメント区切りが * を含むため。
function bodyOnly(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');
}

const failures = [];

function check(label, hits) {
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

console.log();
if (failures.length) {
  console.log(failures.length + ' 項目が通りませんでした。');
  process.exit(1);
}
console.log('すべて通りました。');
