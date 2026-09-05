# 正義論とアルゴリズム

アルゴリズムによる判断をめぐる論点を、**政治哲学の正義論に接続して整理する**資料です。

「このアルゴリズムは公正か」という問いは、技術的な問いに見えて、実は
「そもそも公正とは何か」という古い問いを含んでいます。統計的な指標を
どれだけ精緻にしても、どの指標を選ぶべきかは指標そのものからは決まりません。
その選択の根拠は、正義をめぐる立場の違いに遡ります。

この資料は、**どの立場が正しいかを決めません**。論点ごとに、主要な立場から
どう見えるかを並べ、どこで意見が分かれるのかを示します。

## 読み方

はじめての方は **[この資料の読み方](docs/00-how-to-read.md)** から。
全体を見渡すなら **[対応表](docs/map.md)** が早いです。

### 正義をめぐる立場

何を最終的な基準に置くか。6 つの立場を扱います。

| | 基準 |
| --- | --- |
| [功利主義](docs/traditions/utilitarianism.md) | 効用の総和 |
| [義務論](docs/traditions/deontology.md) | 人格の尊重 |
| [リバタリアニズム](docs/traditions/libertarianism.md) | 自己所有と手続き |
| [公正としての正義（ロールズ）](docs/traditions/rawls.md) | 最も不利な立場 |
| [共同体論](docs/traditions/communitarianism.md) | 財の目的と共同体の価値 |
| [潜在能力アプローチ](docs/traditions/capability.md) | 実質的な自由 |

### アルゴリズムをめぐる論点

技術的な問いと規範的な問いが交わる場所。5 つの論点を扱います。

| | 何が争われているか |
| --- | --- |
| [公正性指標の両立不能性](docs/issues/fairness-metrics.md) | 妥当に見える公正性の定義が同時に満たせない |
| [差別的効果](docs/issues/disparate-impact.md) | 保護属性を除いても差別的な結果が生じる |
| [説明可能性](docs/issues/explainability.md) | 理由を示せない判断を人に用いてよいか |
| [答責性](docs/issues/accountability.md) | 害が生じたとき誰が責任を負うか |
| [自律とナッジ](docs/issues/autonomy.md) | 誘導はどこから操作になるか |

## 対応表（概観）

| 論点 | 功利主義 | 義務論 | リバタリアニズム | ロールズ | 共同体論 | 潜在能力 |
| --- | --- | --- | --- | --- | --- | --- |
| [公正性指標の両立不能性](docs/issues/fairness-metrics.md) | 総効用が最大の指標 | 人を手段にしない指標 | 契約自由が優先 | 最も不利な人を基準 | 共同体の目的次第 | 実質的な自由を回復する指標 |
| [差別的効果](docs/issues/disparate-impact.md) | 是正費用と便益を比較 | 意図がなくとも尊厳の侵害 | 結果の平等は求めない | 機会の公正な均等に反する | 歴史的不正の継承 | 潜在能力の剥奪 |
| [説明可能性](docs/issues/explainability.md) | 精度が落ちるなら不要 | 説明を受けるのは権利 | 契約に書かれていれば足りる | 公共的理由の要請 | 共同体への説明責任 | 異議申し立ての前提 |
| [答責性](docs/issues/accountability.md) | 抑止効果で配分 | 行為者に帰属 | 契約と過失で決まる | 制度の側の責任 | 役割に伴う責任 | 救済可能性を重視 |
| [自律とナッジ](docs/issues/autonomy.md) | 厚生が増えるなら可 | 操作は尊厳に反する | 干渉そのものが不当 | 反省的な受容が条件 | 善き生の構想に依存 | 選択能力を育てるか |

## この資料の限界

- 筆者は哲学と計算機科学の**学習者**であり、専門的な研究者ではありません
- 各立場の要約は入門的な水準で、原典の議論を単純化しています
- 文献表は主要なものに限っています。**論点編（`docs/issues/`）の 14 件は、DOI・arXiv 番号・
  一次 URL をすべて出版社側の記載と照合しました**（照合方法は下記）。立場編（`docs/traditions/`）は
  古典的な単行本が中心のため、書誌情報のみで識別子は付していません

誤りの指摘や、立場の要約への異議は歓迎します。[CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

### 識別子をどう確かめたか

**記憶から書いていません。** 一件ずつ検索し、**出版社・学会・索引の側が出している記載**と
突き合わせたものだけを載せています。判断基準は「DOI がその出版社の URL に埋まっているか」です
（`journals.sagepub.com/doi/10.1177/…`、`link.springer.com/article/10.1007/…`、
`dl.acm.org/doi/10.1145/…` のように）。

Barocas & Selbst については、法学雑誌側の DOI が URL で裏づけられなかったため、
**裏づけの取れた SSRN の DOI を採りました。** 確認できないものを、それらしい形で書くよりは、
確認できたものを書くほうが正確です。

## 引用

この資料は Zenodo にアーカイブされ、DOI が付与されています。

> 根本卓哉 (2026). *正義論とアルゴリズム — アルゴリズムによる判断をめぐる論点の整理*. Zenodo. https://doi.org/10.5281/zenodo.22335676

```bibtex
@misc{nemoto2026justice,
  author       = {Nemoto, Takuya},
  title        = {正義論とアルゴリズム — アルゴリズムによる判断をめぐる論点の整理},
  year         = {2026},
  publisher    = {Zenodo},
  doi          = {10.5281/zenodo.22335676},
  url          = {https://doi.org/10.5281/zenodo.22335676}
}
```

## サイトの生成

`docs/` の Markdown から、読み物としての HTML を生成できます。

```bash
node build.js     # site/ に出力されます
```

依存パッケージはありません。`main` への push で GitHub Actions が自動的に
ビルドし、GitHub Pages へ配信します。

## ライセンス

© 2026 根本卓哉（Takuya Nemoto）— [CC BY 4.0](LICENSE)。出典を示せば自由に利用・改変できます。

## 制作について

[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-D97757?style=for-the-badge&logo=claude&logoColor=white)](https://claude.com/claude-code)
[![Assisted by Grok](https://img.shields.io/badge/Assisted%20by-Grok-111111?style=for-the-badge)](https://grok.com)

本資料の草稿は、AIコーディング支援ツール **Claude Code**（Anthropic）を
使用して作成しています。以降の最適化と運用支援には **Grok**（xAI）を
用いています。内容の確認、立場の要約の妥当性の判断、および
公開の可否は著者・根本卓哉（Takuya Nemoto）が行っています。AI は著作者ではありません。

制作過程はリポジトリの履歴から確認できます（`git log --author=Claude`、
および各コミットの `Claude-Session:` / `Assisted-by:` トレーラ）。
