import { getEnclosingMathEnv } from './mathenv';
import { ConcealToken, RevealConfig, TextRange } from './types';

/**
 * カーソル位置に基づいて、展開（Reveal）すべき範囲を計算する関数
 * @param text ドキュメント全体のテキスト
 * @param cursorOffsets カーソル位置のオフセット（複数選択に対応）
 * @param cachedTokens ドキュメント全体の置換対象トークン（キャッシュ）
 * @param config Revealの動作モードを指定するコンフィグ
 * @returns 展開すべき範囲のリスト
 */
export function getRevealRanges(
    text: string,
    cursorOffsets: number[],
    cachedTokens: ConcealToken[],
    config: RevealConfig
): TextRange[] {
    const revealRanges: TextRange[] = [];

    for (const offset of cursorOffsets) {
        
        if (config.revealBehavior === 'token') {
            const activeToken = cachedTokens.find(
                token => token.start <= offset && offset <= token.end
            );
            if (activeToken) {
                revealRanges.push(activeToken);
            }
            
        } else if (config.revealBehavior === 'environment' ) {
            const envRange = getEnclosingMathEnv(text, offset, true);
            if (envRange) {
                revealRanges.push(envRange);
            }
        } else if (config.revealBehavior === 'line') {
            let lineStart = text.lastIndexOf('\n', offset - 1);
            lineStart = lineStart === -1 ? 0 : lineStart + 1;

            let lineEnd = text.indexOf('\n', offset);
            lineEnd = lineEnd === -1 ? text.length : lineEnd;

            if (lineEnd > 0 && text[lineEnd - 1] === '\r') {
                lineEnd--;
            }

            revealRanges.push({ start: lineStart, end: lineEnd });
        }
    }

    return revealRanges;
}