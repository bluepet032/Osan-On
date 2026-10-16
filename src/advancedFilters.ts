import type { Opportunity } from './types'

// Facts behind these filters are sometimes missing (see pipeline/facets.py). Each filter
// therefore answers "match", "mismatch" or "unknown", and unknown items are hidden unless
// the viewer asks to include them, so the page can say how many were left out and why.

export interface AdvancedFilters {
  apply: string
  includeUnknown: boolean
}

export const EMPTY_ADVANCED: AdvancedFilters = { apply: '', includeUnknown: false }

/** URL parameter for each filter; `unknown=1` includes items without the information. */
export const ADVANCED_PARAMS = { apply: 'apply' } as const
export type AdvancedKey = keyof typeof ADVANCED_PARAMS
export const ADVANCED_LABELS: Record<AdvancedKey, string> = { apply: '신청 방법' }

export const APPLY_OPTIONS: Record<string, string> = { online: '온라인 신청 가능', visit: '방문 신청', none: '신청 불필요' }

export type Verdict = 'match' | 'mismatch' | 'unknown'

function applyVerdict(item: Opportunity, method: string): Verdict {
  const methods = item.apply_methods ?? []
  if (!methods.length) return 'unknown'
  return methods.includes(method) ? 'match' : 'mismatch'
}

/** Whether the item carries the fact behind a filter at all, whatever value is chosen. */
export function hasAdvancedInfo(item: Opportunity, key: AdvancedKey): boolean {
  switch (key) {
    case 'apply': return Boolean(item.apply_methods?.length)
  }
}

/** Below this share of items with the information, a filter is folded away as unreliable. */
export const SPARSE_COVERAGE = 0.2

/** Share (0–1) of ``items`` carrying each filter's fact; null when there are no items. */
export function advancedCoverage(items: Opportunity[]): Record<AdvancedKey, number> | null {
  if (!items.length) return null
  const keys = Object.keys(ADVANCED_PARAMS) as AdvancedKey[]
  return Object.fromEntries(keys.map(key => [key, items.filter(item => hasAdvancedInfo(item, key)).length / items.length])) as Record<AdvancedKey, number>
}

export function coveragePercent(share: number): string {
  // A handful of items should not read as 0% (or a near-complete set as 100%).
  if (share > 0 && share < 0.01) return '1% 미만'
  return `${share < 1 ? Math.min(99, Math.round(share * 100)) : 100}%`
}

export const coverageLabel = (share: number) => `정보 있는 혜택 ${coveragePercent(share)}`

const CHECKS: Record<AdvancedKey, (item: Opportunity, value: string) => Verdict> = { apply: applyVerdict }

export const activeAdvancedCount = (filters: AdvancedFilters) =>
  (Object.keys(ADVANCED_PARAMS) as AdvancedKey[]).filter(key => filters[key]).length

/** Combined verdict: any mismatch wins, then any unknown, otherwise a match. */
export function advancedVerdict(item: Opportunity, filters: AdvancedFilters): Verdict {
  let verdict: Verdict = 'match'
  for (const key of Object.keys(ADVANCED_PARAMS) as AdvancedKey[]) {
    const value = filters[key]
    if (!value) continue
    const result = CHECKS[key](item, value)
    if (result === 'mismatch') return 'mismatch'
    if (result === 'unknown') verdict = 'unknown'
  }
  return verdict
}

export function matchesAdvanced(item: Opportunity, filters: AdvancedFilters): boolean {
  const verdict = advancedVerdict(item, filters)
  return verdict === 'match' || (verdict === 'unknown' && filters.includeUnknown)
}

export function readAdvanced(params: URLSearchParams): AdvancedFilters {
  const apply = params.get(ADVANCED_PARAMS.apply) ?? ''
  return { apply: apply in APPLY_OPTIONS ? apply : '', includeUnknown: params.get('unknown') === '1' }
}
