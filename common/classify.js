// api/common/classify.js
// 한국어/영어 + 키워드 조합으로 3개 카테고리 분류
const reKo = /[가-힣]/;

const MOBILITY = [
  '자동차','완성차','자율주행','로보택시','전기차','수소차','충전소','모빌리티',
  '현대차','기아','한국GM','쌍용','르노코리아','타타대우','BYD','테슬라','Tesla','Hyundai','Kia','Waymo'
];
const AIKEY = [
  '인공지능','AI','생성형','LLM','로봇','로보틱스','웹3','Web3','블록체인','DePIN','반도체','칩','NPU'
];

function hasAny(s, arr){ return arr.some(k=>s.includes(k)); }
function isKo(text=''){ return reKo.test(text); }

export function classifyCategory(it) {
  const t = (it.title || '').trim();
  const lang = it.lang || (isKo(t) ? 'ko' : 'en');

  const isAI = hasAny(t, AIKEY);
  const isMob = hasAny(t, MOBILITY);

  // 신기술은 "한국어만" 허용
  if (isAI && lang === 'ko') return 'AI/Web3';

  // 모빌리티(딜러/완성차 포함)
  if (isMob && lang === 'ko') return '국내 모빌리티';
  if (isMob && lang !== 'ko') return '글로벌 모빌리티';

  // 언어 폴백
  if (lang === 'ko') return '국내 모빌리티';
  return '글로벌 모빌리티';
}
