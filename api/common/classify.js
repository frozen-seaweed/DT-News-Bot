import { isKoreanText, isEnglishText } from './utils.js';


const AI_WEB3_KEYS = [
// 한글
'인공지능','AI','자율주행칩','로보틱스','로봇','딥러닝','머신러닝','LLM','모델','파운데이션 모델','RAG','벡터DB','블록체인','Web3','웹3','스마트컨트랙트','DePIN','DeFi','토큰','암호화폐','크립토',
// 영어
'AI','robot','robotics','deep learning','machine learning','LLM','foundation model','RAG','vector db','blockchain','web3','smart contract','DePIN','DeFi','token','crypto','semiconductor','SoC','GPU','NPU'
];


export function classifyCategory(item) {
const t = `${item.title} ${item.description||''}`.toLowerCase();
// 1) AI·Web3 키워드가 있으면 우선 AI·Web3
if (AI_WEB3_KEYS.some(k => t.includes(k.toLowerCase()))) return 'AI/Web3';
// 2) 언어로 국내/글로벌 모빌리티 분기
if (isKoreanText(item.title)) return '국내 모빌리티';
if (isEnglishText(item.title)) return '글로벌 모빌리티';
// 기본값: 국내 모빌리티(언어 모호 케이스는 드물다 가정)
return '국내 모빌리티';
}
