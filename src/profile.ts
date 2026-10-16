import type { Profile } from './eligibility'
import { readStorage, writeStorage } from './utils'

const KEY = 'osanon.profile'

export function loadProfile(): Profile {
  try {
    const value: unknown = JSON.parse(readStorage(KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Profile : {}
  } catch {
    return {}
  }
}

export const saveProfile = (profile: Profile) => writeStorage(KEY, JSON.stringify(profile))
