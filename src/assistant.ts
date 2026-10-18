import { hasBasics, type Profile, type Verdict } from './eligibility'
import { buildIndex, matchesSearch, type SearchIndex } from './search'
import type { Opportunity } from './types'

// The 오산온 assistant answers from the published benefits and a few prepared explanations.
// It is not a language model yet: askAssistant is the one place a real AI would plug in later,
// so the chat window only depends on its question-in, reply-out shape.

export interface AssistantContext {
  items: Opportunity[]
  profile: Profile
  verdictOf: (item: Opportunity) => Verdict | undefined
}

export interface AssistantReply {
  text: string
  /** Benefits to show as cards, best first. */
  items: Opportunity[]
  /** How many benefits matched in all; items holds the first few. */
  total: number
  /** The search the reply used, for "목록에서 모두 보기". */
  query?: string
}

export const ASSISTANT_STARTERS = ['청년 월세 지원', '출산하면 받을 수 있는 혜택', '어르신 혜택', '나에게 맞는 혜택 추천', '중위소득이 뭐예요?', '신청은 어떻게 해요?']
const SHOWN = 3

// Words that ask rather than name what is wanted.
const STOPWORDS = new Set([
  '혜택', '지원', '지원금', '지원사업', '사업', '제도', '정책', '알려줘', '알려', '주세요', '줘', '좀', '뭐', '뭐가', '뭐예요', '뭔가요', '무엇', '어떤',
  '있어', '있어요', '있나요', '있는', '있을까요', '없어', '받을', '받는', '받고', '받으려면', '수', '돈', '것', '거', '게', '관련', '대한', '대해',
  '나', '저', '내', '제', '나에게', '저에게', '나한테', '내가', '제가', '우리', '궁금해', '궁금해요', '싶어', '싶어요', '하고', '그리고',
  '신청', '방법', '어떻게', '어디서', '해요', '하나요', '추천', '추천해줘', '맞는', '조건', '오산', '오산시',
])
// Particles and endings to strip once from the end of a word, longest first.
const SUFFIXES = ['이에요', '으면', '하면', '하는', '해서', '에서', '으로', '이랑', '까지', '부터', '에게', '한테', '예요', '은', '는', '이', '가', '을', '를', '에', '로', '도', '만', '의', '요', '면']

// Everyday words for the same need, so "어르신" finds "노인" and "아기 낳으면" finds "출산".
const TOPICS: { triggers: string[]; words: string[] }[] = [
  { triggers: ['어르신', '노인', '할머니', '할아버지', '노년', '경로'], words: ['노인', '어르신', '경로', '노년'] },
  { triggers: ['출산', '아기', '낳', '임신', '임산부', '산모', '신생아'], words: ['출산', '임신', '임산부', '산모', '신생아'] },
  { triggers: ['월세', '전세', '임차', '보증금'], words: ['월세', '임차', '전세', '보증금'] },
  { triggers: ['집', '주거', '주택'], words: ['주거', '주택'] },
  { triggers: ['아이', '자녀', '육아', '보육', '아동'], words: ['아동', '육아', '보육', '자녀', '어린이'] },
  { triggers: ['일자리', '취업', '구직', '알바', '직장'], words: ['일자리', '취업', '구직', '고용'] },
  { triggers: ['장애'], words: ['장애'] },
  { triggers: ['장학', '학비', '등록금', '학자금', '대학'], words: ['장학', '학자금', '등록금', '대학'] },
  { triggers: ['창업', '사장', '자영업', '소상공인'], words: ['창업', '소상공인'] },
]

const FAQ: { test: RegExp; text: string }[] = [
  { test: /^(안녕|하이|hi\b|hello)/i, text: '안녕하세요! 오산온 AI예요. 받을 수 있는 혜택이 궁금하시면 "청년 월세", "출산 지원"처럼 편하게 물어보세요.' },
  { test: /고마|감사/, text: '도움이 되었다니 다행이에요. 더 궁금한 혜택이 있으면 언제든 물어보세요.' },
  { test: /중위소득/, text: '중위소득은 가구 소득을 한 줄로 세웠을 때 딱 가운데에 있는 소득이에요. "중위소득 50% 이하"는 그 가운데 소득의 절반 이하라는 뜻이에요. 금액은 가구원 수와 해마다 달라지니, 정확한 기준은 복지로나 주민센터에서 확인해 주세요.' },
  { test: /만\s*나이/, text: '만 나이는 태어난 날을 0살로 시작해 생일이 지날 때마다 한 살씩 더해요. 올해 생일이 지났다면 "올해 연도 − 태어난 연도", 아직 안 지났다면 거기서 1을 빼면 돼요.' },
  { test: /가능성\s*높음|확인\s*필요|해당\s*없음|판정/, text: '"가능성 높음"은 나이·성별·특수 대상처럼 지원 대상을 정하는 조건이 입력하신 내용과 맞는 혜택이에요. "확인 필요"는 조건을 더 입력하거나 원문을 봐야 알 수 있는 혜택이고요. 어느 쪽이든 최종 자격은 원문에서 꼭 확인해 주세요.' },
  { test: /찜|저장/, text: '혜택 카드의 하트를 누르면 찜할 수 있어요. 로그인하지 않아도 이 브라우저에 저장되고, 로그인하면 다른 기기에서도 보고 신청 일정 알림도 받을 수 있어요.' },
  { test: /오류|틀렸|잘못|신고/, text: '혜택 정보가 원문과 다르면 혜택을 펼친 뒤 아래의 "정보 오류 신고"를 눌러 알려 주세요. 운영자가 원문과 대조해 고칠게요.' },
]

