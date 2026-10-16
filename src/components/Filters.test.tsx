import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Filters } from './Filters'


describe('Filters search input', () => {
  it('updates the URL filter only after Korean IME composition ends', () => {
    const onChange = vi.fn()
    render(<Filters
      items={[]}
      domain="it"
      type="all"
      quick=""
      search=""
      field=""
      status=""
      onChange={onChange}
    />)

    const input = screen.getByRole('textbox')
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '게' } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.compositionEnd(input, { data: '게임', target: { value: '게임' } })
    expect(onChange).toHaveBeenLastCalledWith('q', '게임')
  })
})
