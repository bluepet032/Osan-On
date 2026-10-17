import { describe, expect, it } from 'vitest'
import { hasBasics, judge, type Profile } from './eligibility'
import type { Conditions } from './types'

const item = (codes: string[], age_min: number | null = null, age_max: number | null = null) => ({ conditions: { codes, age_min, age_max } as Conditions })
const UNCONFIRMED = { label: '지원 대상 자격은 원문 확인', ok: null }
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
    // Both genders checked is no restriction, so it cannot confirm anything either.
    expect(verdict(['JA0101', 'JA0102'], {})).toBe('check')
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
    // A matching band passes the means test but does not say who the benefit is for.
    expect(judge(item(['JA0201', 'JA0202']), { income: 'JA0202' }).reasons).toEqual([{ label: '중위소득 50% 이하·중위소득 51~75% 대상', ok: true }, UNCONFIRMED])
    expect(verdict(['JA0201', 'JA0202'], { income: 'JA0204' })).toBe('ineligible')
    expect(verdict(['JA0201', 'JA0202'], {})).toBe('check')
  })

  it('matches personal traits, where JA0322 means anyone', () => {
    expect(verdict(['JA0328'], { traits: ['JA0328'] })).toBe('eligible')
    expect(verdict(['JA0328'], { traits: [] })).toBe('ineligible')
    expect(verdict(['JA0328'], {})).toBe('check')
    expect(verdict(['JA0328', 'JA0322'], { traits: [] })).toBe('check')
  })

  it('matches household, where JA0410 means anyone', () => {
    expect(verdict(['JA0411'], { household: [] })).toBe('ineligible')
    expect(verdict(['JA0411'], { household: ['JA0411', 'JA0404'] })).toBe('eligible')
    expect(verdict(['JA0410'], {})).toBe('check')
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
    expect(verdict(allIncome, { income: 'JA0205' })).toBe('check')
    expect(judge(item(allIncome), {}).reasons).toEqual([UNCONFIRMED])
  })

  it('reads an upper age of 100 or more as no upper limit', () => {
    expect(judge(item([], 19, 120), { age: 28 }).reasons).toEqual([{ label: '만 19세 이상', ok: true }, UNCONFIRMED])
    expect(judge(item([], null, 120), {}).verdict).toBe('check')
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
    // A narrow range in the text that fits is a match like a coded one.
    expect(judge(text('연령이 19세 이상 39세 이하로'), { age: 30 })).toEqual({ verdict: 'eligible', reasons: [{ label: '원문 나이 19세 이상 39세 이하', ok: true }] })
    // Any mentioned range that fits is enough: the text may list several groups.
    expect(judge(text('○ 만65세 이상, 장애인(1~3급) ○ 중학생(14~16세 청소년)'), { age: 15 }).verdict).toBe('eligible')
    // A broad adult range in the text says nothing about who the benefit is for.
    expect(judge(text('만 19세 이상 국민'), { age: 30 }).verdict).toBe('check')
    expect(judge(text('만 18세 미만의 아동'), { age: 18 }).verdict).toBe('check')
    expect(judge(text('국가건강검진에서 C형간염 항체 검사', '56세 C형간염 확진검사비 지원'), { age: 30 }).reasons[0].label).toBe('원문의 나이 조건 확인(56세)')
    // Households and generations are not ages, and an unknown age changes nothing.
    expect(judge(text('30세대 미만 공동주택', '고엽제환자 2세 수당'), { age: 45 }).reasons).toEqual([UNCONFIRMED])
    expect(judge(text('19~39세 청년'), {}).verdict).toBe('check')
    // A coded age wins over the text.
    expect(judge({ ...text('65세 이상'), conditions: { codes: [], age_min: 19, age_max: 34 } }, { age: 28 }).verdict).toBe('eligible')
  })

  it('asks for a check when businesses or institutions are among the targets', () => {
    expect(verdict(['JA2101'], { gender: 'female', age: 28 })).toBe('check')
    expect(judge(item(['JA2203']), {}).reasons).toEqual([{ label: '사업자·기관 대상 포함', ok: null }])
    expect(judge(item(['JA1201']), {}).reasons).toEqual([UNCONFIRMED])
  })
})

// 정부24 marks "anyone" by checking every option, so these codes narrow nothing.
const EVERYONE = ['JA0101', 'JA0102', 'JA0201', 'JA0202', 'JA0203', 'JA0204', 'JA0205', 'JA0322', 'JA0410']
const gov24 = (eligibility: string, age_min: number | null = null, age_max: number | null = 120, codes = EVERYONE, title = '') =>
  ({ conditions: { codes, age_min, age_max }, eligibility, title })
const woman30: Profile = { gender: 'female', age: 30 }

