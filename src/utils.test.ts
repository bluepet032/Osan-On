import { describe, expect, it } from 'vitest'
import { formatDate } from './utils'

describe('formatDate', () => {
  // Dates are KST calendar days; a browser elsewhere must not move them to the day before.
  it('shows the KST calendar day in any time zone', () => {
    expect(formatDate('2026-12-31')).toBe('2026. 12. 31.')
    expect(formatDate(null)).toBe('미정')
  })
})
