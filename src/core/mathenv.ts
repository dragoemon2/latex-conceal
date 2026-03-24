import { TextRange } from './types';

const MATH_ENV_REGEX = /(?:\\begin\{((?:equation|align|alignat|flalign|multline|gather|math|displaymath|tikzcd)\*?)\}[\s\S]*?\\end\{\1\})|(?:\\\[[\s\S]*?\\\])|(?:\\\([\s\S]*?\\\))|(?:(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$)|(?:(?<!\\)\$(?!\$)[\s\S]*?(?<!\\)\$)/g;

/**
 * ドキュメント全体から数式環境の範囲を抽出する関数
 * @param text ドキュメント全体のテキスト
 * @returns 数式環境の範囲のリスト
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
 * カーソル位置に基づいて，最も内側の数式環境の範囲を抽出する関数
 * @param text ドキュメント全体のテキスト
 * @param cursorOffset カーソル位置のオフセット
 * @param limitToCursorLine trueの場合，カーソル行内に収まる範囲に制限する（行を跨いでいる場合はその部分のみを返す）
 * @returns 最も内側の数式環境の範囲（見つからない場合はnull）
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

        if (start <= cursorOffset && cursorOffset <= end) {
            if (limitToCursorLine) {
                let lineStart = text.lastIndexOf('\n', cursorOffset - 1);
                lineStart = lineStart === -1 ? 0 : lineStart + 1;
                let lineEnd = text.indexOf('\n', cursorOffset);
                lineEnd = lineEnd === -1 ? text.length : lineEnd;
                if (lineEnd > 0 && text[lineEnd - 1] === '\r') {
                    lineEnd--;
                }
                return {
                    start: Math.max(start, lineStart),
                    end: Math.min(end, lineEnd)
                };
            }
            return { start, end };
        }
        if (start > cursorOffset) {
            break;
        }
    }
    return null;
}