describe('judge: core eligibility must be confirmed', () => {
  it('does not call a status-only benefit likely from gender and age alone', () => {
    // Real 정부24 records: the status that qualifies people is only in the text.
    const shelter = gov24('피해자 및 동반아동의 입소기간이 4개월 이상이고 자립을 위한 준비가 필요한 경우', null, 120, EVERYONE, '가정폭력 피해자 보호시설 퇴소자 자립지원금')
    const atomic = gov24('경기도에 거주하는 원자폭탄 피해자와 그 직계비속', 19, 120, EVERYONE, '경기도 원자폭탄 피해자, 피해자 후손 의료비 감면')
    const postnatal = gov24('부 또는 모가 출생일 및 신청일 현재 경기도에 주민등록을 두고 있을 것, 영아의 출생일이 12개월이 지나지 않았을 것', null, null,
      [...EVERYONE, 'JA0301', 'JA0302', 'JA0303', 'JA0313', 'JA0317', 'JA0326', 'JA0328', 'JA0401', 'JA0403', 'JA0404', 'JA0411'], '경기도산후조리비지원')
    for (const benefit of [shelter, atomic, postnatal]) {
      expect(judge(benefit, woman30).verdict).toBe('check')
      expect(judge(benefit, { ...woman30, income: 'JA0203', traits: [], household: [] }).verdict).toBe('check')
    }
    expect(judge(atomic, woman30).reasons).toContainEqual({ label: '만 19세 이상', ok: true })
    expect(judge(atomic, woman30).reasons).toContainEqual({ label: '원문 자격 확인: 피해자', ok: null })
    expect(judge(postnatal, woman30).reasons).toEqual([UNCONFIRMED])
  })

  it('keeps recommending benefits whose coded target is the age or gender itself', () => {
    expect(judge(gov24('도내 19~39세 청년', 19, 39), woman30).verdict).toBe('eligible')
    expect(judge(gov24('만 34세이하 청년', 15, 34), { gender: 'male', age: 25 }).verdict).toBe('eligible')
    expect(judge(gov24('만 65세 이상 어르신', 65, 120), { gender: 'male', age: 70 }).verdict).toBe('eligible')
    expect(judge(gov24('대한민국 여성', 19, 120, ['JA0102', 'JA0201', 'JA0202', 'JA0203', 'JA0204', 'JA0205', 'JA0322', 'JA0410']), woman30).verdict).toBe('eligible')
  })

  it('does not count a broad working-age range as a target', () => {
    // 19~64 is the default adult span, not a youth or senior target.
    expect(judge(gov24('퇴직공제 적립일수 252일 이상인 건설노동자', 19, 64), woman30).verdict).toBe('check')
    expect(judge(gov24('청년', 18, 39), woman30).verdict).toBe('eligible')
  })

  it('treats a benefit the text opens to everyone as a match', () => {
    expect(judge(gov24('오산시에 주민등록을 둔 모든 시민 (등록외국인 포함)'), woman30)).toEqual({ verdict: 'eligible', reasons: [{ label: '원문상 누구나 대상', ok: true }] })
    expect(judge(gov24('○ 전 국민 / 지원대상과 동일', 19), woman30).verdict).toBe('eligible')
    expect(judge(gov24('국민 누구나 가능'), woman30).verdict).toBe('eligible')
    expect(judge(gov24('○ 만 14세 이상이면 누구든지 발급 가능', null, null, EVERYONE, '오산화폐 오색전 인센티브 지급'), woman30).verdict).toBe('eligible')
    expect(judge(gov24('○ 민간인 - 별도 신청자격 없음 / ○ 일반인 대상', 6), woman30).verdict).toBe('eligible')
    // "누구나" with requirements attached still needs the requirements read.
    expect(judge(gov24('돌봄이 필요한 도민 누구나 ○ 3가지 위기 상황 모두 충족하여야 지원 가능'), woman30).verdict).toBe('check')
    expect(judge(gov24('재난경험자면 누구나: 직접 피해를 입은 당사자, 피해자의 가족'), woman30).verdict).toBe('check')
  })

  it('asks for a check when the text names a status the profile cannot show', () => {
    const loan = gov24('아래의 한가지 기준을 충족하는 19세 이상 34세 이하 청년 - 차상위계층 이하인자 - 개인신용평점 하위 20%', 19, 34)
    expect(judge(loan, { gender: 'male', age: 25 })).toEqual({ verdict: 'check', reasons: [{ label: '만 19~34세', ok: true }, { label: '원문 자격 확인: 차상위', ok: null }] })
    expect(judge(gov24('구직단념청년, 자립준비청년, 청소년복지시설 입·퇴소 청년', 18, 34), { age: 25 }).reasons).toContainEqual({ label: '원문 자격 확인: 퇴소', ok: null })
    // Soldiers and debtors are statuses too, even inside a youth age range.
    expect(judge(gov24('학자금대출을 받은 군 복무자 - 현역병, 상근예비역', 18, 35), woman30).verdict).toBe('check')
    expect(judge(gov24('34세 이하 전역예정간부', 20, 34), woman30).verdict).toBe('check')
    expect(judge(gov24('신청일 기준 분할상환약정을 체결한 채무자 중 미납액이 없는 자', 18, 40), woman30).verdict).toBe('check')
    // 수급자격 is the right to a benefit, and a footnote elaborates rather than sets the target.
    const disabled: Profile = { gender: 'male', age: 45, traits: ['JA0328'] }
    expect(judge(gov24('이직사유가 법 제58조에 따른 수급자격의 제한사유에 해당하지 아니할 것', 19, 39), woman30).verdict).toBe('eligible')
    expect(judge(gov24('○ 만6세∼만65세 미만 등록 장애인 * 활동지원 수급자였다가 65세 이후 혼자서 사회활동이 어려운 경우에는 지원 가능', 6, 64, [...EVERYONE.filter(code => code !== 'JA0322'), 'JA0328']), disabled).verdict).toBe('eligible')
    expect(judge(gov24('○ 지원대상 - 산모 또는 배우자가 수급자 또는 차상위계층*에 해당하는 출산가정 * 차상위본인부담경감, 차상위자활', 18, 44), woman30).reasons).toContainEqual({ label: '원문 자격 확인: 수급자, 차상위', ok: null })
    // An exemption or exclusion for a status does not make it the target.
    expect(judge(gov24('만 19~34세 청년 (군 복무기간만큼 연령 연장)', 19, 34), woman30).verdict).toBe('eligible')
    expect(judge(gov24('도내 19~39세 청년 (단, 기초생활수급자는 제외)', 19, 39), woman30).verdict).toBe('eligible')
    expect(judge(gov24('LPG호스를 사용하는 가구(단, 기초생활수급자는 자부담 면제)', 19, 39), woman30).verdict).toBe('eligible')
  })

  it('does not take a matching income band for the target', () => {
    const lowIncome = ['JA0201', 'JA0202', 'JA0203']
    const senior: Profile = { gender: 'male', age: 70, income: 'JA0203', traits: [], household: [] }
    // Real 정부24 records: the income band is a means test on top of a status.
    expect(judge(gov24('「예술인 복지법」제2조에 따른 예술인 - 기준중위소득 125% 이하인 자', null, 120, lowIncome, '무료 소송대리 서비스(예술인)'), senior).verdict).toBe('check')
    expect(judge(gov24('경상남도 거주기간이 3개월 이상, 연소득 3,500만원 이하', 18, 120, lowIncome, '경남동행론'), senior).verdict).toBe('check')
    // With a coded target that matches, the band is just one more condition met.
    expect(judge(gov24('만 60세 이상 어르신', 60, 120, lowIncome), senior).verdict).toBe('eligible')
    expect(judge(gov24('학대피해노인 및 그 가족', 65, 120), senior).reasons).toContainEqual({ label: '원문 자격 확인: 학대피해', ok: null })
  })

  it('asks for a check when a national service names another region in its title', () => {
    const national = (title: string) => ({ ...gov24('국민 누구나', 19), title, jurisdiction: 'national' as const })
    expect(judge(national('발전소 시설 견학(울산)'), woman30).reasons).toContainEqual({ label: '다른 지역 대상(울산)', ok: null })
    expect(judge(national('의료 서비스(대구보훈병원)'), woman30).verdict).toBe('check')
    // Gyeonggi, nationwide or non-place words in brackets leave it alone.
    expect(judge(national('국민내일배움카드(전국)'), woman30).verdict).toBe('eligible')
    expect(judge(national('청년 월세(경기)'), woman30).verdict).toBe('eligible')
    expect(judge(national('무료 소송대리 서비스(예술인)'), woman30).reasons.some(reason => reason.label.startsWith('다른 지역'))).toBe(false)
    expect(judge({ ...national('발전소 시설 견학(울산)'), jurisdiction: 'osan' as const }, woman30).verdict).toBe('eligible')
  })

  it('never calls an income band guessed from a 복지로 category a sure match', () => {
    // Real 복지로 record: 저소득 became 중위소득 100% 이하, but the text wants 수급자·차상위.
    const meals = { conditions: { codes: ['JA0201', 'JA0202', 'JA0203'], age_min: null, age_max: null, inferred: ['저소득'] }, eligibility: '60세이상 거동이 불편한 저소득 재가노인' }
    const senior: Profile = { gender: 'male', age: 70, income: 'JA0203', traits: [], household: [] }
    expect(judge(meals, senior).verdict).toBe('check')
    expect(judge(meals, senior).reasons).toContainEqual({ label: '저소득 기준은 원문 확인', ok: null })
    expect(judge(meals, { ...senior, income: 'JA0205' }).verdict).toBe('ineligible')
  })
})

describe('hasBasics', () => {
  it('needs both gender and age', () => {
    expect(hasBasics({ gender: 'female', age: 0 })).toBe(true)
    expect(hasBasics({ gender: 'female' })).toBe(false)
    expect(hasBasics({ age: 30 })).toBe(false)
  })
})
