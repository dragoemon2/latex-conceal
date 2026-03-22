import * as vscode from 'vscode';
import { ConcealToken, TextRange } from './core/types';


// 装飾オブジェクトを保持する変数
let concealDecorationType: vscode.TextEditorDecorationType | undefined;

/**
 * 装飾のスタイルを初期化・更新する
 */
export function updateDecorationStyle() {
    // 古いスタイルが残っていたら破棄（メモリリーク防止）
    if (concealDecorationType) {
        concealDecorationType.dispose();
    }

    // VSCodeのDecoration APIを使ったConcealのハック設定
    concealDecorationType = vscode.window.createTextEditorDecorationType({
        // 元のテキスト（例: \alpha）を見えなくする
        color: 'transparent',
        textDecoration: 'none; font-size: 0px;', 
        
        before: {
            // 置換後の文字（例: α）の色を設定
            color: new vscode.ThemeColor('editor.foreground'),
            // 擬似要素として表示するため，元の文字サイズに戻す
            textDecoration: 'none; font-size: var(--vscode-editor-font-size);',
        }
    });
}

/**
 * キャッシュされたトークンから、展開対象（Reveal）を除外してエディタに適用する
 * @param editor 対象のテキストエディタ
 * @param decorationCache ドキュメント全体の置換対象トークン
 * @param revealRanges 展開（元のコードを表示）すべき範囲のリスト
 */
export function applyConceal(
    editor: vscode.TextEditor,
    decorationCache: ConcealToken[],
    revealRanges?: TextRange[]
) {
    if (!concealDecorationType) {
        if (concealDecorationType) {
            editor.setDecorations(concealDecorationType, []);
        }
        return;
    }

    const document = editor.document;
    const decorationsToApply: vscode.DecorationOptions[] = [];

    for (const token of decorationCache) {
        const isRevealed = revealRanges ? revealRanges.some(r => 
            token.start < r.end && token.end > r.start
        ) : false;

        // 3展開対象「ではない」場合のみ、VSCodeの装飾オブジェクトを生成する
        if (!isRevealed) {
            decorationsToApply.push({
                range: new vscode.Range(
                    document.positionAt(token.start),
                    document.positionAt(token.end)
                ),
                renderOptions: {
                    before: {
                        contentText: token.replacement // 差し込む文字（例: 'α'）
                    }
                }
            });
        }
    }

    editor.setDecorations(concealDecorationType, decorationsToApply);
}