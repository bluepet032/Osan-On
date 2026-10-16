import { describe, expect, it } from 'vitest'
import { advancedCoverage, advancedVerdict, coverageLabel, EMPTY_ADVANCED, hasAdvancedInfo, matchesAdvanced, prizeLabel, readAdvanced, type AdvancedFilters } from './advancedFilters'
import type { Opportunity } from './types'

const item = (overrides: Partial<Opportunity> = {}) => ({
  audience_tags: [], regions: [], mode: '', fee: 'unknown', prize_manwon: null, ...overrides,
}) as Opportunity
const filters = (overrides: Partial<AdvancedFilters>) => ({ ...EMPTY_ADVANCED, ...overrides })

describe('advanced filters', () => {
  it('matches everything when no filter is set', () => {
    expect(advancedVerdict(item(), EMPTY_ADVANCED)).toBe('match')
  })

  describe('region', () => {
    it('matches the region and nationwide notices', () => {
      expect(advancedVerdict(item({ regions: ['서울'] }), filters({ region: '서울' }))).toBe('match')
      expect(advancedVerdict(item({ regions: ['전국'] }), filters({ region: '서울' }))).toBe('match')
      expect(advancedVerdict(item({ regions: ['경남', '부산', '울산'] }), filters({ region: '부산' }))).toBe('match')
      expect(advancedVerdict(item({ regions: ['경기'] }), filters({ region: '서울' }))).toBe('mismatch')
    })
    it('selecting 전국 keeps only nationwide notices', () => {
      expect(advancedVerdict(item({ regions: ['전국'] }), filters({ region: '전국' }))).toBe('match')
      expect(advancedVerdict(item({ regions: ['서울'] }), filters({ region: '전국' }))).toBe('mismatch')
    })
    it('is unknown without region data, including data generated before regions existed', () => {
      expect(advancedVerdict(item({ regions: [] }), filters({ region: '서울' }))).toBe('unknown')
      expect(advancedVerdict(item({ regions: undefined }), filters({ region: '서울' }))).toBe('unknown')
    })
  })

  describe('mode', () => {
    it('treats hybrid events as both online and offline', () => {
      expect(advancedVerdict(item({ mode: 'hybrid' }), filters({ mode: 'online' }))).toBe('match')
      expect(advancedVerdict(item({ mode: 'hybrid' }), filters({ mode: 'offline' }))).toBe('match')
      expect(advancedVerdict(item({ mode: 'online' }), filters({ mode: 'offline' }))).toBe('mismatch')
      expect(advancedVerdict(item({ mode: '' }), filters({ mode: 'online' }))).toBe('unknown')
      expect(advancedVerdict(item({ mode: undefined }), filters({ mode: 'online' }))).toBe('unknown')
    })
  })

  describe('fee', () => {
    it('separates free, paid and unknown', () => {
      expect(advancedVerdict(item({ fee: 'free' }), filters({ fee: 'free' }))).toBe('match')
      expect(advancedVerdict(item({ fee: 'paid' }), filters({ fee: 'free' }))).toBe('mismatch')
      expect(advancedVerdict(item({ fee: 'unknown' }), filters({ fee: 'free' }))).toBe('unknown')
    })
  })

  describe('audience', () => {
    it('includes notices open to everyone', () => {
      expect(advancedVerdict(item({ audience_tags: ['대학생'] }), filters({ audience: '대학생' }))).toBe('match')
      expect(advancedVerdict(item({ audience_tags: ['누구나'] }), filters({ audience: '대학생' }))).toBe('match')
      expect(advancedVerdict(item({ audience_tags: ['청소년'] }), filters({ audience: '대학생' }))).toBe('mismatch')
      expect(advancedVerdict(item({ audience_tags: [] }), filters({ audience: '대학생' }))).toBe('unknown')
    })
  })

  describe('prize', () => {
    it('handles amounts, unknown amounts and missing data', () => {
      expect(advancedVerdict(item({ prize_manwon: 500 }), filters({ prize: '500' }))).toBe('match')
      expect(advancedVerdict(item({ prize_manwon: 499 }), filters({ prize: '500' }))).toBe('mismatch')
      expect(advancedVerdict(item({ prize_manwon: 0 }), filters({ prize: 'any' }))).toBe('match')
      expect(advancedVerdict(item({ prize_manwon: 0 }), filters({ prize: '100' }))).toBe('unknown')
      expect(advancedVerdict(item({ prize_manwon: null }), filters({ prize: 'any' }))).toBe('unknown')
      expect(advancedVerdict(item({ prize_manwon: undefined }), filters({ prize: 'any' }))).toBe('unknown')
    })
  })

  it('combines filters: any mismatch excludes even when unknown items are included', () => {
    const combined = filters({ region: '서울', fee: 'free', includeUnknown: true })
    expect(advancedVerdict(item({ regions: ['서울'], fee: 'free' }), combined)).toBe('match')
    expect(advancedVerdict(item({ regions: ['서울'], fee: 'unknown' }), combined)).toBe('unknown')
    expect(advancedVerdict(item({ regions: ['경기'], fee: 'unknown' }), combined)).toBe('mismatch')
    expect(matchesAdvanced(item({ regions: ['서울'], fee: 'unknown' }), combined)).toBe(true)
    expect(matchesAdvanced(item({ regions: ['경기'], fee: 'unknown' }), combined)).toBe(false)
    expect(matchesAdvanced(item({ regions: ['서울'], fee: 'unknown' }), { ...combined, includeUnknown: false })).toBe(false)
  })

  it('reads only known values from the URL', () => {
    const parsed = readAdvanced(new URLSearchParams('region=서울&mode=online&fee=free&aud=청소년&prize=500&unknown=1'))
    expect(parsed).toEqual({ region: '서울', mode: 'online', fee: 'free', audience: '청소년', prize: '500', includeUnknown: true })
    const junk = readAdvanced(new URLSearchParams('region=화성&mode=both&fee=0&aud=x&prize=7&unknown=yes'))
    expect(junk).toEqual(EMPTY_ADVANCED)
  })

  it('knows which items carry each filter fact, whatever value would be chosen', () => {
    expect(hasAdvancedInfo(item({ regions: ['전국'] }), 'region')).toBe(true)
    expect(hasAdvancedInfo(item({ regions: undefined }), 'region')).toBe(false)
    expect(hasAdvancedInfo(item({ mode: 'hybrid' }), 'mode')).toBe(true)
    expect(hasAdvancedInfo(item({ fee: 'unknown' }), 'fee')).toBe(false)
    expect(hasAdvancedInfo(item({ audience_tags: ['누구나'] }), 'audience')).toBe(true)
    // Other audience tags (e.g. 공무원) are not filter options and say nothing the filter can use.
    expect(hasAdvancedInfo(item({ audience_tags: ['공무원'] }), 'audience')).toBe(false)
    expect(hasAdvancedInfo(item({ prize_manwon: 0 }), 'prize')).toBe(true)
    expect(hasAdvancedInfo(item({ prize_manwon: undefined }), 'prize')).toBe(false)
  })

  it('measures the share of items with each fact', () => {
    const coverage = advancedCoverage([item({ regions: ['서울'], fee: 'free' }), item({ regions: ['부산'] }), item(), item()])
    expect(coverage).toEqual({ region: 0.5, mode: 0, fee: 0.25, audience: 0, prize: 0 })
    expect(advancedCoverage([])).toBeNull()
  })

  it('labels coverage without rounding a few items to 0% or most items to 100%', () => {
    expect(coverageLabel(0.04)).toBe('정보 있는 공고 4%')
    expect(coverageLabel(0.004)).toBe('정보 있는 공고 1% 미만')
    expect(coverageLabel(0)).toBe('정보 있는 공고 0%')
    expect(coverageLabel(0.998)).toBe('정보 있는 공고 99%')
    expect(coverageLabel(1)).toBe('정보 있는 공고 100%')
  })

  it('labels prize amounts', () => {
    expect(prizeLabel(1500)).toBe('1,500만원')
    expect(prizeLabel(0)).toBe('상금·상품 있음(금액 미상)')
    expect(prizeLabel(null)).toBe('정보 없음')
  })
})
