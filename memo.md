# LaTeX Conceal 設計メモ

## やりたいこと

LaTeXの数式をVSCode上で見やすく表示するvscode extensionを作りたい．
$$
\alpha^2 + \beta^2 = \gamma^2 -> α² + β² = γ²
$$
カーソルが合っているところだけを展開して編集できるようにする

## 必要な機能

- 数式の場所を特定する
-> latex-utensilsが使えるけど，一旦なしでいいや
- 数式を置換するロジック
-> 変換するだけならどうにかなる．カーソルの位置とかを考慮するとどうだろう？
- 数式を表示する
-> VSCodeのDecoration APIが使える．ただし，数式のサイズとかを考慮してうまくやる必要がある．
- カーソルが数式の中にきたとき，それを展開
- カーソルが数式から離れたとき，元のLaTeX表示に戻す
-> 数式環境の特定が大変そうなので，行単位でやるのが現実的かも
- コマンドパレットやショートカットキーで，元のLaTeX表示に戻せる機能
- Debounce処理・可視領域のみの更新 -> 数式からカーソルが離れたときに元の表示に戻すので必要ない
- revealに二種類のモード
   1. カーソルがある行だけ展開
   2. 全く展開しない -> カーソルの位置制御が複雑になるのでやらない
   しかし拡張性は残したい．


実装として2パターン考えられる

### パターン1

クリックした位置 -> 変換後の文字列における位置 -> 変換前の位置
というマッピングを作る．

数式はそのまま全体を置換する．
$$
\alpha^2 + \beta^2 = \gamma^2 -> α² + β² = γ²
$$

### パターン2

Decorationを個々の文字に対して行う．
$$
\alpha -> α, \beta -> β, \gamma -> γ
$$
この場合，クリックした位置 -> 変換前の位置のマッピングはvscodeのAPIで提供される．
複雑な変換はできない．

-> パターン2を採用する．

## フロー


### フローA (テキスト編集時)

1. Debounce処理 `extension.ts/onDidChangeTextDocument(event)` 
2. 影響範囲の特定(event.contentChanges) `core/mathenv.ts/getAffectedRanges(contentChanges[])`
3. シフト計算で後ろにある数式の位置を更新 `core/replace.ts/updateConcealToken(text, range)`
4. 部分再パース(影響範囲の行だけ) `core/replace.ts/getConcealTokens(text)`
-> ただし大変なので，まずは完全再パースでやる． 
5. decorationCacheの更新 `stateManager.ts/setDecorationCache(concealTokens[])`
6. フローX `decorator.ts/applyConceal(editor, decorationCache[])`


### フローB (カーソル移動時)

1. カーソル位置の取得 `extension.ts/onDidChangeTextEditorSelection(event)`
2. フローX `decorator.ts/applyConceal(editor, decorationCache[])`

### フローC (ファイルオープン時・コマンド実行時)

1. イベントハンドリング `extension.ts/onDidOpenTextDocument(document)` `extension.ts/commandPaletteHandler()`
2. 完全パース `core/replace.ts/getConcealTokens(text)`
3. decorationCacheの更新 `stateManager.ts/setDecorationCache(concealTokens[])`
4. フローX  `decorator.ts/applyConceal(editor, decorationCache[])`


### フローX (Decorationの更新)

1. cursor位置の取得 
2. cursor位置からreveal範囲の特定 `core/mathenv.ts/getEnclosingMathEnv(text, cursorPosition)`
3. decrationCacheからReveal範囲を除いた部分をapply  `decorator.ts/applyConcealWithReveal(editor, decorationCache[], revealRanges[])`


## とりあえず一旦完成
あとやること

- [ ] α の右の方をクリックしたら\alphaの右側に，αの左をクリックしたら\alphaの左側にカーソルが来るようにする
- [ ] 数式の色を元のテキストと同じにする
- [Done] コマンドパレットから「全て展開」「全て隠す」みたいな機能を追加
- [ ] 単純なreplacementだけじゃなくて，\ang{a} -> 〈 a 〉 , \xrightarrow{a} -> →{a} みたいな正規表現ベースの置換を可能に
- [ ] \frac{a}{b} -> a/b みたいな置換も可能にする
- [ ] 部分的な更新ロジックを実装する（例: 変更された行だけ再パース）
- [ ] \newcommand, \renewcommand等を読んで自動的に置換ルールを追加する
- [ ] latex-utensilsを使って数式環境を正確に特定する
- [ ] multi-cursor対応
- [ ] 一切展開しないモードを追加し，カーソルの位置制御をする(さすがに大変かも)