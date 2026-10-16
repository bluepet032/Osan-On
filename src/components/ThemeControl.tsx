import { useEffect, useState } from 'react'
import { copyStorage, readStorage, writeStorage } from '../utils'

type Theme = 'light' | 'dark' | 'system'
const KEY = 'osanon.theme'

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(() => {
    copyStorage('questboard.theme', KEY)
    return (readStorage(KEY) as Theme) || 'light'
  })
  useEffect(() => {
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    writeStorage(KEY, theme)
  }, [theme])
  return (
    <label className="theme-control">
      <span className="sr-only">화면 테마</span>
      <select value={theme} onChange={event => setTheme(event.target.value as Theme)} aria-label="화면 테마">
        <option value="light">밝게</option><option value="dark">어둡게</option><option value="system">시스템</option>
      </select>
    </label>
  )
}

