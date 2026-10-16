import { describe, expect, it } from 'vitest'
import { currentHashParams } from './urlState'

describe('currentHashParams', () => {
  it('reads the query part of a HashRouter URL', () => {
    expect(currentHashParams('#/?domain=all&q=%EA%B2%8C%EC%9E%84').get('q')).toBe('게임')
    expect(currentHashParams('#/weekly?domain=business').get('domain')).toBe('business')
    expect(currentHashParams('#/').toString()).toBe('')
    expect(currentHashParams('').toString()).toBe('')
  })

  it('reads the live location by default', () => {
    window.location.hash = '#/?region=%EC%84%9C%EC%9A%B8'
    expect(currentHashParams().get('region')).toBe('서울')
  })
})
