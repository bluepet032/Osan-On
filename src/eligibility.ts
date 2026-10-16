import type { Conditions } from './types'

export type IncomeCode = 'JA0201' | 'JA0202' | 'JA0203' | 'JA0204' | 'JA0205'

export interface Profile {
  gender?: 'male' | 'female'
  /** 만 나이 */
  age?: number
  income?: IncomeCode
  /** JA03xx·JA11xx codes that apply. undefined = not answered yet, [] = none apply. */
  traits?: string[]
  /** JA04xx codes that apply, with the same undefined/[] meaning. */
  household?: string[]
}

export type Verdict = 'eligible' | 'check' | 'ineligible'
/** `input`: more answers in the profile would settle it (ok is null). */
export interface Reason { label: string; ok: boolean | null; input?: true }
const answered = (label: string, ok: boolean | null): Reason => ok === null ? { label, ok, input: true } : { label, ok }

// Labels follow 정부24 supportConditions (https://infuser.odcloud.kr/api/stages/44436/api-docs).
export const INCOME_OPTIONS: Record<IncomeCode, string> = {
  JA0201: '중위소득 50% 이하', JA0202: '중위소득 51~75%', JA0203: '중위소득 76~100%', JA0204: '중위소득 101~200%', JA0205: '중위소득 200% 초과',
}
export const TRAIT_OPTIONS: Record<string, string> = {
  JA0301: '예비부모·난임', JA0302: '임산부', JA0303: '출산·입양',
  JA0317: '초등학생', JA0318: '중학생', JA0319: '고등학생', JA0320: '대학생·대학원생',
  JA0326: '근로자·직장인', JA0327: '구직자·실업자', JA0313: '농업인', JA0314: '어업인', JA0315: '축산업인', JA0316: '임업인',
  JA1101: '예비창업자', JA1102: '소상공인(영업 중)', JA1103: '생계곤란·폐업예정 소상공인',
  JA0328: '장애인', JA0329: '국가보훈대상자', JA0330: '질병·질환자',
}
export const HOUSEHOLD_OPTIONS: Record<string, string> = {
  JA0404: '1인 가구', JA0411: '다자녀 가구', JA0403: '한부모·조손 가정', JA0401: '다문화 가족', JA0402: '북한이탈주민',
  JA0412: '무주택 세대', JA0413: '신규 전입', JA0414: '확대 가족',
}

export const hasBasics = (profile: Profile) => Boolean(profile.gender) && profile.age != null

interface Group { prefix: string; none?: string; answer: (profile: Profile) => string[] | undefined; labels: Record<string, string> }

// Within a group any listed code qualifies; every constrained group must qualify.
// shortcut: JA12xx (소상공인 업종) is ignored; upgrade if business users are added.
const GROUPS: Group[] = [
  { prefix: 'JA020', answer: profile => profile.income && [profile.income], labels: INCOME_OPTIONS },
  { prefix: 'JA03', none: 'JA0322', answer: profile => profile.traits, labels: TRAIT_OPTIONS },
  { prefix: 'JA04', none: 'JA0410', answer: profile => profile.household, labels: HOUSEHOLD_OPTIONS },
  { prefix: 'JA110', answer: profile => profile.traits, labels: TRAIT_OPTIONS },
]

function ageLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `만 ${min}~${max}세`
  return min != null ? `만 ${min}세 이상` : `만 ${max}세 이하`
}

// "19~39세", "19세 이상 39세 이하", "65세 이상", "18세 미만"; 세대(households) is not an age.
const TEXT_AGE_RE = /(\d{1,3})\s*세?\s*[~∼]\s*(\d{1,3})\s*세(?!대)|(\d{1,3})\s*세\s*(이상|초과)\s*(\d{1,3})\s*세\s*(이하|미만)|(\d{1,3})\s*세(?!대)\s*(이상|초과|이하|미만)/g
// A bare age in the title names the target outright ("56세 C형간염 확진검사비"); 2세 is a generation, not an age.
const TITLE_AGE_RE = /(?<!\d)([1-9]\d)세(?!대)/

