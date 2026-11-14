# 寄稿について

誤りの指摘、要約への異議、文献の追加を歓迎します。

## 方針

- どの立場が正しいかを決めません。 各立場を、その立場に立つ人が
  読んで不当だと感じない水準で記述することを目指します
- 一次文献に当たってください。 入門書の要約の要約にならないように
- 具体的な事例は論点の説明のために用います。 特定の企業や製品の
  是非を裁定する目的では扱いません

## 論点の項目を追加する

`docs/issues/` に次の形式で追加してください。

```markdown
# 論点の名前

## 何が問題か
規範的な問いとして定式化する。技術的な難しさではなく、
何が争われているのかを書く。

## 具体的な現れ方
実際の場面でどう立ち現れるか。箇条書きで 3 点程度。

## 各立場からの見え方
6 つの立場それぞれについて、評価とその根拠を 2〜3 文で。
立場が沈黙する論点であれば、その旨を書く。

## 未解決の点
どの立場でも答えが出ていない部分。

## 文献
著者、題名、発表年。可能なら DOI か恒久リンク。
```

追加したら、[docs/map.md](docs/map.md) の表にも 1 行足してください。

## 立場の項目を追加する

`docs/traditions/` に、**何を基準にするか / アルゴリズムとの関係 /
主な批判 / 文献** の順で書いてください。

## 文献の扱い

- 未確認のリンクを載せないでください
- 二次文献から引く場合は、その旨を明記してください
- 翻訳がある場合は併記すると読者の助けになります

## 画像の代替テキスト

サイトの頁に画像を置くときは、`alt` に、その画像が伝えている中身を書く。
「画像」「写真」「図」や image で始めない。ファイル名を書かない。
飾りだけの画像は `alt=""` にして、読み上げから外す。
文字を画像にしない。文字は文字で書く。
`verification/check_site.js` が、`alt` の無い画像と、決めに沿わない書き方を落とす。

## 突き合わせの受付 / Checked intake

2026-12-01 から、誤りの知らせ（`error-report.yml`）は「突き合わせの受付」で確かめる。
人が嘘をつくこと一般は、仕組みでは止められない。受けるのは、申し立てた人がその場で書けない出どころと突き合わせられる申し立てだけで、通らないものと確かめられないものは自動で退ける。
確かめるのは一つだけである。「書いてあること」の語が、「どこか」の欄に書いた所（このリポジトリのファイル、配っている頁、このリポジトリが写しを持つ DOI の PDF か翻刻）に、そのとおりにあること。空白の違いと文字の幅は見ない。頁や節は確かめず、文書の全体を探す。
あればラベル「quote verified」を付ける。それが誤りかどうかは、人が読んで決める。なければ、決まった文のコメントを付けて閉じる。新しい issue で出し直せる。
削除・権利・個人の情報・氏名・人についての記述・同意の撤回を求めると読める issue は、自動では閉じない。ラベル「needs a person」を付け、人が読む。
コメントと実行の記録は、決まった語と issue の番号だけを書き、issue に書かれたことを写さない。
道具は `.github/checked-intake/verify.js`、確かめる先は `.github/checked-intake/config.json` にある。

From 2026-12-01, error reports (`error-report.yml`) are checked by the checked intake.
No system can stop a person from lying in general. Only claims that can be checked against a source that the claimant does not write at the moment of claiming are accepted; a claim that fails, or cannot be checked, is turned away automatically.
One thing is checked: that the words under "What it says" occur, as written, at the location under "Where" (a file of this repository, a page that it serves, or the PDF or transcription of a DOI of which it holds a copy). Differences of white space and character width are ignored. The page or section is not checked; the whole document is searched.
If they occur, the label "quote verified" is added, and whether it is an error is decided by a person. If they do not, the issue is closed with a fixed comment, and a new issue can be opened.
An issue that reads as asking for removal, or concerning rights, personal data, a name, a statement about a person or the withdrawal of a consent, is never closed automatically; it gets the label "needs a person", and a person reads it.
Comments and logs carry only fixed words and the issue number, never what the issue says.
The script is `.github/checked-intake/verify.js`; what it checks against is in `.github/checked-intake/config.json`.
