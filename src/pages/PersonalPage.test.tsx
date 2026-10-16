import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonalPage } from './PersonalPage'

const mocks = vi.hoisted(() => ({
  saveFavoriteDetails: vi.fn(),
  account: { user: { displayName: 'Test', email: 'test@example.com' }, openLogin: vi.fn() },
  personal: {
    favorites: [{
      id: 'opportunity-1',
      item: {
        id: 'opportunity-1', title: '게임 공고', organizer: '기관', source_url: 'https://example.com',
        date_kind: 'exact', recruit_end: '2026-10-30', event_start: '', event_end: '', field_tags: [], audience_tags: [],
      },
      remindersEnabled: true, resultDate: '2026-11-01', note: '처음 메모',
    }],
    keywords: [], notifications: [], personalizedItems: [], loading: false, migrationMessage: '', localFavoriteCount: 0,
    markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn(), toggle: vi.fn(), setRemindersEnabled: vi.fn(),
    saveFavoriteDetails: vi.fn(), addKeyword: vi.fn(), removeKeyword: vi.fn(), importLocalFavorites: vi.fn(),
  },
}))

vi.mock('../account', () => ({ useAccount: () => mocks.account }))
vi.mock('../personal', () => ({ usePersonalState: () => mocks.personal }))

describe('PersonalPage favorite details', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    mocks.personal.favorites = mocks.personal.favorites.map(favorite => ({ ...favorite, resultDate: '2026-11-01', note: '처음 메모' }))
    mocks.personal.saveFavoriteDetails.mockClear()
  })

  it('reflects Firestore updates and does not write a stale untouched field back', async () => {
    const view = render(<PersonalPage />)
    const resultDate = screen.getByLabelText('합격 발표일')
    const note = screen.getByLabelText('메모')
    expect(resultDate).toHaveValue('2026-11-01')
    expect(note).toHaveValue('처음 메모')

    mocks.personal.favorites = mocks.personal.favorites.map(favorite => ({ ...favorite, resultDate: '2026-11-05', note: '다른 기기에서 수정' }))
    view.rerender(<PersonalPage />)
    await waitFor(() => {
      expect(resultDate).toHaveValue('2026-11-05')
      expect(note).toHaveValue('다른 기기에서 수정')
    })

    fireEvent.focus(resultDate)
    mocks.personal.favorites = mocks.personal.favorites.map(favorite => ({ ...favorite, resultDate: '2026-11-08' }))
    view.rerender(<PersonalPage />)
    fireEvent.blur(resultDate)

    expect(mocks.personal.saveFavoriteDetails).not.toHaveBeenCalled()
    await waitFor(() => expect(resultDate).toHaveValue('2026-11-08'))
  })

  it('saves a field the user actually changed', () => {
    render(<PersonalPage />)
    const note = screen.getByLabelText('메모')
    fireEvent.focus(note)
    fireEvent.change(note, { target: { value: '내가 바꾼 메모' } })
    fireEvent.blur(note)
    expect(mocks.personal.saveFavoriteDetails).toHaveBeenCalledWith('opportunity-1', { note: '내가 바꾼 메모' })
  })

  it('exports saved deadlines as a calendar file', async () => {
    // jsdom has no object URLs, so the download is observed through these stand-ins.
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    const createObjectURL = vi.fn((blob: Blob) => (blob ? 'blob:calendar' : ''))
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      render(<PersonalPage />)
      fireEvent.click(screen.getByRole('button', { name: '캘린더로 내보내기(.ics)' }))
      const blob = createObjectURL.mock.calls[0][0]
      expect(blob.type).toBe('text/calendar;charset=utf-8')
      const text = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsText(blob)
      })
      expect(text).toContain('SUMMARY:[마감] 게임 공고')
      expect(click).toHaveBeenCalled()
    } finally {
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
      click.mockRestore()
    }
  })
})
