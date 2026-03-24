import * as vscode from 'vscode';
import { AppConfig, ConcealToken, TextRange } from './core/types';

// VSCodeの装飾オブジェクト（再利用可能）
let concealDecorationType: vscode.TextEditorDecorationType | undefined;

// テーマカラー指定（editor.foreground等）またはHex色の検証と解析
function resolveReplacementColor(config: AppConfig): string | vscode.ThemeColor {
    if (config.replacementColor.includes('.')) {
        return new vscode.ThemeColor(config.replacementColor);
    }

    if (/^#([0-9A-F]{3}){1,2}$/i.test(config.replacementColor)) {
        return config.replacementColor;
    }

    console.warn(`Invalid replacementColor "${config.replacementColor}" in config. Falling back to default theme color.`);
    return new vscode.ThemeColor('editor.foreground');
}

export function updateDecorationStyle(config: AppConfig | undefined) {
    if (!config) {
        return;
    }
    if (concealDecorationType) {
        concealDecorationType.dispose();
    }
    // Decoration API: 元のテキストを透明にし、before要素で置換文字を挿入
    concealDecorationType = vscode.window.createTextEditorDecorationType({
        // 元のテキスト（例:\alpha）を透明で0pxフォント化して非表示
        color: 'transparent',
        textDecoration: 'none; font-size: 0px;',
        // ClosedClosedによりテキスト挿入時に装飾範囲がズレるのを防止
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        before: {
            // 挿入する文字（例：α）の色と見た目
            color: resolveReplacementColor(config),
            textDecoration: 'none; font-size: var(--vscode-editor-font-size);',
        }
    });
}

// キャッシュされたトークンから展開対象（Reveal）を除外してエディタに適用する
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
        // 展開対象範囲と重なっているかを判定
        const isRevealed = revealRanges ? revealRanges.some(r => 
            token.start < r.end && token.end > r.start
        ) : false;
        // 展開対象でない場合のみ装飾を適用
        if (!isRevealed) {
            decorationsToApply.push({
                range: new vscode.Range(
                    document.positionAt(token.start),
                    document.positionAt(token.end)
                ),
                renderOptions: {
                    before: {
                        contentText: token.replacement
                    }
                }
            });
        }
    }
    editor.setDecorations(concealDecorationType, decorationsToApply);
}