/** Age ranges written only in the text, as [min, max] with null for open ends. */
export function textAgeRanges(text: string, title = ''): { label: string; min: number | null; max: number | null }[] {
  const ranges = [...text.matchAll(TEXT_AGE_RE)].map(match => {
    const [label, from, to, low, lowWord, high, highWord, one, word] = match
    if (from) return { label, min: Number(from), max: Number(to) }
    if (low) return { label, min: Number(low) + (lowWord === '초과' ? 1 : 0), max: Number(high) - (highWord === '미만' ? 1 : 0) }
    const value = Number(one)
    if (word === '이상' || word === '초과') return { label, min: value + (word === '초과' ? 1 : 0), max: null }
    return { label, min: null, max: value - (word === '미만' ? 1 : 0) }
  })
  const titleAge = TITLE_AGE_RE.exec(title)
  if (titleAge) ranges.push({ label: titleAge[0], min: Number(titleAge[1]), max: Number(titleAge[1]) })
  return ranges.map(range => ({ ...range, label: range.label.replace(/\s+/g, ' ').replace(/세\s*(이상|초과|이하|미만)/g, '세 $1').trim() }))
}

export function judge(item: { conditions?: Conditions | null; eligibility?: string | null; title?: string }, profile: Profile): { verdict: Verdict; reasons: Reason[] } {
  const conditions = item.conditions
  if (!conditions) return { verdict: 'check', reasons: [{ label: '지원조건 정보 없음, 원문에서 확인하세요', ok: null }] }
  const reasons: Reason[] = []
  const codes = new Set(conditions.codes)

  const genders = (['JA0101', 'JA0102'] as const).filter(code => codes.has(code))
  if (genders.length === 1) {
    const wanted = genders[0] === 'JA0101' ? 'male' : 'female'
    reasons.push(answered(wanted === 'male' ? '남성 대상' : '여성 대상', profile.gender ? profile.gender === wanted : null))
  }

  const min = conditions.age_min
  // 정부24 writes "no upper limit" as 120.
  const max = conditions.age_max != null && conditions.age_max >= 100 ? null : conditions.age_max
  const age = profile.age
  if (min != null || max != null) {
    const label = conditions.life ? `${conditions.life.join('·')}(${ageLabel(min, max)})` : ageLabel(min, max)
    reasons.push(answered(label, age == null ? null : (min == null || age >= min) && (max == null || age <= max)))
  } else if (age != null) {
    // Without a coded age, an age outside everything the text mentions needs a look (the text may describe a child).
    const ranges = textAgeRanges(item.eligibility ?? '', item.title)
    if (ranges.length && !ranges.some(range => (range.min == null || age >= range.min) && (range.max == null || age <= range.max))) {
      reasons.push({ label: `원문의 나이 조건 확인(${[...new Set(ranges.map(range => range.label))].join(', ')})`, ok: null })
    }
  }

  for (const group of GROUPS) {
    const wanted = conditions.codes.filter(code => code.startsWith(group.prefix) && code !== group.none && code in group.labels)
    const options = Object.keys(group.labels).filter(code => code.startsWith(group.prefix))
    // Every option checked (e.g. all five income bands) means the group does not restrict anyone.
    if (!wanted.length || wanted.length === options.length || (group.none && codes.has(group.none))) continue
    const answer = group.answer(profile)
    reasons.push(answered(wanted.map(code => group.labels[code]).join('·') + ' 대상', answer ? wanted.some(code => answer.includes(code)) : null))
  }

  // An individual's profile cannot say whether a benefit for businesses or institutions (JA2xxx) fits them.
  if (conditions.codes.some(code => code.startsWith('JA2'))) reasons.push({ label: '사업자·기관 대상 포함', ok: null })
  // 복지로 life stages are a category, not the full eligibility, so they never make a sure match.
  if (conditions.life) reasons.push({ label: '세부 대상은 원문 확인', ok: null })

  const verdict: Verdict = reasons.some(reason => reason.ok === false) ? 'ineligible'
    : reasons.some(reason => reason.ok === null) ? 'check' : 'eligible'
  return { verdict, reasons }
}
