import { HOUSEHOLD_OPTIONS, INCOME_OPTIONS, TRAIT_OPTIONS, type IncomeCode, type Profile } from './eligibility'
import { readStorage, writeStorage } from './utils'

const KEY = 'osanon.profile'

export function loadProfile(): Profile {
  try {
    const value: unknown = JSON.parse(readStorage(KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? profileFromDocument(value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const saveProfile = (profile: Profile) => writeStorage(KEY, JSON.stringify(profile))

/** Account copy (users/{uid}/profile/main); Firestore rejects undefined, so unset fields are left out. */
export function profileToDocument(profile: Profile, updatedAt = new Date().toISOString()): Record<string, unknown> {
  const fields = Object.entries(profile).filter(([, value]) => value !== undefined)
  return { ...Object.fromEntries(fields), updatedAt }
}

const codes = (value: unknown, options: Record<string, string>) =>
  Array.isArray(value) ? value.filter((code): code is string => typeof code === 'string' && code in options) : undefined

/** Only known values survive, whether they come from the account or from this browser. */
export function profileFromDocument(data: Record<string, unknown>): Profile {
  const profile: Profile = {}
  if (data.gender === 'male' || data.gender === 'female') profile.gender = data.gender
  if (Number.isInteger(data.age) && (data.age as number) >= 0 && (data.age as number) <= 120) profile.age = data.age as number
  if (typeof data.income === 'string' && data.income in INCOME_OPTIONS) profile.income = data.income as IncomeCode
  const traits = codes(data.traits, TRAIT_OPTIONS)
  if (traits) profile.traits = traits
  const household = codes(data.household, HOUSEHOLD_OPTIONS)
  if (household) profile.household = household
  return profile
}
