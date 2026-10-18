import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileCard } from './ProfileCard'

describe('ProfileCard', () => {
  afterEach(() => cleanup())

  it('asks gender and age first and reports them', () => {
    const onChange = vi.fn()
    render(<ProfileCard profile={{}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: '여성' }))
    fireEvent.change(screen.getByLabelText('만 나이'), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: '맞춤 혜택 보기' }))
    expect(onChange).toHaveBeenCalledWith({ gender: 'female', age: 28 })
  })

  it('never promises an account copy that failed to save, and offers a retry', () => {
    const onRetry = vi.fn()
    const basics = { gender: 'female', age: 28 } as const
    const { rerender } = render(<ProfileCard profile={basics} onChange={vi.fn()} saveState="saved" />)
    expect(screen.getByText(/다른 기기에서도 이어집니다/)).toBeInTheDocument()
    rerender(<ProfileCard profile={basics} onChange={vi.fn()} saveState="syncing" />)
    expect(screen.getByText(/계정과 동기화하는 중/)).toBeInTheDocument()
    rerender(<ProfileCard profile={basics} onChange={vi.fn()} saveState="failed" error="맞춤 조건을 계정에 저장하지 못했습니다." onRetry={onRetry} />)
    expect(screen.queryByText(/다른 기기에서도 이어집니다/)).toBeNull()
    expect(screen.getByText(/이 브라우저에는 저장되어 있습니다/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('offers the AI assistant beside the likely-benefit count', () => {
    const onAsk = vi.fn()
    render(<ProfileCard profile={{ gender: 'male', age: 32 }} onChange={vi.fn()} matchCount={30} onAsk={onAsk} />)
    fireEvent.click(screen.getByRole('button', { name: 'AI에게 질문하기' }))
    expect(onAsk).toHaveBeenCalled()
  })

  it('does not submit without both answers', () => {
    const onChange = vi.fn()
    render(<ProfileCard profile={{}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: '남성' }))
    expect(screen.getByRole('button', { name: '맞춤 혜택 보기' })).toBeDisabled()
  })

  it('summarizes a saved profile and adds details for more accuracy', () => {
    const onChange = vi.fn()
    render(<ProfileCard profile={{ gender: 'female', age: 28 }} onChange={onChange} />)
    expect(screen.getByText('여성 · 만 28세')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '더 정확하게' }))
    fireEvent.change(screen.getByLabelText('소득 수준'), { target: { value: 'JA0202' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '1인 가구' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(onChange).toHaveBeenLastCalledWith({ gender: 'female', age: 28, income: 'JA0202', traits: [], household: ['JA0404'] })
  })
})
