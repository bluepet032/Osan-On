import { describe, expect, it } from 'vitest'
import { hasBasics, judge, type Profile } from './eligibility'
import type { Conditions } from './types'

const item = (codes: string[], age_min: number | null = null, age_max: number | null = null) => ({ conditions: { codes, age_min, age_max } as Conditions })
const verdict = (codes: string[], profile: Profile, age_min: number | null = null, age_max: number | null = null) => judge(item(codes, age_min, age_max), profile).verdict

describe('judge', () => {
  it('needs a check when the benefit has no condition record', () => {
    const result = judge({ conditions: null }, { gender: 'female', age: 28 })
    expect(result.verdict).toBe('check')
    expect(result.reasons[0].label).toContain('지원조건 정보 없음')
  })

  it('matches gender', () => {
    expect(verdict(['JA0102'], { gender: 'male' })).toBe('ineligible')
    expect(verdict(['JA0102'], { gender: 'female' })).toBe('eligible')
    expect(verdict(['JA0102'], {})).toBe('check')
    expect(verdict(['JA0101', 'JA0102'], {})).toBe('eligible')
  })

  it('matches age ranges, including open-ended ones', () => {
    expect(verdict([], { age: 28 }, 19, 34)).toBe('eligible')
    expect(verdict([], { age: 40 }, 19, 34)).toBe('ineligible')
    expect(verdict([], { age: 70 }, 65, null)).toBe('eligible')
    expect(verdict([], { age: 50 }, 65, null)).toBe('ineligible')
    expect(verdict([], { age: 10 }, null, 18)).toBe('eligible')
    expect(verdict([], {}, 19, 34)).toBe('check')
    expect(judge(item([], 19, 34), { age: 28 }).reasons).toContainEqual({ label: '만 19~34세', ok: true })
  })

  it('matches income bands', () => {
    expect(verdict(['JA0201', 'JA0202'], { income: 'JA0202' })).toBe('eligible')
    expect(verdict(['JA0201', 'JA0202'], { income: 'JA0204' })).toBe('ineligible')
    expect(verdict(['JA0201', 'JA0202'], {})).toBe('check')
  })

  it('matches personal traits, where JA0322 means anyone', () => {
    expect(verdict(['JA0328'], { traits: ['JA0328'] })).toBe('eligible')
    expect(verdict(['JA0328'], { traits: [] })).toBe('ineligible')
    expect(verdict(['JA0328'], {})).toBe('check')
    expect(verdict(['JA0328', 'JA0322'], { traits: [] })).toBe('eligible')
  })

  it('matches household, where JA0410 means anyone', () => {
    expect(verdict(['JA0411'], { household: [] })).toBe('ineligible')
    expect(verdict(['JA0411'], { household: ['JA0411', 'JA0404'] })).toBe('eligible')
    expect(verdict(['JA0410'], {})).toBe('eligible')
  })

  it('matches business status from traits', () => {
    expect(verdict(['JA1101'], { traits: ['JA1101'] })).toBe('eligible')
    expect(verdict(['JA1101'], { traits: ['JA0326'] })).toBe('ineligible')
  })

  it('requires every group: one failure wins over missing answers', () => {
    expect(verdict(['JA0102', 'JA0411'], { gender: 'female', household: [] })).toBe('ineligible')
    expect(verdict(['JA0101', 'JA0411'], { gender: 'female' })).toBe('ineligible')
    expect(verdict(['JA0102', 'JA0411'], { gender: 'female' })).toBe('check')
  })

  it('treats a group with every option checked as no restriction', () => {
    const allIncome = ['JA0201', 'JA0202', 'JA0203', 'JA0204', 'JA0205']
    expect(verdict(allIncome, {})).toBe('eligible')
    expect(judge(item(allIncome), {}).reasons).toEqual([])
  })

  it('reads an upper age of 100 or more as no upper limit', () => {
    expect(judge(item([], 19, 120), { age: 28 }).reasons).toEqual([{ label: '만 19세 이상', ok: true }])
    expect(judge(item([], null, 120), {}).verdict).toBe('eligible')
  })

  it('never calls a 복지로 life stage a sure match', () => {
    const youth = { conditions: { codes: [], age_min: 19, age_max: 39, life: ['청년'] } }
    expect(judge(youth, { age: 28 })).toEqual({ verdict: 'check', reasons: [{ label: '청년(만 19~39세)', ok: true }, { label: '세부 대상은 원문 확인', ok: null }] })
    expect(judge(youth, { age: 70 }).verdict).toBe('ineligible')
  })

  it('asks for a check when the text alone limits the age', () => {
    const text = (eligibility: string, title = '') => ({ conditions: { codes: [], age_min: null, age_max: null }, eligibility, title })
    expect(judge(text('대상 : 경기도 거주 19~39세 청년'), { age: 45 })).toEqual({ verdict: 'check', reasons: [{ label: '원문의 나이 조건 확인(19~39세)', ok: null }] })
    expect(judge(text('연령이 19세 이상 39세 이하로'), { age: 45 }).verdict).toBe('check')
    expect(judge(text('연령이 19세 이상 39세 이하로'), { age: 30 }).verdict).toBe('eligible')
    // Any mentioned range that fits is enough: the text may list several groups.
    expect(judge(text('○ 만65세 이상, 장애인(1~3급) ○ 중학생(14~16세 청소년)'), { age: 15 }).verdict).toBe('eligible')
    expect(judge(text('만 18세 미만의 아동'), { age: 18 }).verdict).toBe('check')
    expect(judge(text('국가건강검진에서 C형간염 항체 검사', '56세 C형간염 확진검사비 지원'), { age: 30 }).reasons[0].label).toBe('원문의 나이 조건 확인(56세)')
    // Households and generations are not ages, and an unknown age changes nothing.
    expect(judge(text('30세대 미만 공동주택', '고엽제환자 2세 수당'), { age: 45 }).verdict).toBe('eligible')
    expect(judge(text('19~39세 청년'), {}).verdict).toBe('eligible')
    // A coded age wins over the text.
    expect(judge({ ...text('65세 이상'), conditions: { codes: [], age_min: 19, age_max: 34 } }, { age: 28 }).verdict).toBe('eligible')
  })

  it('asks for a check when businesses or institutions are among the targets', () => {
    expect(verdict(['JA2101'], { gender: 'female', age: 28 })).toBe('check')
    expect(judge(item(['JA2203']), {}).reasons).toEqual([{ label: '사업자·기관 대상 포함', ok: null }])
    expect(verdict(['JA1201'], {})).toBe('eligible')
  })
})

describe('hasBasics', () => {
  it('needs both gender and age', () => {
    expect(hasBasics({ gender: 'female', age: 0 })).toBe(true)
    expect(hasBasics({ gender: 'female' })).toBe(false)
    expect(hasBasics({ age: 30 })).toBe(false)
  })
})
