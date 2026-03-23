import replaceData from '../default_settings/replace_data.json';
import { ConcealConfig, ConcealToken, TextRange } from './types';

// 置換ルールを取得
export function initializeConcealConfig(customReplacements: Record<string, string> = {}): ConcealConfig {
    const replacements = new Map(Object.entries({ ...replaceData.REPLACEMENTS, ...customReplacements }));
    const keys = Array.from(replacements.keys()).sort((a, b) => b.length - a.length);

    const createRegexPart = (key: string) => {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (/[a-zA-Z]$/.test(key)) {
            return escaped + '(?![a-zA-Z])';
        }
        return escaped;
    };


    // REPLACEMENTSのキーを長い順に正規表現化してまとめる 
    // これでなぜか80倍くらい速くなる
    const regexes: RegExp[] = [];
    const keysByLength = new Map<number, string[]>();
    for (const key of keys) {
        const len = key.length;
        const bucket = keysByLength.get(len);
        if (bucket) {
            bucket.push(key);
        } else {
            keysByLength.set(len, [key]);
        }
    }
    const lengthsDesc = Array.from(keysByLength.keys()).sort((a, b) => b - a);
    for (const len of lengthsDesc) {
        const keysInLength = keysByLength.get(len) ?? [];
        const parts = keysInLength.map(createRegexPart);
        regexes.push(new RegExp(`(${parts.join('|')})`, 'g'));
    }
    
    return {
        replacements: replacements,
        combiningMarks: new Map(Object.entries(replaceData.COMBININGMARKS)),
        subSuperscripts: new Map(Object.entries(replaceData.SUBSUPERSCRIPTS)),
        replacementRegexes: regexes,
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

    let match;

    // 1. \not\XXX の処理 (例: \not\subset)
    const slashChar = config.combiningMarks.get('\\slash') || '\u0338';
    const notRegex = /\\not(\\[a-zA-Z]+)/g;
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
    for (const regex of config.replacementRegexes) {
        regex.lastIndex = 0;
        while ((match = regex.exec(text)) !== null) {
            const matchedKey = match[1];
            const val = config.replacements.get(matchedKey);
            if (val) {
                addToken(match.index, match.index + matchedKey.length, val);
            }
        }
    }
    const step3SubLog = `regexCount: ${config.replacementRegexes.length}`;

    // 4. 複数文字の下付き文字展開: _{012} -> ₀₁₂
    const subRegex = /_\{([0-9+\-=()<>aeoxjhklmnpstiruv]+)\}/g;
    while ((match = subRegex.exec(text)) !== null) {
        const inner = match[1];
        let replacement = '';
        for (const char of inner) {
            replacement += config.subSuperscripts.get('_' + char) || char;
        }
        addToken(match.index, match.index + match[0].length, replacement);
    }

    // 5. 複数文字の上付き文字展開: ^{012} -> ⁰¹²
    const supRegex = /\^\{([0-9+\-=()<>ABDEGHIJKLMNOPRTUWabcdefghijklmnoprstuvwxyz]+)\}/g;
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
    // 最後にテキストの出現順（starの昇順）にソートして返す
    const sorted = tokens.sort((a, b) => a.start - b.start);

    return sorted;
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
