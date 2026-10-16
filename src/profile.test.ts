import { beforeEach, describe, expect, it } from 'vitest'
import { loadProfile, profileFromDocument, profileToDocument, saveProfile } from './profile'

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

describe('profile documents', () => {
  it('writes only set fields, since Firestore rejects undefined', () => {
    const data = profileToDocument({ gender: 'female', age: 28, income: undefined, household: ['JA0404'] }, '2026-10-16T12:00:00.000Z')
    expect(data).toEqual({ gender: 'female', age: 28, household: ['JA0404'], updatedAt: '2026-10-16T12:00:00.000Z' })
  })

  it('reads back only valid values', () => {
    expect(profileFromDocument({ gender: 'female', age: 28, income: 'JA0203', traits: ['JA0328', 'JA9999', 3], household: [], updatedAt: 'x' }))
      .toEqual({ gender: 'female', age: 28, income: 'JA0203', traits: ['JA0328'], household: [] })
    expect(profileFromDocument({ gender: 'other', age: 300, income: 'JA0299', traits: 'JA0328' })).toEqual({})
  })
})
