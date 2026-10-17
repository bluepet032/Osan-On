import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity, PersonalState } from '../types'
import { OpportunityRow, type ListView } from './OpportunityRow'

vi.mock('../account', () => ({ useAccount: () => ({ user: null, firebase: null, openLogin: () => {} }) }))

const item = {
  id: 'one', title: '청년 월세 지원', source_name: '정부24', source_url: 'https://www.gov.kr/one', organizer: '경기도 오산시',
  summary: '월세를 최대 12개월 지원합니다', primary_type: 'cash', field_tags: ['주거'], audience_tags: [], relevance: { score: 100, reasons: [], decision: 'publish' },
  first_seen_at: '2026-07-01T00:00:00+09:00', last_seen_at: '2026-07-30T00:00:00+09:00', sources: [], jurisdiction: 'osan',
  status: 'ongoing', date_kind: 'ongoing',
} as unknown as Opportunity
const personal: PersonalState = { version: 1, favorites: [], read: [], hidden: [] }
const row = (view?: ListView) => render(<OpportunityRow item={item} personal={personal} onToggle={() => {}} view={view} judgement={{ verdict: 'eligible', reasons: [] }} />)

describe('OpportunityRow views', () => {
  afterEach(() => cleanup())

  it('shows the full card by default', () => {
    row()
    expect(screen.getByText(/월세를 최대 12개월/)).toBeInTheDocument()
    expect(screen.getByText('주거')).toBeInTheDocument()
    expect(screen.getByText('가능성 높음')).toBeInTheDocument()
  })

  it('keeps one slim line with badges in the list view', () => {
    row('list')
    expect(screen.getByRole('link', { name: '청년 월세 지원' })).toBeInTheDocument()
    expect(screen.getByText('가능성 높음')).toBeInTheDocument()
    expect(screen.queryByText(/월세를 최대 12개월/)).toBeNull()
    expect(screen.queryByText('주거')).toBeNull()
  })

  it('keeps only the title in the title view', () => {
    row('compact')
    expect(screen.getByRole('link', { name: '청년 월세 지원' })).toBeInTheDocument()
    expect(screen.queryByText('가능성 높음')).toBeNull()
    expect(screen.queryByText(/월세를 최대 12개월/)).toBeNull()
    expect(screen.getByRole('button', { name: '관심 등록' })).toBeInTheDocument()
  })

  it('shows everything once a slim row is opened', () => {
    row('compact')
    fireEvent.click(screen.getByRole('button', { name: '펼치기' }))
    expect(screen.getByText(/월세를 최대 12개월/)).toBeInTheDocument()
    expect(screen.getByText('가능성 높음')).toBeInTheDocument()
  })
})
