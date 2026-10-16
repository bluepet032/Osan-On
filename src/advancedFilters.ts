import type { Opportunity } from './types'

// Facts behind these filters are often missing (see pipeline/facets.py). Each filter
// therefore answers "match", "mismatch" or "unknown", and unknown items are hidden unless
// the viewer asks to include them, so the page can say how many were left out and why.

export interface AdvancedFilters {
  region: string
  mode: string
  fee: string
  audience: string
  prize: string
  includeUnknown: boolean
}

export const EMPTY_ADVANCED: AdvancedFilters = { region: '', mode: '', fee: '', audience: '', prize: '', includeUnknown: false }

/** URL parameter for each filter; `unknown=1` includes items without the information. */
export const ADVANCED_PARAMS = { region: 'region', mode: 'mode', fee: 'fee', audience: 'aud', prize: 'prize' } as const
export type AdvancedKey = keyof typeof ADVANCED_PARAMS
export const ADVANCED_LABELS: Record<AdvancedKey, string> = { region: '지역', mode: '진행 방식', fee: '참가비', audience: '참가 대상', prize: '상금' }

export const NATIONWIDE = '전국'
export const REGION_OPTIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']
export const MODE_OPTIONS: Record<string, string> = { online: '온라인', offline: '오프라인' }
export const FEE_OPTIONS: Record<string, string> = { free: '무료', paid: '유료' }
export const AUDIENCE_OPTIONS = ['대학생', '청소년', '청년', '일반인', '개발자', '창업자·기업']
export const OPEN_TO_ALL = '누구나'
export const PRIZE_OPTIONS: Record<string, string> = { any: '상금 있음', '100': '100만원 이상', '500': '500만원 이상', '1000': '1,000만원 이상' }

export type Verdict = 'match' | 'mismatch' | 'unknown'

function regionVerdict(item: Opportunity, region: string): Verdict {
  const regions = item.regions ?? []
  if (!regions.length) return 'unknown'
  if (region === NATIONWIDE) return regions.includes(NATIONWIDE) ? 'match' : 'mismatch'
  // A nationwide notice is open to every region.
  return regions.includes(region) || regions.includes(NATIONWIDE) ? 'match' : 'mismatch'
}

function modeVerdict(item: Opportunity, mode: string): Verdict {
  if (item.mode === 'hybrid') return 'match'
  if (item.mode === 'online' || item.mode === 'offline') return item.mode === mode ? 'match' : 'mismatch'
  return 'unknown'
}

function feeVerdict(item: Opportunity, fee: string): Verdict {
  if (item.fee === 'free' || item.fee === 'paid') return item.fee === fee ? 'match' : 'mismatch'
  return 'unknown'
}

function audienceVerdict(item: Opportunity, audience: string): Verdict {
  const tags = item.audience_tags
  if (tags.includes(audience) || tags.includes(OPEN_TO_ALL)) return 'match'
  return tags.some(tag => AUDIENCE_OPTIONS.includes(tag)) ? 'mismatch' : 'unknown'
}

function prizeVerdict(item: Opportunity, prize: string): Verdict {
  const amount = item.prize_manwon
  if (amount === undefined || amount === null) return 'unknown'
  if (prize === 'any') return 'match'
  // 0 means a prize is mentioned without an amount, so a minimum cannot be checked.
  if (amount === 0) return 'unknown'
  return amount >= Number(prize) ? 'match' : 'mismatch'
}

/** Whether the item carries the fact behind a filter at all, whatever value is chosen. */
export function hasAdvancedInfo(item: Opportunity, key: AdvancedKey): boolean {
  switch (key) {
    case 'region': return Boolean(item.regions?.length)
    case 'mode': return item.mode === 'online' || item.mode === 'offline' || item.mode === 'hybrid'
    case 'fee': return item.fee === 'free' || item.fee === 'paid'
    case 'audience': return item.audience_tags.some(tag => tag === OPEN_TO_ALL || AUDIENCE_OPTIONS.includes(tag))
    case 'prize': return item.prize_manwon !== undefined && item.prize_manwon !== null
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

export const coverageLabel = (share: number) => `정보 있는 공고 ${coveragePercent(share)}`

const CHECKS: Record<AdvancedKey, (item: Opportunity, value: string) => Verdict> = {
  region: regionVerdict, mode: modeVerdict, fee: feeVerdict, audience: audienceVerdict, prize: prizeVerdict,
}

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
  const read = (key: AdvancedKey, allowed: string[]) => {
    const value = params.get(ADVANCED_PARAMS[key]) ?? ''
    return allowed.includes(value) ? value : ''
  }
  return {
    region: read('region', [NATIONWIDE, ...REGION_OPTIONS]),
    mode: read('mode', Object.keys(MODE_OPTIONS)),
    fee: read('fee', Object.keys(FEE_OPTIONS)),
    audience: read('audience', AUDIENCE_OPTIONS),
    prize: read('prize', Object.keys(PRIZE_OPTIONS)),
    includeUnknown: params.get('unknown') === '1',
  }
}

export function prizeLabel(amount: number | null | undefined): string {
  if (amount === undefined || amount === null) return '정보 없음'
  if (amount === 0) return '상금·상품 있음(금액 미상)'
  return `${amount.toLocaleString('ko-KR')}만원`
}
