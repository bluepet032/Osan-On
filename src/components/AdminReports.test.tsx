import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminReports } from './AdminReports'

const mocks = vi.hoisted(() => ({
  docs: [] as { id: string; data: () => unknown }[],
  deleteDoc: vi.fn(async () => undefined),
  getDocs: vi.fn(),
}))
const firestore = {
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  query: (path: string) => path,
  orderBy: () => null,
  limit: () => null,
  getDocs: mocks.getDocs,
  deleteDoc: mocks.deleteDoc,
}
// One stable object, like the provider's, so effects that depend on it do not re-run every render.
const services = { db: {}, firestore }
vi.mock('../account', () => ({ useAccount: () => ({ user: { uid: 'admin' }, firebase: services }) }))

const report = { opportunityId: 'gov24-1', title: '경기청년 사다리', sourceUrl: 'https://www.gov.kr/1', reason: 'period', note: '11월 마감', uid: 'u1', createdAt: '2026-10-17T10:00:00Z' }

describe('AdminReports', () => {
  afterEach(() => cleanup())

  it('lists reports and removes one once handled', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [{ id: 'r1', data: () => report }] })
    await act(async () => { render(<AdminReports />) })
    expect(screen.getByRole('link', { name: '경기청년 사다리' })).toHaveAttribute('href', '#/notice/gov24-1')
    expect(screen.getByText(/신청 기간이 달라요/)).toBeInTheDocument()
    expect(screen.getByText('11월 마감')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '처리 완료' })))
    expect(mocks.deleteDoc).toHaveBeenCalledWith('reports/r1')
    expect(screen.queryByText('11월 마감')).toBeNull()
  })
})
