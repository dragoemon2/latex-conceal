/* ⚠️ This file is not used in the current implementation */

import { ConcealToken } from "./types";

export function shiftConcealTokens(cachedTokens: ConcealToken[], start: number, shift: number): ConcealToken[] {
    return cachedTokens.map(token => {
        if (token.end <= start) {
            // 変更位置より前のトークンはそのまま
            return token;
        } else if (token.start >= start) {
            // 変更位置より後のトークンは開始・終了位置をシフト
            return {
                start: token.start + shift,
                end: token.end + shift,
                replacement: token.replacement
            };
        } else {
            // 変更位置がトークンの範囲内にある場合は、終了位置のみをシフト（開始位置は変更なし）
            return {
                start: token.start,
                end: token.end + shift,
                replacement: token.replacement
            };
        }
    });
}