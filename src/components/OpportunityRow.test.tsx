import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity, PersonalState } from '../types'
import { OpportunityRow } from './OpportunityRow'

vi.mock('../account', () => ({ useAccount: () => ({ user: null, firebase: null, openLogin: () => {} }) }))

const base = {
  id: 'one', title: '혜택', source_name: '정부24', source_url: 'https://www.gov.kr/one', organizer: '경기도 오산시',
  summary: '요약', primary_type: 'cash', field_tags: [], audience_tags: [], relevance: { score: 100, reasons: [], decision: 'publish' },
  first_seen_at: '2026-07-01T00:00:00+09:00', last_seen_at: '2026-07-30T00:00:00+09:00', sources: [], jurisdiction: 'osan',
} as unknown as Opportunity
const personal: PersonalState = { version: 1, favorites: [], read: [], hidden: [] }
const row = (item: Partial<Opportunity>) => render(<OpportunityRow item={{ ...base, ...item }} personal={personal} onToggle={() => {}} />)

describe('OpportunityRow application period', () => {
  afterEach(() => cleanup())

  it('shows the source wording when the period is not a date range', () => {
    row({ status: 'unknown', date_kind: 'inquiry', apply_period: '분기별 모집(3·6·9·12월)' })
    expect(screen.getByText('분기별 모집(3·6·9·12월)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '펼치기' }))
    expect(screen.getByText('신청 기간').nextElementSibling).toHaveTextContent('분기별 모집(3·6·9·12월)')
  })

  it('does not repeat wording that only says 상시', () => {
    row({ status: 'ongoing', date_kind: 'ongoing', apply_period: '상시신청' })
    expect(screen.queryByText('상시신청')).toBeNull()
  })

  it('keeps showing a dated range as dates', () => {
    row({ status: 'open', date_kind: 'exact', d_day: 10, recruit_start: '2026-03-02', recruit_end: '2026-12-31', apply_period: '2026.03.02 ~ 2026.12.31' })
    expect(screen.queryByText('2026.03.02 ~ 2026.12.31')).toBeNull()
    expect(screen.getByText(/2026\. 12\. 31/)).toBeInTheDocument()
  })
})
