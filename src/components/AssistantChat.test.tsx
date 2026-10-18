import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Opportunity } from '../types'
import { AssistantChat, AssistantHost, type AssistantHandle } from './AssistantChat'

const item = {
  id: 'osan-rent', title: '오산시 청년 월세 지원', organizer: '오산시 주택과', summary: '', source_name: '정부24', source_url: 'https://www.gov.kr/1',
  field_tags: [], audience_tags: [], jurisdiction: 'osan', status: 'ongoing', date_kind: 'ongoing',
} as unknown as Opportunity
const chat = (props: Partial<Parameters<typeof AssistantChat>[0]> = {}) =>
  render(<AssistantChat open onClose={() => {}} items={[item]} profile={{}} verdictOf={() => 'check'} onShowAll={() => {}} thinkingMs={0} {...props} />)

describe('AssistantChat', () => {
  afterEach(() => cleanup())

  it('opens with a greeting and question suggestions', () => {
    chat()
    expect(screen.getByRole('dialog', { name: '오산온 AI' })).toBeInTheDocument()
    expect(screen.getByText('무엇을 도와드릴까요?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '청년 월세 지원' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
    expect(screen.getByLabelText('질문 입력')).toHaveFocus()
  })

  it('answers a typed question with matching benefits', async () => {
    const onShowAll = vi.fn()
    chat({ onShowAll })
    fireEvent.change(screen.getByLabelText('질문 입력'), { target: { value: '청년 월세 알려줘' } })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(screen.getByText('청년 월세 알려줘')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /오산시 청년 월세 지원/ })).toHaveAttribute('href', '#/notice/osan-rent')
    fireEvent.click(screen.getByRole('button', { name: '목록에서 더 찾아보기' }))
    expect(onShowAll).toHaveBeenCalledWith('청년 월세')
  })

  it('sends a suggestion when it is tapped', async () => {
    chat()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '중위소득이 뭐예요?' })))
    expect(await screen.findByText(/가구 소득을 한 줄로 세웠을 때/)).toBeInTheDocument()
  })

  it('starts over and closes with Escape', async () => {
    const onClose = vi.fn()
    chat({ onClose })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '중위소득이 뭐예요?' })))
    await screen.findByText(/가구 소득을/)
    fireEvent.click(screen.getByRole('button', { name: '새 대화' }))
    expect(screen.queryByText(/가구 소득을/)).toBeNull()
    expect(screen.getByText('무엇을 도와드릴까요?')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('opens and closes through its handle, keeping the open state to itself', () => {
    const handle = createRef<AssistantHandle>()
    render(<AssistantHost ref={handle} items={[item]} profile={{}} verdictOf={() => 'check'} onShowAll={() => {}} thinkingMs={0} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => handle.current!.open())
    expect(screen.getByRole('dialog', { name: '오산온 AI' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => handle.current!.open())
    act(() => handle.current!.close())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing while closed', () => {
    chat({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
