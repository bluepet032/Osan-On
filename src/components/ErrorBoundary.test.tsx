import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(() => { vi.restoreAllMocks() })

function Broken(): never {
  throw new Error('boom')
}

it('shows a way to recover instead of a blank page when a screen crashes', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {}) // React logs the caught error
  render(<ErrorBoundary><Broken /></ErrorBoundary>)
  expect(screen.getByRole('alert')).toHaveTextContent('문제가 생겼습니다')
  expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
})

it('renders the page normally when nothing fails', () => {
  render(<ErrorBoundary><p>정상 화면</p></ErrorBoundary>)
  expect(screen.getByText('정상 화면')).toBeInTheDocument()
})
