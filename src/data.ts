import { withLiveTiming } from './timing'
import type { CrawlStatus, DataPayload, Opportunity } from './types'

// Data is regenerated once a day, so a short in-memory cache avoids refetching
// the same JSON on every tab change and from both the list page and personal features.
const CACHE_TTL_MS = 10 * 60 * 1000

const dataUrl = (name: string) => `${import.meta.env.BASE_URL}data/${name}.json`
const cache = new Map<string, { expires: number; promise: Promise<DataPayload<unknown>> }>()

async function fetchPayload<T>(name: string): Promise<DataPayload<T>> {
  const response = await fetch(dataUrl(name))
  if (!response.ok) throw new Error(`${name} 데이터를 불러오지 못했습니다 (${response.status})`)
  const payload = await response.json() as DataPayload<T>
  if (payload.schema_version !== 1 || !Array.isArray(payload.items)) throw new Error(`${name} 데이터 형식이 올바르지 않습니다`)
  return payload
}

function loadPayload<T>(name: string, now = Date.now()): Promise<DataPayload<T>> {
  const cached = cache.get(name)
  if (cached && cached.expires > now) return cached.promise as Promise<DataPayload<T>>
  const promise = fetchPayload<T>(name)
  cache.set(name, { expires: now + CACHE_TTL_MS, promise })
  // Never keep a failed request, so the next visit retries instead of replaying the error.
  promise.catch(() => { if (cache.get(name)?.promise === promise) cache.delete(name) })
  return promise
}

export const clearDataCache = () => {
  cache.clear()
  window.dispatchEvent(new Event('questboard-data-refresh'))
}
// Status and D-day are recomputed for today on every load; the cached payload stays untouched.
export const loadOpportunities = async (name: 'active' | 'undated' | 'closed' | 'review'): Promise<DataPayload<Opportunity>> => {
  const payload = await loadPayload<Opportunity>(name)
  return { ...payload, items: payload.items.map(item => withLiveTiming(item)) }
}
export const loadStatuses = () => loadPayload<CrawlStatus>('sources')