const LOCAL_RANK: Record<string, number> = { osan: 0, gyeonggi: 1, national: 2 }
const VERDICT_RANK: Record<string, number> = { eligible: 0, check: 1, ineligible: 2 }

/** The words of a question that name what is wanted. */
export function questionTerms(question: string): string[] {
  return question
    .toLocaleLowerCase('ko-KR')
    .replace(/[?!.,~'"“”‘’()[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      if (STOPWORDS.has(word)) return ''
      const suffix = SUFFIXES.find(ending => word.endsWith(ending) && word.length - ending.length >= 2)
      const stem = suffix ? word.slice(0, -suffix.length) : word
      return STOPWORDS.has(stem) ? '' : stem
    })
    .filter(Boolean)
}

const alternativesOf = (term: string) => TOPICS.find(topic => topic.triggers.some(trigger => term.startsWith(trigger)))?.words ?? [term]
// The summary and tags, but not the department: "노인장애인과" says nothing about who a benefit is for.
const bodies = new WeakMap<Opportunity, SearchIndex>()
function bodyOf(item: Opportunity) {
  let index = bodies.get(item)
  if (!index) bodies.set(item, index = buildIndex([item.summary, ...item.field_tags, ...item.audience_tags]))
  return index
}
// 2 when the title names the term, 1 when only the summary or tags do, 0 otherwise.
function termScore(item: Opportunity, term: string) {
  const words = alternativesOf(term)
  const title = item.title.toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
  if (words.some(word => title.includes(word))) return 2
  return words.some(word => matchesSearch(bodyOf(item), [word])) ? 1 : 0
}

function ranked(items: Opportunity[], verdictOf: AssistantContext['verdictOf'], score: (item: Opportunity) => number = () => 0) {
  // Benefits the profile rules out still show, last: people often ask for a parent or a child.
  const ruledOut = (item: Opportunity) => verdictOf(item) === 'ineligible' ? 1 : 0
  return [...items].sort((left, right) =>
    ruledOut(left) - ruledOut(right)
    || score(right) - score(left)
    || LOCAL_RANK[left.jurisdiction ?? 'national'] - LOCAL_RANK[right.jurisdiction ?? 'national']
    || (VERDICT_RANK[verdictOf(left) ?? 'check'] ?? 1) - (VERDICT_RANK[verdictOf(right) ?? 'check'] ?? 1)
    || (left.d_day ?? 99999) - (right.d_day ?? 99999))
}

const reply = (text: string, items: Opportunity[] = [], query?: string): AssistantReply => ({ text, items: items.slice(0, SHOWN), total: items.length, query })

export async function askAssistant(question: string, { items, profile, verdictOf }: AssistantContext): Promise<AssistantReply> {
  const terms = questionTerms(question)
  const faq = FAQ.find(entry => entry.test.test(question))
  if (faq) return reply(faq.text)

  if (!terms.length) {
    if (/추천|맞는|받을 수|조건/.test(question)) {
      if (!hasBasics(profile)) return reply('성별과 나이를 먼저 알려 주시면 받을 가능성이 높은 혜택을 골라 드릴게요. 화면 위 설문에서 두 가지만 입력해 주세요.')
      const likely = ranked(items.filter(item => verdictOf(item) === 'eligible'), verdictOf)
      return likely.length
        ? reply(`입력하신 조건으로 받을 가능성이 높은 혜택이 ${likely.length}개 있어요. 오산시 혜택부터 보여 드릴게요.`, likely)
        : reply('지금 입력하신 조건으로는 "가능성 높음" 혜택이 없어요. "더 정확하게"에서 소득이나 가구 상황을 입력하면 더 찾아 드릴 수 있어요.')
    }
    if (/신청/.test(question)) return reply('혜택마다 신청 방법이 달라요. 혜택을 펼치면 "신청·문의"에 온라인·방문 신청처와 연락처가 있고, "원문 보기"에서 준비 서류까지 확인할 수 있어요. 궁금한 혜택 이름을 말씀해 주시면 찾아 드릴게요.')
    return reply('어떤 혜택이 궁금하세요? "청년 월세", "출산 지원", "어르신 일자리"처럼 말씀해 주시면 찾아 드릴게요.')
  }

  const query = terms.join(' ')
  const scores = new Map<Opportunity, number[]>(items.map(item => [item, terms.map(term => termScore(item, term))]))
  // Benefits that cover the most of the question's terms; among them, title matches first.
  const coverage = (item: Opportunity) => scores.get(item)!.filter(Boolean).length
  const best = Math.max(0, ...[...scores.keys()].map(coverage))
  if (!best) return reply(`‘${query}’ 관련 혜택을 찾지 못했어요. "월세", "출산", "장학금", "어르신"처럼 짧은 단어로 물어보시면 더 잘 찾아요.`)
  const total = (item: Opportunity) => scores.get(item)!.reduce((sum, score) => sum + score, 0)
  const found = ranked([...scores.keys()].filter(item => coverage(item) === best), verdictOf, total)
  return reply(`‘${query}’ 관련 혜택을 ${found.length}개 찾았어요. 오산시 혜택과 내 조건에 맞을 가능성이 높은 것부터 보여 드릴게요.`, found, query)
}
