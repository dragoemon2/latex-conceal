import * as vscode from 'vscode';
import { getConcealTokens, initializeConcealConfig, loadCustomReplacementsFromDocument } from './core/conceal';
import { getAllMathEnvs } from './core/mathenv';
import { getRevealRanges } from './core/reveal';
import { AppConfig, ConcealToken } from './core/types';
import { applyConceal, updateDecorationStyle } from './decorator';

let currentConfig: AppConfig | undefined;
// Concealトークンのキャッシュ（ドキュメントごと）：全文パースの重複を避けるため
const concealCacheByDocument = new Map<string, ConcealToken[]>();

/** 
 * extension起動時に呼び出されるメイン関数．ここがすべての処理の起点となる
 */ 
export function activate(context: vscode.ExtensionContext) {
    console.log('LaTeX Conceal is now active!');

    // 設定の初期化とスタイルの更新
    currentConfig = loadConfig();
    updateDecorationStyle(currentConfig);

    // ステータスバーにON/OFFトグルを追加
    const statusBarToggle = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    if (currentConfig.enable) {
        statusBarToggle.text = '$(eye) Conceal: ON';
    } else {
        statusBarToggle.text = '$(eye-closed) Conceal: OFF';
    }
    statusBarToggle.tooltip = 'Toggle LaTeX Conceal (UI only)';
    statusBarToggle.command = 'latex-conceal.toggle';
    statusBarToggle.show();
    context.subscriptions.push(statusBarToggle);

    context.subscriptions.push(
        vscode.commands.registerCommand('latex-conceal.toggle', () => {
            if (!currentConfig) {
                return;
            }
            currentConfig.enable = !currentConfig.enable;
            if (currentConfig.enable) {
                statusBarToggle.text = '$(eye) Conceal: ON';
            } else {
                statusBarToggle.text = '$(eye-closed) Conceal: OFF';
            }
            if (vscode.window.activeTextEditor) {
                triggerFullParse(vscode.window.activeTextEditor);
            }
        })
    );

    // 最初のエディタがあれば全文をパースしてキャッシュを構築
    if (vscode.window.activeTextEditor) {
        triggerFullParse(vscode.window.activeTextEditor);
    }

    // テキスト編集時：全文をパースしてトークン列を再構築
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document && event.contentChanges.length > 0) {
                triggerFullParse(editor);
            }
        })
    );

    // カーソル移動時：テキストは変わらないのでパースはせず、Reveal範囲のみ再計算
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;
            if (editor) {
                applyDecorationForEditor(editor);
            }
        })
    );

    // タブ切り替え時：新しいエディタのキャッシュを再構築
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                triggerFullParse(editor);
            }
        })
    );

    // 設定変更時：スタイル反映とキャッシュの再構築が必要
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('latex-conceal')) {
                currentConfig = loadConfig();
                updateDecorationStyle(currentConfig);
                
                if (vscode.window.activeTextEditor) {
                    triggerFullParse(vscode.window.activeTextEditor);
                }
            }
        })
    );

    // ドキュメントが閉じられたときにキャッシュをクリーンアップ
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            concealCacheByDocument.delete(document.uri.toString());
        })
    );
}


export function deactivate() {

}

// setting.jsonから設定を読み込み，AppConfigオブジェクトを構築する．
function loadConfig(): AppConfig {
    const config = vscode.workspace.getConfiguration('latex-conceal');

    // カスタム置換ルールなどを使ってConcealConfig(置換のための正規表現オブジェクトを含む)を初期化 (前処理)
    const concealConfig = initializeConcealConfig(config.get<Record<string, string>>('customReplacements', {}));
    
    const targetLanguageIds = config
        .get<string[]>('targetLanguageIds', ['latex', 'tex'])
        .map(languageId => languageId.trim().toLowerCase())
        .filter(languageId => languageId.length > 0);

    return {
        enable: config.get<boolean>('enable', true),
        targetLanguageIds,
        conceal: concealConfig,
        reveal: {
            revealBehavior: config.get<'token' | 'environment' | 'line'>('revealBehavior', 'environment')
        },
        replacementColor: config.get<string>('replacementColor', 'editor.foreground').trim(),
        loadReplacementsAutomatically: config.get<boolean>('loadReplacementsAutomatically', true),
        customReplacements: config.get<Record<string, string>>('customReplacements', {})
    };
}

// ドキュメント全体をパースしてキャッシュを更新し、描画する
function triggerFullParse(editor: vscode.TextEditor) {
    const document = editor.document;
    const config = requireConfig();
    const documentKey = document.uri.toString();
    
    if (!config.enable || !isTargetLanguage(document, config)) {
        concealCacheByDocument.set(documentKey, []);
        applyConceal(editor, [], []);
        return;
    }

    // ドキュメント内の \newcommand などから置換ルールを動的に読み込む（例: \newcommand{\foo}{\alpha} -> \foo -> α）
    if(config.loadReplacementsAutomatically) {
        const text = document.getText();
        const customReplacementsFromDoc = loadCustomReplacementsFromDocument(text, config.conceal);
        // カスタム置換ルールを既存のルールにマージ（setting.jsonのルールが優先される）
        const customReplacements = { ...customReplacementsFromDoc, ...config.customReplacements };
        // 置換ルールのコンフィグを再初期化して正規表現も再生成
        const updatedConcealConfig = initializeConcealConfig(customReplacements);
        config.conceal = updatedConcealConfig;
    }

    const text = document.getText();
    // 1. 数式環境の範囲を特定（Concealは数式内のみを対象）
    const mathRanges = getAllMathEnvs(text);
    // 2. その範囲内のみを対象に置換トークンを抽出
    const concealTokens = getConcealTokens(text, config.conceal, mathRanges);
    concealCacheByDocument.set(documentKey, concealTokens);
    applyDecorationForEditor(editor);
}

// 現在のキャッシュとカーソル位置から、展開範囲を計算して描画する
function applyDecorationForEditor(editor: vscode.TextEditor) {
    const document = editor.document;
    const config = requireConfig();

    if (!isTargetLanguage(document, config)) {
        return;
    }

    const cache = concealCacheByDocument.get(document.uri.toString()) ?? [];

    // cursorOffsetsは先頭からの文字数オフセット（複数選択対応）
    const cursorOffsets = editor.selections.map(sel => document.offsetAt(sel.active));
    const text = document.getText();
    // Reveal範囲を計算（カーソル位置による展開ロジック）
    const revealRanges = getRevealRanges(text, cursorOffsets, cache, config.reveal);
    applyConceal(editor, cache, revealRanges);
}



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