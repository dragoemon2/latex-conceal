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
    replacements: Map<string, string>; // 置換ルールのマップ（例: "\alpha" => "α"）, customReplacementsも含む
    combiningMarks: Map<string, string>; // 結合文字のマップ（例: "\tilde{a}" => "̃a"）
    subSuperscripts: Map<string, string>; // 上下付き文字のマップ（例: "^2" => "²", "_n" => "ₙ"）
    replacementRegexes: RegExp[]; // 置換ルールのマップを元に生成された正規表現のリスト（効率的なマッチングのため）
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
    loadReplacementsAutomatically: boolean; // ドキュメント内の \newcommand などから置換ルールを自動的に読み込むかどうか
    customReplacements: Record<string, string>; // setting.jsonで定義されたカスタム置換ルール（例: {"\\foo": "α"}）
}