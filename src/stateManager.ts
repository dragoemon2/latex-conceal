// stateManager.ts
import { AppConfig, ConcealToken } from './core/types';

// アプリ全体で共有する設定
let currentConfig: AppConfig | undefined;

// ドキュメント全体の置換対象トークンのキャッシュ
let concealCache: ConcealToken[] = [];


export function setConfig(config: AppConfig) {
    currentConfig = config;
}

export function getConfig(): AppConfig {
    if (!currentConfig) {
        throw new Error("Config is not initialized!");
    }
    return currentConfig;
}

export function setCache(newTokens: ConcealToken[]) {
    concealCache = newTokens;
}

export function getCache(): ConcealToken[] {
    return concealCache;
}