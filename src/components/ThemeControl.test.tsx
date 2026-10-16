import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ThemeControl } from './ThemeControl'

const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
afterEach(() => { cleanup(); Object.defineProperty(window, 'localStorage', original); localStorage.clear() })

it('keeps the theme saved under the QuestBoard-era key', () => {
  localStorage.setItem('questboard.theme', 'dark')
  render(<ThemeControl />)
  expect(screen.getByLabelText('화면 테마')).toHaveValue('dark')
  expect(localStorage.getItem('osanon.theme')).toBe('dark')
  // QuestBoard on the same origin still reads its own key.
  expect(localStorage.getItem('questboard.theme')).toBe('dark')
})

it('renders when the browser blocks site data', () => {
  // Browsers that block site data throw on any access to window.localStorage.
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError') } })
  render(<ThemeControl />)
  expect(screen.getByLabelText('화면 테마')).toHaveValue('light')
})
