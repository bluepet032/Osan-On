import { describe, expect, it } from 'vitest'
import { advancedCoverage, advancedVerdict, coverageLabel, EMPTY_ADVANCED, hasAdvancedInfo, matchesAdvanced, readAdvanced, type AdvancedFilters } from './advancedFilters'
import type { Opportunity } from './types'

const item = (overrides: Partial<Opportunity> = {}) => ({
  id: 'x', title: '혜택', source_name: '정부24', source_url: 'https://example.com', organizer: '기관', summary: '요약',
  primary_type: 'cash', field_tags: [], audience_tags: [], status: 'ongoing', relevance: { score: 100, reasons: [], decision: 'publish' },
  first_seen_at: '2026-01-01T00:00:00+09:00', last_seen_at: '2026-01-01T00:00:00+09:00', sources: [], date_kind: 'ongoing',
  apply_methods: [], ...overrides,
}) as Opportunity
const filters = (values: Partial<AdvancedFilters>): AdvancedFilters => ({ ...EMPTY_ADVANCED, ...values })

describe('advanced filters', () => {
  it('matches an application method, with unknown when the source does not say', () => {
    expect(advancedVerdict(item({ apply_methods: ['online', 'visit'] }), filters({ apply: 'online' }))).toBe('match')
    expect(advancedVerdict(item({ apply_methods: ['visit'] }), filters({ apply: 'online' }))).toBe('mismatch')
    expect(advancedVerdict(item({ apply_methods: [] }), filters({ apply: 'online' }))).toBe('unknown')
    expect(advancedVerdict(item({ apply_methods: undefined }), filters({ apply: 'none' }))).toBe('unknown')
    expect(advancedVerdict(item(), EMPTY_ADVANCED)).toBe('match')
  })

  it('includes unknown items only when asked', () => {
    expect(matchesAdvanced(item(), filters({ apply: 'online' }))).toBe(false)
    expect(matchesAdvanced(item(), filters({ apply: 'online', includeUnknown: true }))).toBe(true)
    expect(matchesAdvanced(item({ apply_methods: ['visit'] }), filters({ apply: 'online', includeUnknown: true }))).toBe(false)
  })

  it('reads only known values from the URL', () => {
    expect(readAdvanced(new URLSearchParams('apply=online&unknown=1'))).toEqual({ apply: 'online', includeUnknown: true })
    expect(readAdvanced(new URLSearchParams('apply=fax&unknown=yes'))).toEqual(EMPTY_ADVANCED)
  })

  it('measures and labels coverage', () => {
    expect(hasAdvancedInfo(item({ apply_methods: ['none'] }), 'apply')).toBe(true)
    expect(advancedCoverage([item({ apply_methods: ['visit'] }), item(), item(), item()])).toEqual({ apply: 0.25 })
    expect(advancedCoverage([])).toBeNull()
    expect(coverageLabel(0.004)).toBe('정보 있는 혜택 1% 미만')
    expect(coverageLabel(0.998)).toBe('정보 있는 혜택 99%')
    expect(coverageLabel(1)).toBe('정보 있는 혜택 100%')
  })
})
