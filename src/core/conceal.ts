import replaceData from '../default_settings/replace_data.json';
import { ConcealConfig, ConcealToken, TextRange } from './types';

// 置換ルールを取得
export function initializeConcealConfig(customReplacements: Record<string, string> = {}): ConcealConfig {
    const mergedReplacements = { ...replaceData.REPLACEMENTS, ...customReplacements };
    const sortedReplacements = Object.entries(mergedReplacements).sort((a, b) => b[0].length - a[0].length);
    
    return {
        replacements: new Map(sortedReplacements),
        combiningMarks: new Map(Object.entries(replaceData.COMBININGMARKS)),
        subSuperscripts: new Map(Object.entries(replaceData.SUBSUPERSCRIPTS)),
    };
}

/**
 * テキスト全体から置換トークンのリストを生成する
 * @param text 置換対象のテキスト
 * @param config 置換ルールのコンフィグ
 * @param ranges 置換を適用するテキストの範囲のリスト（省略した場合はテキスト全体）
 * @returns 置換トークンのリスト（出現順）
 */
export function getConcealTokens(
    text: string,
    config: ConcealConfig,
    ranges?: TextRange[]
): ConcealToken[] {
    const tokens: ConcealToken[] = [];

    const handled = new Uint8Array(text.length); // 重複マッチを防ぐ

    // 適用範囲が指定されている場合、範囲外をあらかじめ「処理済み(1)」としてマークする
    if (ranges) {
        handled.fill(1); // 一旦すべてを対象外にする
        for (const r of ranges) {
            // 対象範囲のインデックスだけを 0（未処理）に戻す
            for (let i = Math.max(0, r.start); i < Math.min(text.length, r.end); i++) {
                handled[i] = 0;
            }
        }
    }

    const addToken = (start: number, end: number, replacement: string) => {
        // 既に別の置換ルールでカバーされているか、あるいは「適用範囲外」ならスキップ
        for (let i = start; i < end; i++) {
            if (handled[i]) {
                return false;
            }
        }
        // 範囲を使用済みにマーク
        for (let i = start; i < end; i++) {
            handled[i] = 1;
        }
        tokens.push({ start, end, replacement });
        return true;
    };

    const resolveReplacements = (str: string) => {
        let res = str;
        for (const [key, val] of config.replacements) {
            if (res.includes(key)) {
                res = res.split(key).join(val);
            }
        }
        return res;
    };

    // 1. \not\XXX の処理 (例: \not\subset)
    const slashChar = config.combiningMarks.get('\\slash') || '\u0338';
    const notRegex = /\\not(\\[a-zA-Z]+)/g;
    let match;
    while ((match = notRegex.exec(text)) !== null) {
        const innerCmd = match[1];
        const innerRepl = config.replacements.get(innerCmd) || innerCmd;
        addToken(match.index, match.index + match[0].length, innerRepl + slashChar);
    }

    // 2. Combining marks の処理 (例: \vec{a})
    for (const [cmd, mark] of config.combiningMarks) {
        // 正規表現用にエスケープ (\vec -> \\vec)
        const escapedCmd = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cmdRegex = new RegExp(`${escapedCmd}\\{([^}]*)\\}`, 'g');
        let m;
        while ((m = cmdRegex.exec(text)) !== null) {
            const inner = m[1];
            if (inner.length > 0) {
                const resolvedInner = resolveReplacements(inner);
                if (resolvedInner.length > 0) {
                    const firstChar = resolvedInner[0];
                    const remainder = resolvedInner.slice(1);
                    // 1文字目に結合文字(mark)を付与し、残りはそのまま繋げる
                    addToken(m.index, m.index + m[0].length, firstChar + mark + remainder);
                }
            } else {
                // 空の波括弧のケース (例: \vec{})
                const repl = config.replacements.get(cmd + '{}');
                if (repl) {
                    addToken(m.index, m.index + m[0].length, repl);
                }
            }
        }
    }

    // 3. 通常の REPLACEMENTS の処理
    for (const [key, val] of config.replacements) {
        let index = 0;
        while ((index = text.indexOf(key, index)) !== -1) {
            // \newcommand -> ≠wcommand の問題を回避
            if (!(/[a-zA-Z]$/.test(key) && /[a-zA-Z]/.test(text[index + key.length] || ''))) {
                addToken(index, index + key.length, val);
            }
            index += key.length;
        }
    }

    // 4. 複数文字の下付き文字展開: _{012} -> ₀₁₂
    const subRegex = /_\{([0-9+\-=()<>aeoxjhklmnpstiruv\u03B2\u03B3\u03C1\u03C6\u03C7\u2212]+)\}/g;
    while ((match = subRegex.exec(text)) !== null) {
        const inner = match[1];
        let replacement = '';
        for (const char of inner) {
            replacement += config.subSuperscripts.get('_' + char) || char;
        }
        addToken(match.index, match.index + match[0].length, replacement);
    }

    // 5. 複数文字の上付き文字展開: ^{012} -> ⁰¹²
    const supRegex = /\^\{([0-9+\-=()<>ABDEGHIJKLMNOPRTUWabcdefghijklmnoprstuvwxyz\u03B2\u03B3\u03B4\u03C6\u03C7\u222B\u2212]+)\}/g;
    while ((match = supRegex.exec(text)) !== null) {
        const inner = match[1];
        let replacement = '';
        for (const char of inner) {
            replacement += config.subSuperscripts.get('^' + char) || char;
        }
        addToken(match.index, match.index + match[0].length, replacement);
    }

    // 6. 単体の SUBSUPERSCRIPTS の処理 (例: _0, ^1)
    for (const [key, val] of config.subSuperscripts) {
        let index = 0;
        while ((index = text.indexOf(key, index)) !== -1) {
            addToken(index, index + key.length, val);
            index += key.length;
        }
    }

    // 最後にテキストの出現順（startの昇順）にソートして返す
    return tokens.sort((a, b) => a.start - b.start);
}

// 置換トークンを適用して最終的なテキストを生成する
export function applyConcealTokensToText(text: string, tokens: ConcealToken[]): string {
    let result = '';
    let lastIndex = 0;
    for (const token of tokens) {
        // 置換前のテキストを追加
        result += text.slice(lastIndex, token.start);
        // 置換後のテキストを追加
        result += token.replacement;
        lastIndex = token.end;
    }
    // 最後に残ったテキストを追加
    result += text.slice(lastIndex);
    return result;
}

