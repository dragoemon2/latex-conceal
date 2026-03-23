import * as vscode from 'vscode';
import { getConcealTokens, initializeConcealConfig } from './core/conceal';
import { getAllMathEnvs } from './core/mathenv';
import { getRevealRanges } from './core/reveal';
import { AppConfig, ConcealToken } from './core/types';
import { applyConceal, updateDecorationStyle } from './decorator';

// extensionの設定
let currentConfig: AppConfig | undefined;

// 置換トークンのキャッシュ
const concealCacheByDocument = new Map<string, ConcealToken[]>();


export function activate(context: vscode.ExtensionContext) {
    console.log('LaTeX Conceal is now active!');

    const statusBarToggle = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarToggle.text = '$(eye) Conceal: ON';
    statusBarToggle.tooltip = 'Toggle LaTeX Conceal (UI only)';
    statusBarToggle.command = 'latex-conceal.toggle';
    statusBarToggle.show();
    context.subscriptions.push(statusBarToggle);

    context.subscriptions.push(
        vscode.commands.registerCommand('latex-conceal.toggle', () => {
            // トグルのON/OFFを切り替える
            const config = requireConfig();
            const newEnableState = !config.enable;
            currentConfig = { ...config, enable: newEnableState };
            statusBarToggle.text = `$(eye) Conceal: ${newEnableState ? 'ON' : 'OFF'}`;
            // トグル後すぐに現在のエディタに反映させる
            if (vscode.window.activeTextEditor) {
                triggerFullParse(vscode.window.activeTextEditor);
            }
        })
    );

    // 初期化処理：設定の読み込みとスタイルの構築
    loadAndApplyConfig();
    updateDecorationStyle();

    // 現在開いているエディタがあれば即座にパースして適用
    if (vscode.window.activeTextEditor) {
        triggerFullParse(vscode.window.activeTextEditor);
    }

    // テキスト編集時 
    // もし重いようなら部分的な更新ロジックに切り替えることも検討（例: 変更された行だけ再パース）
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async event => {
            const editor = vscode.window.activeTextEditor;
            // アクティブなエディタの変更のみを処理する
            if (editor && event.document === editor.document && event.contentChanges.length > 0) {
                triggerFullParse(editor);
            }
        })
    );

    // カーソル移動時 (即時反映のReveal処理)
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;
            if (editor) {
                // 文字列は変わっていないので、パースはせず出入り判定のみ行う
                applyDecorationForEditor(editor);
            }
        })
    );

    // アクティブなエディタ（タブ）が切り替わった時
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                triggerFullParse(editor);
            }
        })
    );

    // 設定 (settings.json) が変更された時
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('latex-conceal')) {
                loadAndApplyConfig();
                updateDecorationStyle(); // 色などが変わったかもしれないのでスタイルも再構築
                
                if (vscode.window.activeTextEditor) {
                    triggerFullParse(vscode.window.activeTextEditor);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            concealCacheByDocument.delete(document.uri.toString());
        })
    );
}


/**
 * VSCodeの設定を読み込み、拡張内の状態へ反映する
 */
function loadAndApplyConfig() {
    const config = vscode.workspace.getConfiguration('latex-conceal');

    const concealConfig = initializeConcealConfig(config.get<Record<string, string>>('customReplacements', {}));
    const targetLanguageIds = config
        .get<string[]>('targetLanguageIds', ['latex', 'tex'])
        .map(languageId => languageId.trim().toLowerCase())
        .filter(languageId => languageId.length > 0);

    const appConfig: AppConfig = {
        enable: config.get<boolean>('enable', true),
        targetLanguageIds,
        conceal: concealConfig,
        reveal: {
            revealBehavior: config.get<'token' | 'environment' | 'line'>('revealBehavior', 'environment')
        }
    };

    currentConfig = appConfig;
}

/**
 * ドキュメント全体をパースしてキャッシュを更新し，描画する
 */
function triggerFullParse(editor: vscode.TextEditor) {
    const document = editor.document;
    const config = requireConfig();
    const documentKey = document.uri.toString();
    

    if (!config.enable || !isTargetLanguage(document, config)) {
        // Conceal機能が無効な場合はキャッシュをクリアして装飾も消す
        concealCacheByDocument.set(documentKey, []);
        applyConceal(editor, [], []);
        return;
    }

    const text = document.getText();

    // 1. 数式環境の範囲を特定
    const mathRanges = getAllMathEnvs(text);
    
    // 2. その範囲内のみを対象に置換トークンを抽出
    const concealTokens = getConcealTokens(text, config.conceal, mathRanges);
    
    // 3. 状態を更新 (Storeに保存)
    concealCacheByDocument.set(documentKey, concealTokens);

    // 4. 新しいキャッシュと現在のカーソル位置をもとに画面を更新
    applyDecorationForEditor(editor);
}

/**
 * 現在のキャッシュとカーソル位置から、展開範囲を計算して描画する
 */
function applyDecorationForEditor(editor: vscode.TextEditor) {
    const document = editor.document;
    const config = requireConfig();

    if (!isTargetLanguage(document, config)) {
        return;
    }

    const cache = concealCacheByDocument.get(document.uri.toString()) ?? [];

    // 1. カーソル位置（複数対応）をオフセット数値の配列に変換
    const cursorOffsets = editor.selections.map(sel => document.offsetAt(sel.active));
    const text = document.getText();

    // 2. 展開（Reveal）すべき範囲を純粋なロジックで計算
    const revealRanges = getRevealRanges(text, cursorOffsets, cache, config.reveal);

    // 3. 計算結果をもとにVSCodeエディタへ装飾を適用！
    applyConceal(editor, cache, revealRanges);
}

// 拡張機能が非アクティブになる時のクリーンアップ処理
export function deactivate() {

}

// ドキュメントの言語IDが対象かどうかを判定する
function isTargetLanguage(document: vscode.TextDocument, config: AppConfig): boolean {
    const languageId = document.languageId.toLowerCase();
    return config.targetLanguageIds.includes(languageId);
}

function requireConfig(): AppConfig {
    if (!currentConfig) {
        throw new Error('Config is not initialized!');
    }
    return currentConfig;
}