import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { clearDataCache } from './data'

const payload = { schema_version: 1, generated_at: '2026-07-30T12:00:00+09:00', items: [] }

describe('오산온', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    localStorage.clear()
    clearDataCache()
    window.location.hash = '#/'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
  })

  it('renders the benefit navigation, survey and empty state without login', async () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /오산온/ })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: '맞춤 혜택 설문' })).toBeInTheDocument()
    expect(screen.getByLabelText('판정 안내')).toHaveTextContent('원문에서 확인')
    await waitFor(() => expect(screen.getByText('조건에 맞는 혜택이 없습니다.')).toBeInTheDocument())
  })

  it('switches to likely benefits once gender and age are entered, and remembers them', async () => {
    const benefit = (id: string, codes: string[]) => ({
      id, title: `혜택 ${id}`, source_name: '정부24', source_url: `https://www.gov.kr/${id}`, organizer: '경기도 오산시',
      summary: '요약', primary_type: 'cash', field_tags: [], audience_tags: [], status: 'ongoing', date_kind: 'ongoing',
      relevance: { score: 100, reasons: [], decision: 'publish' }, first_seen_at: '2026-07-01T00:00:00+09:00', last_seen_at: '2026-07-30T00:00:00+09:00',
      sources: [], jurisdiction: 'osan', conditions: { codes, age_min: 19, age_max: 34 },
    })
    const data = { ...payload, items: [benefit('women', ['JA0102']), benefit('men', ['JA0101']), benefit('veterans', ['JA0329'])] }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes('active') ? data : payload })))
    render(<App />)
    fireEvent.click(screen.getByRole('radio', { name: '여성' }))
    fireEvent.change(screen.getByLabelText('만 나이'), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: '맞춤 혜택 보기' }))

    expect(await screen.findByRole('link', { name: '혜택 women' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '혜택 men' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /확인 필요 1/ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('osanon.profile')!)).toEqual({ gender: 'female', age: 28 })
  })

  it('offers a retry instead of developer steps when the data fails to load', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue({ ok: true, json: async () => payload })
    vi.stubGlobal('fetch', fetch)
    render(<App />)
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('pipeline')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText('조건에 맞는 혜택이 없습니다.')).toBeInTheDocument()
  })

  it('offers to reset the filters when nothing matches them', async () => {
    const item = {
      id: 'one', title: '혜택 one', source_name: '정부24', source_url: 'https://www.gov.kr/one', organizer: '경기도 오산시',
      summary: '요약', primary_type: 'cash', field_tags: [], audience_tags: [], status: 'ongoing', date_kind: 'ongoing',
      relevance: { score: 100, reasons: [], decision: 'publish' }, first_seen_at: '2026-07-01T00:00:00+09:00', last_seen_at: '2026-07-30T00:00:00+09:00',
      sources: [], jurisdiction: 'osan', conditions: null,
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes('active') ? { ...payload, items: [item] } : payload })))
    window.location.hash = '#/?q=없는검색어&type=loan'
    render(<App />)
    const empty = await screen.findByText('조건에 맞는 혜택이 없습니다.')
    expect(empty.parentElement).not.toHaveTextContent('파이프라인')
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }))
    expect(await screen.findByRole('link', { name: '혜택 one' })).toBeInTheDocument()
  })

  it('keeps the collection status for admins only', async () => {
    render(<App />)
    expect(screen.queryByRole('link', { name: '수집 상태' })).toBeNull()
    window.location.hash = '#/status'
    expect(await screen.findByRole('heading', { name: '관리자 전용 페이지' })).toBeInTheDocument()
    expect(screen.queryByText('출처별 상태')).toBeNull()
  })

  it('saves favorites without login and shows them in 내 혜택함', async () => {
    const item = {
      id: 'one', title: '혜택 one', source_name: '정부24', source_url: 'https://www.gov.kr/one', organizer: '경기도 오산시',
      summary: '요약', primary_type: 'cash', field_tags: [], audience_tags: [], status: 'ongoing', date_kind: 'ongoing',
      relevance: { score: 100, reasons: [], decision: 'publish' }, first_seen_at: '2026-07-01T00:00:00+09:00', last_seen_at: '2026-07-30T00:00:00+09:00',
      sources: [], jurisdiction: 'osan', conditions: null,
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url.includes('active') ? { ...payload, items: [item] } : payload })))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '관심 등록' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: '관심 해제' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '내 혜택함' }))
    expect(await screen.findByRole('link', { name: '혜택 one' })).toBeInTheDocument()
    expect(screen.getByText('로그인 없이 찜한 혜택은 이 브라우저에 저장됩니다.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '찜 해제' }))
    expect(await screen.findByText('아직 찜한 혜택이 없습니다.')).toBeInTheDocument()
  })

  it('says browser favorites could not be loaded instead of calling them gone', async () => {
    localStorage.setItem('osanon.personal.v1', JSON.stringify({ version: 1, favorites: ['one'], read: [], hidden: [] }))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '내 혜택함' }))
    expect(await screen.findByText(/찜한 혜택을 불러오지 못했습니다/)).toBeInTheDocument()
    expect(screen.queryByText('아직 찜한 혜택이 없습니다.')).toBeNull()
    expect(screen.queryByText(/공개 목록에서 내려간/)).toBeNull()
  })

  it('explains what an account adds and stored data', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '내 혜택함' }))
    expect(await screen.findByRole('heading', { name: '로그인하면 더 할 수 있어요' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '로그인 또는 가입' }))
    expect(screen.getByRole('dialog', { name: '오산온 계정' })).toHaveTextContent('맞춤 조건(성별·나이')
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google로 계속' })).toBeDisabled()
  })
})

