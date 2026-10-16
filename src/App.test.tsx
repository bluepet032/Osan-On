import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { clearDataCache } from './data'

const payload = { schema_version: 1, generated_at: '2026-07-30T12:00:00+09:00', items: [] }

describe('QuestBoard', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    localStorage.clear()
    clearDataCache()
    window.location.hash = '#/'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
  })

  it('renders the main opportunity navigation and empty state without login', async () => {
    render(<App />)
    expect(screen.getByRole('link', { name: /QuestBoard/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /전체/ })).toBeInTheDocument()
    expect(screen.getByLabelText('분류 색상 안내')).toHaveTextContent('인디')
    await waitFor(() => expect(screen.getByText('조건에 맞는 공고가 없습니다.')).toBeInTheDocument())
  })

  it('requires Google login for personal features and explains stored data', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '내 비서' }))
    expect(await screen.findByRole('heading', { name: 'Google 로그인이 필요합니다' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '로그인 또는 가입' }))
    expect(screen.getByRole('dialog', { name: 'QuestBoard 계정' })).toHaveTextContent('찜한 공고와 일정')
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google로 계속' })).toBeDisabled()
  })
})

