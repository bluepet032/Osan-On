import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as firestore from 'firebase/firestore'
import { clearDataCache } from './data'
import { PersonalProvider, usePersonalState } from './personal'
import * as personalLogic from './personalLogic'
import type { Opportunity } from './types'

const mocks = vi.hoisted(() => ({
  records: {} as Record<string, { id: string; data: () => unknown }[]>,
  deleteDoc: vi.fn(),
  setDocument: vi.fn(),
  transactions: vi.fn(),
  user: { uid: 'test-user' } as { uid: string } | null,
}))

// Firebase arrives through the account context once loaded; here it is the mocked Firestore below.
// One stable object, like the provider's state, so effects that depend on it do not re-run every render.
const services = { db: {}, firestore }
vi.mock('./account', () => ({ useAccount: () => ({ user: mocks.user, ready: true, openLogin: vi.fn(), firebase: services }) }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (path: string, receive: (snapshot: unknown) => void) => {
    receive({ docs: mocks.records[path.split('/').at(-1) ?? ''] ?? [] })
    return vi.fn()
  },
  runTransaction: async (_db: unknown, callback: (transaction: unknown) => Promise<void>) => {
    mocks.transactions()
    return callback({
      get: async () => ({ exists: () => false }),
      set: mocks.setDocument,
    })
  },
  deleteDoc: mocks.deleteDoc,
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
}))

const savedItem: Opportunity = {
  id: 'notice-1', title: '게임 공모전', source_name: '테스트', source_url: 'https://example.com/notice',
  organizer: '기관', summary: '게임 개발 공모전', primary_type: 'contest', field_tags: ['게임'], audience_tags: [],
  status: 'today', relevance: { score: 90, reasons: [], decision: 'publish' },
  first_seen_at: '2026-10-01T00:00:00+09:00', last_seen_at: '2026-10-13T00:00:00+09:00', sources: [],
  date_kind: 'exact', recruit_end: '2026-10-13',
}

function Probe() {
  const personal = usePersonalState()
  return <>
    <pre data-testid="personal">{JSON.stringify({ favorites: personal.favorites, favoriteIds: personal.state.favorites, read: personal.state.read, hidden: personal.state.hidden, loading: personal.loading })}</pre>
    <button onClick={() => personal.toggle('read', 'notice-1')}>원문 열기</button>
    <button onClick={() => personal.toggle('hidden', 'notice-1')}>숨김</button>
    <button onClick={() => {
      const favorite = personal.favorites[0]
      if (favorite) personal.toggle('favorites', favorite.item.id, favorite.item)
    }}>찜 해제</button>
  </>
}

const readState = () => JSON.parse(screen.getByTestId('personal').textContent || '{}')

