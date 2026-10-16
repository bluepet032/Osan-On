import { describe, expect, it } from 'vitest'
import { isAdmin, parseAdminUids } from './admin'

describe('admin access', () => {
  it('reads a comma-separated UID list', () => {
    expect(parseAdminUids(' a1, b2 ,,')).toEqual(['a1', 'b2'])
    expect(parseAdminUids(undefined)).toEqual([])
  })

  it('admits only listed, signed-in users', () => {
    expect(isAdmin('a1', ['a1'])).toBe(true)
    expect(isAdmin('zz', ['a1'])).toBe(false)
    expect(isAdmin(undefined, ['a1'])).toBe(false)
    expect(isAdmin('', [''])).toBe(false)
  })
})
