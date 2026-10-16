import { describe, expect, it } from 'vitest'
import { compareOpportunities, matchesOpportunity, type OpportunityFilters } from './filtering'
import type { Opportunity } from './types'

const filters: OpportunityFilters = {
  domain: 'all', type: 'all', quick: '', search: '', field: '', status: '',
}

const item = {
  id: 'sample', title: 'AI 인디게임 공모전', source_name: '테스트', source_url: 'https://example.com',
  organizer: '게임재단', summary: '대학생 개발자를 위한 공모전', primary_type: 'contest', field_tags: ['AI', '인디'],
  audience_tags: ['대학생'], status: 'open', relevance: { score: 80, reasons: [], decision: 'publish' },
  first_seen_at: '2026-01-01T00:00:00+09:00', last_seen_at: '2026-01-01T00:00:00+09:00', sources: [],
  date_kind: 'exact', location: '서울', mode: 'online', fee: 'free', is_adjacent: false,
} satisfies Opportunity

describe('matchesOpportunity', () => {
  it('combines search and basic filters', () => {
    expect(matchesOpportunity(item, { ...filters, search: '게임재단', field: 'AI' })).toBe(true)
    expect(matchesOpportunity(item, { ...filters, search: '게임재단', field: '데이터' })).toBe(false)
  })

  it('matches every whitespace-separated search term across fields', () => {
    const companyItem = { ...item, organizer: '콘텐츠 기업 지원센터' }
    expect(matchesOpportunity(companyItem, { ...filters, search: '게임 기업' })).toBe(true)
    expect(matchesOpportunity(companyItem, { ...filters, search: '게임 의료' })).toBe(false)
  })

  it('hides adjacent opportunities by default but exposes their selected type', () => {
    const adjacent = { ...item, primary_type: 'employment', is_adjacent: true } satisfies Opportunity
    expect(matchesOpportunity(adjacent, filters)).toBe(false)
    expect(matchesOpportunity(adjacent, { ...filters, type: 'employment' })).toBe(true)
  })

  it('filters by field tab and treats items without a domain as IT·게임', () => {
    const video = { ...item, domain: 'design_media' } satisfies Opportunity
    expect(matchesOpportunity(item, { ...filters, domain: 'it' })).toBe(true)
    expect(matchesOpportunity(video, { ...filters, domain: 'it' })).toBe(false)
    expect(matchesOpportunity(video, { ...filters, domain: 'design_media' })).toBe(true)
    expect(matchesOpportunity(video, filters)).toBe(true)
  })

  it('uses 초성, synonyms and, only when asked, typo tolerance', () => {
    expect(matchesOpportunity(item, { ...filters, search: 'ㅇㄷㄱㅇ' })).toBe(true)
    expect(matchesOpportunity(item, { ...filters, search: 'indie' })).toBe(true)
    expect(matchesOpportunity(item, { ...filters, search: '공모젼' })).toBe(false)
    expect(matchesOpportunity(item, { ...filters, search: '공모젼' }, { fuzzy: true })).toBe(true)
  })

  it('applies detail conditions together with search, tabs and typo tolerance', () => {
    const seoul = { ...item, id: 'seoul', regions: ['서울'] } satisfies Opportunity
    const noRegion = { ...item, id: 'none', regions: [] } satisfies Opportunity
    const advanced = { region: '서울', mode: '', fee: '', audience: '', prize: '', includeUnknown: false }
    expect(matchesOpportunity(seoul, { ...filters, search: '인디', advanced })).toBe(true)
    expect(matchesOpportunity(noRegion, { ...filters, search: '인디', advanced })).toBe(false)
    expect(matchesOpportunity(noRegion, { ...filters, search: '인디', advanced: { ...advanced, includeUnknown: true } })).toBe(true)
    expect(matchesOpportunity(seoul, { ...filters, search: '인디개임', advanced }, { fuzzy: true })).toBe(true)
    expect(matchesOpportunity(seoul, { ...filters, domain: 'design_media', advanced })).toBe(false)
  })
})

describe('compareOpportunities', () => {
  const make = (id: string, prize: number | null, dDay: number | null) => ({ ...item, id, prize_manwon: prize, d_day: dDay })

  it('sorts by prize, largest first, with unknown prizes last and the sooner deadline breaking ties', () => {
    const items = [make('none', null, 1), make('small', 50, 5), make('big-late', 1000, 20), make('big-soon', 1000, 3)]
    expect(items.sort(compareOpportunities('prize')).map(value => value.id)).toEqual(['big-soon', 'big-late', 'small', 'none'])
  })

  it('keeps the deadline order with undated items last', () => {
    const items = [make('undated', 100, null), make('later', 0, 9), make('sooner', 0, 2)]
    expect(items.sort(compareOpportunities('deadline')).map(value => value.id)).toEqual(['sooner', 'later', 'undated'])
  })
})
