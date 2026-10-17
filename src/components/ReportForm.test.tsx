import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity } from '../types'
import { ReportForm } from './ReportForm'

const mocks = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  openLogin: vi.fn(),
  addDoc: vi.fn(async () => ({ id: 'r1' })),
}))
const firestore = { collection: (_db: unknown, ...path: string[]) => path.join('/'), addDoc: mocks.addDoc, serverTimestamp: () => 'SERVER_TIME' }
// One stable object, like the provider's, so effects that depend on it do not re-run every render.
const services = { db: {}, firestore }
vi.mock('../account', () => ({ useAccount: () => ({ user: mocks.user, openLogin: mocks.openLogin, firebase: services }) }))

const item = { id: 'gov24-1', title: '경기청년 사다리', source_url: 'https://www.gov.kr/1' } as Opportunity

describe('ReportForm', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    mocks.user = null
    mocks.openLogin.mockReset()
    mocks.addDoc.mockReset().mockResolvedValue({ id: 'r1' })
  })

  it('asks a signed-out visitor to log in first', () => {
    render(<ReportForm item={item} />)
    fireEvent.click(screen.getByRole('button', { name: '정보 오류 신고' }))
    expect(mocks.openLogin).toHaveBeenCalled()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('sends the chosen reason and note to reports', async () => {
    mocks.user = { uid: 'u1' }
    render(<ReportForm item={item} />)
    fireEvent.click(screen.getByRole('button', { name: '정보 오류 신고' }))
    const send = screen.getByRole('button', { name: '신고 보내기' })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: '신청 기간이 달라요' }))
    fireEvent.change(screen.getByLabelText('자세한 내용 (선택)'), { target: { value: '11월 마감' } })
    await act(async () => fireEvent.click(send))
    expect(mocks.addDoc).toHaveBeenCalledWith('reports', expect.objectContaining({ opportunityId: 'gov24-1', reason: 'period', note: '11월 마감', uid: 'u1', createdAt: 'SERVER_TIME' }))
    expect(screen.getByRole('status')).toHaveTextContent('신고가 접수되었습니다')
  })

  it('keeps the answers and says so when sending fails', async () => {
    mocks.user = { uid: 'u1' }
    mocks.addDoc.mockRejectedValueOnce(new Error('permission-denied'))
    render(<ReportForm item={item} />)
    fireEvent.click(screen.getByRole('button', { name: '정보 오류 신고' }))
    fireEvent.click(screen.getByRole('radio', { name: '링크가 안 열려요' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '신고 보내기' })))
    expect(screen.getByRole('alert')).toHaveTextContent('보내지 못했습니다')
    expect(screen.getByRole('radio', { name: '링크가 안 열려요' })).toBeChecked()
  })
})
