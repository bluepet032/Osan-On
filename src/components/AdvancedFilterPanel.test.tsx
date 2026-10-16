import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_ADVANCED } from '../advancedFilters'
import type { Opportunity } from '../types'
import { Filters } from './Filters'

const base = {
  id: 'a', title: '혜택', source_name: '정부24', source_url: 'https://example.com/a', organizer: '기관', summary: '요약',
  primary_type: 'cash', field_tags: [], audience_tags: [], status: 'ongoing',
  relevance: { score: 100, reasons: [], decision: 'publish' }, first_seen_at: '2026-01-01T00:00:00+09:00',
  last_seen_at: '2026-01-01T00:00:00+09:00', sources: [], date_kind: 'ongoing',
} satisfies Opportunity

const items: Opportunity[] = [
  { ...base, id: 'both', apply_methods: ['online', 'visit'] },
  { ...base, id: 'visit', apply_methods: ['visit'] },
  { ...base, id: 'none', apply_methods: ['none'] },
  { ...base, id: 'unknown', apply_methods: [] },
]

const renderFilters = (advanced = EMPTY_ADVANCED, handlers = { onChange: vi.fn(), onChangeMany: vi.fn() }, list = items) => {
  render(<Filters items={list} domain="all" type="all" quick="" search="" status="" advanced={advanced} {...handlers} />)
  return handlers
}

describe('advanced filter panel', () => {
  afterEach(() => cleanup())

  it('starts closed and shows coverage and counts once opened', () => {
    renderFilters()
    expect(screen.queryByLabelText('신청 방법')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^상세 조건\s*\d*$/ }))
    expect(screen.getByLabelText('신청 방법').closest('label')?.querySelector('.advanced-coverage')).toHaveTextContent('정보 있는 혜택 75%')
    expect(screen.getByRole('option', { name: '온라인 신청 가능 (1)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '방문 신청 (2)' })).toBeInTheDocument()
  })

  it('folds the filter when few items can answer it, unless it is in use', () => {
    const sparse = [items[0], ...Array.from({ length: 9 }, (_, index) => ({ ...base, id: `u${index}`, apply_methods: [] }))]
    renderFilters(EMPTY_ADVANCED, undefined, sparse)
    fireEvent.click(screen.getByRole('button', { name: /^상세 조건\s*\d*$/ }))
    expect(screen.getByText('정보가 적은 조건 1개 (신청 방법)').closest('details')).toContainElement(screen.getByLabelText('신청 방법'))
    cleanup()

    renderFilters({ ...EMPTY_ADVANCED, apply: 'online' }, undefined, sparse)
    expect(screen.getByLabelText('신청 방법').closest('details')).toBeNull()
  })

  it('reports changes with URL parameter names and resets in one update', () => {
    const handlers = renderFilters({ ...EMPTY_ADVANCED, apply: 'visit', includeUnknown: true })
    expect(screen.getByRole('button', { name: /^상세 조건\s*\d*$/ })).toHaveTextContent('1')
    fireEvent.change(screen.getByLabelText('신청 방법'), { target: { value: 'online' } })
    expect(handlers.onChange).toHaveBeenLastCalledWith('apply', 'online')
    fireEvent.click(screen.getByRole('checkbox', { name: '정보가 없는 혜택도 함께 보기' }))
    expect(handlers.onChange).toHaveBeenLastCalledWith('unknown', '')
    fireEvent.click(screen.getByRole('button', { name: '상세 조건 초기화' }))
    expect(handlers.onChangeMany).toHaveBeenCalledWith({ apply: '', unknown: '' })
  })
})
