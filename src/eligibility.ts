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
export interface Reason { label: string; ok: boolean | null }

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

export function judge(item: { conditions?: Conditions | null }, profile: Profile): { verdict: Verdict; reasons: Reason[] } {
  const conditions = item.conditions
  if (!conditions) return { verdict: 'check', reasons: [{ label: '지원조건 정보 없음, 원문에서 확인하세요', ok: null }] }
  const reasons: Reason[] = []
  const codes = new Set(conditions.codes)

  const genders = (['JA0101', 'JA0102'] as const).filter(code => codes.has(code))
  if (genders.length === 1) {
    const wanted = genders[0] === 'JA0101' ? 'male' : 'female'
    reasons.push({ label: wanted === 'male' ? '남성 대상' : '여성 대상', ok: profile.gender ? profile.gender === wanted : null })
  }

  const min = conditions.age_min
  // 정부24 writes "no upper limit" as 120.
  const max = conditions.age_max != null && conditions.age_max >= 100 ? null : conditions.age_max
  if (min != null || max != null) {
    const age = profile.age
    reasons.push({ label: ageLabel(min, max), ok: age == null ? null : (min == null || age >= min) && (max == null || age <= max) })
  }

  for (const group of GROUPS) {
    const wanted = conditions.codes.filter(code => code.startsWith(group.prefix) && code !== group.none && code in group.labels)
    const options = Object.keys(group.labels).filter(code => code.startsWith(group.prefix))
    // Every option checked (e.g. all five income bands) means the group does not restrict anyone.
    if (!wanted.length || wanted.length === options.length || (group.none && codes.has(group.none))) continue
    const answer = group.answer(profile)
    reasons.push({ label: wanted.map(code => group.labels[code]).join('·') + ' 대상', ok: answer ? wanted.some(code => answer.includes(code)) : null })
  }

  // An individual's profile cannot say whether a benefit for businesses or institutions (JA2xxx) fits them.
  if (conditions.codes.some(code => code.startsWith('JA2'))) reasons.push({ label: '사업자·기관 대상 포함', ok: null })

  const verdict: Verdict = reasons.some(reason => reason.ok === false) ? 'ineligible'
    : reasons.some(reason => reason.ok === null) ? 'check' : 'eligible'
  return { verdict, reasons }
}
