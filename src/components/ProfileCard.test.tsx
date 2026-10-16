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
