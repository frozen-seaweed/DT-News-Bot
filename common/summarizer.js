import { clampBytesUTF8, clampWords } from './utils.js';


export function summarizeOneLine(item) {
// 우선순위: description → title 재구성
let base = (item.description && item.description.length > 20) ? item.description : item.title;
if (!base) base = item.title||'';
// 한글/영문에 따라 길이 제한 다르게
const hasKo = /[가-힣]/.test(base);
if (hasKo) return clampBytesUTF8(base, 220); // 대략 70~110자
return clampWords(base, 18); // 12~18 words
}