describe('personal data connections', () => {
  beforeEach(() => {
    localStorage.clear()
    clearDataCache()
    mocks.user = { uid: 'test-user' }
    mocks.deleteDoc.mockReset().mockResolvedValue(undefined)
    mocks.setDocument.mockReset()
    mocks.transactions.mockReset()
    mocks.records = {
      favorites: [{ id: 'notice-1', data: () => ({ item: savedItem, remindersEnabled: true, note: '내 메모', resultDate: '2030-11-01' }) }],
      keywords: [], notifications: [],
    }
    vi.spyOn(personalLogic, 'kstDate').mockReturnValue('2026-10-13')
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('uses the latest public item for favorites and reminders without overwriting personal details', async () => {
    const latest = { ...savedItem, title: '수정된 게임 공모전', recruit_end: '2026-10-30' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema_version: 1, items: [latest] }) }))
    render(<PersonalProvider><Probe /></PersonalProvider>)
    await waitFor(() => expect(readState().loading).toBe(false))
    expect(readState().favorites[0]).toMatchObject({ item: { title: latest.title, recruit_end: latest.recruit_end }, note: '내 메모', resultDate: '2030-11-01', remindersEnabled: true })
    expect(mocks.setDocument).not.toHaveBeenCalled()
  })

  it('preserves the saved copy when an opportunity is absent from public data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema_version: 1, items: [] }) }))
    render(<PersonalProvider><Probe /></PersonalProvider>)
    await waitFor(() => expect(readState().loading).toBe(false))
    expect(readState().favorites[0].item).toEqual(savedItem)
  })

  it('connects a merged notice by source URL and removes the original favorite document', async () => {
    const latest = { ...savedItem, id: 'merged-notice', source_url: 'https://official.example.com/notice', recruit_end: '2026-10-30', sources: [{ source_id: 'test', source_name: '테스트', source_url: savedItem.source_url, kind: 'aggregate', priority: 40 }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema_version: 1, items: [latest] }) }))
    render(<PersonalProvider><Probe /></PersonalProvider>)
    await waitFor(() => expect(readState().loading).toBe(false))
    expect(readState().favorites[0]).toMatchObject({ id: 'notice-1', item: { id: 'merged-notice', recruit_end: '2026-10-30' }, note: '내 메모' })
    expect(readState().favoriteIds).toEqual(['merged-notice'])
    fireEvent.click(screen.getByRole('button', { name: '찜 해제' }))
    expect(mocks.deleteDoc).toHaveBeenCalledWith('users/test-user/favorites/notice-1')
  })

  it('refreshes favorites and removes outdated schedule alerts when public data is reloaded', async () => {
    let latest = { ...savedItem, recruit_end: '2026-10-14' }
    const notificationId = encodeURIComponent('schedule:notice-1:모집 마감:2026-10-14:1')
    mocks.records.notifications = [{ id: notificationId, data: () => ({ type: 'schedule', title: '기존 알림', message: '마감', date: '2026-10-14' }) }]
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({ schema_version: 1, items: [latest] }) })))
    render(<PersonalProvider><Probe /></PersonalProvider>)
    await waitFor(() => expect(readState().loading).toBe(false))
    mocks.deleteDoc.mockClear()
    latest = { ...savedItem, recruit_end: '2026-10-30' }
    act(() => clearDataCache())
    await waitFor(() => expect(readState().favorites[0].item.recruit_end).toBe('2026-10-30'))
    await waitFor(() => expect(mocks.deleteDoc).toHaveBeenCalledWith('users/test-user/notifications/' + notificationId))
  })

  it('does not re-read keyword alerts that are already loaded', async () => {
    mocks.records.favorites = []
    mocks.records.keywords = [{ id: 'k1', data: () => ({ word: '게임', createdAt: '2026-09-01T00:00:00+09:00' }) }]
    mocks.records.notifications = [{ id: encodeURIComponent('keyword:notice-1'), data: () => ({ type: 'keyword', title: '새 맞춤 공고', message: '게임 공모전', opportunityId: 'notice-1', read: true }) }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema_version: 1, items: [savedItem] }) }))
    render(<PersonalProvider><Probe /></PersonalProvider>)
    await waitFor(() => expect(readState().loading).toBe(false))
    await act(async () => {})
    expect(mocks.transactions).not.toHaveBeenCalled()
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })

  it('removes keyword alerts whose notice left the public data', async () => {
    const goneId = encodeURIComponent('keyword:gone-notice')
    mocks.records.notifications = [{ id: goneId, data: () => ({ type: 'keyword', title: '새 맞춤 공고', message: '지난 공고', opportunityId: 'gone-notice', read: true }) }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema_version: 1, items: [savedItem] }) }))
    render(<PersonalProvider><Probe /></PersonalProvider>)
    await waitFor(() => expect(mocks.deleteDoc).toHaveBeenCalledWith('users/test-user/notifications/' + goneId))
  })

  it('keeps keyword alerts when public data fails to load', async () => {
    mocks.records.notifications = [{ id: encodeURIComponent('keyword:notice-1'), data: () => ({ type: 'keyword', title: '새 맞춤 공고', message: '게임 공모전', opportunityId: 'notice-1', read: false }) }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    render(<PersonalProvider><Probe /></PersonalProvider>)
    await waitFor(() => expect(readState().loading).toBe(false))
    await act(async () => {})
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })

  it('keeps working when the browser blocks site data', () => {
    mocks.user = null
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError') } })
    try {
      render(<PersonalProvider><Probe /></PersonalProvider>)
      fireEvent.click(screen.getByRole('button', { name: '숨김' }))
      expect(readState().hidden).toEqual(['notice-1'])
    } finally {
      Object.defineProperty(window, 'localStorage', original)
    }
  })

  it('opening a notice twice keeps it read while hide still toggles', () => {
    mocks.user = null
    render(<PersonalProvider><Probe /></PersonalProvider>)
    fireEvent.click(screen.getByRole('button', { name: '원문 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '원문 열기' }))
    expect(readState().read).toEqual(['notice-1'])
    fireEvent.click(screen.getByRole('button', { name: '숨김' }))
    expect(readState().hidden).toEqual(['notice-1'])
    fireEvent.click(screen.getByRole('button', { name: '숨김' }))
    expect(readState().hidden).toEqual([])
  })
})
