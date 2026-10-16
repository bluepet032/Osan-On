import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDataCache, loadOpportunities } from './data'

const payload = { schema_version: 1, generated_at: '2026-10-06T12:00:00+09:00', items: [] }

describe('data loading', () => {
  beforeEach(() => clearDataCache())
  afterEach(() => vi.unstubAllGlobals())

  it('reuses one request for repeated loads of the same dataset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([loadOpportunities('active'), loadOpportunities('active')])
    await loadOpportunities('active')
    await loadOpportunities('closed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries after a failed request instead of caching the error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => payload })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadOpportunities('active')).rejects.toThrow('503')
    await expect(loadOpportunities('active')).resolves.toEqual(payload)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
