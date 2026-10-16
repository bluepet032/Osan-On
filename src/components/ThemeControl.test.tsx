import { render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ThemeControl } from './ThemeControl'

const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
afterEach(() => { Object.defineProperty(window, 'localStorage', original) })

it('renders when the browser blocks site data', () => {
  // Browsers that block site data throw on any access to window.localStorage.
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError') } })
  render(<ThemeControl />)
  expect(screen.getByLabelText('화면 테마')).toHaveValue('light')
})
