import { TextRange } from './types';

// 数式環境を検出するための正規表現
const MATH_ENV_REGEX = /(?:\\begin\{((?:equation|align|alignat|flalign|multline|gather|math|displaymath|tikzcd)\*?)\}[\s\S]*?\\end\{\1\})|(?:\\\[[\s\S]*?\\\])|(?:\\\([\s\S]*?\\\))|(?:(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$)|(?:(?<!\\)\$(?!\$)[\s\S]*?(?<!\\)\$)/g;

/**
 * ドキュメント全体からすべての数式環境の範囲を抽出する
 * @param text LaTeXドキュメント全体のテキスト
 * @returns 数式環境の範囲のリスト (出現順)
 */
export function getAllMathEnvs(text: string): TextRange[] {
    const mathEnvs: TextRange[] = [];
    
    MATH_ENV_REGEX.lastIndex = 0; 

    let match;
    while ((match = MATH_ENV_REGEX.exec(text)) !== null) {
        mathEnvs.push({
            start: match.index,
            end: match.index + match[0].length
        });
    }

    return mathEnvs;
}

/**
 * 指定したカーソル位置を含む数式環境の範囲を取得する
 * @param text LaTeXドキュメント全体のテキスト
 * @param cursorOffset カーソル位置（先頭からの文字数）
 * @param limitToCursorLine カーソル行の範囲内に制限するかどうか（デフォルト: true）
 * @returns カーソルを内包する数式環境の範囲（外にいる場合は null）
 */
export function getEnclosingMathEnv(
    text: string, 
    cursorOffset: number,
    limitToCursorLine: boolean = true
): TextRange | null {
    MATH_ENV_REGEX.lastIndex = 0; 

    let match;
    while ((match = MATH_ENV_REGEX.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        // カーソルがこの範囲内にいれば確定
        if (start <= cursorOffset && cursorOffset <= end) {
            
            if (limitToCursorLine) {
                // カーソル位置から前に遡って最初の改行を探す
                let lineStart = text.lastIndexOf('\n', cursorOffset - 1);
                lineStart = lineStart === -1 ? 0 : lineStart + 1;

                // カーソル位置から後ろに進んで最初の改行を探す
                let lineEnd = text.indexOf('\n', cursorOffset);
                lineEnd = lineEnd === -1 ? text.length : lineEnd;

                // CRLF(\r\n) 環境の考慮: \r が含まれていたら除外する
                if (lineEnd > 0 && text[lineEnd - 1] === '\r') {
                    lineEnd--;
                }

                // 「数式環境の範囲」と「カーソル行の範囲」の重なる部分（積集合）を返す
                return {
                    start: Math.max(start, lineStart),
                    end: Math.min(end, lineEnd)
                };
            }

            // オプションが無効な場合は、数式環境全体をそのまま返す
            return { start, end };
        }

        if (start > cursorOffset) {
            break;
        }
    }

    return null;
}