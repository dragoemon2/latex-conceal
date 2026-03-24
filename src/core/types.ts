export interface TextPoint {
    ln: number; // 0-based line number
    col: number; // 0-based column number
}

// テキストの範囲を表すインターフェース
export interface TextRange {
    start: number;
    end: number;
}

// 置換対象のトークンを表すインターフェース
export interface ConcealToken extends TextRange {
    replacement: string;
}

// 置換ルールをまとめたコンフィグ
export interface ConcealConfig {
    replacements: Map<string, string>;
    combiningMarks: Map<string, string>;
    subSuperscripts: Map<string, string>;
    replacementRegexes: RegExp[];
}

// revealのルールをまとめたコンフィグ
export interface RevealConfig {
    revealBehavior: 'token' | 'environment' | 'line';
}

export interface AppConfig {
    enable: boolean; // 拡張機能全体の有効/無効フラグ
    targetLanguageIds: string[]; // Concealを適用する言語ID一覧
    conceal: ConcealConfig; // 置換ルールのコンフィグ
    reveal: RevealConfig; // 展開ルールのコンフィグ
    replacementColor: string; // 置換後の文字の色（オプション）
}