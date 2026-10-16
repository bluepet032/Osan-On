import { beforeEach, describe, expect, it } from 'vitest'
import { loadProfile, saveProfile } from './profile'

describe('profile storage', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a saved profile', () => {
    saveProfile({ gender: 'female', age: 28, traits: [] })
    expect(loadProfile()).toEqual({ gender: 'female', age: 28, traits: [] })
  })

  it('starts empty when nothing or broken JSON is stored', () => {
    expect(loadProfile()).toEqual({})
    localStorage.setItem('osanon.profile', '{bad')
    expect(loadProfile()).toEqual({})
    localStorage.setItem('osanon.profile', '[1]')
    expect(loadProfile()).toEqual({})
  })
})
