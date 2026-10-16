import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { OpportunityRow } from '../components/OpportunityRow'
import { loadOpportunities } from '../data'
import { usePersonalState } from '../personal'
import type { Opportunity } from '../types'

// Every public list is searched, since a notice moves from active to closed over time.
const DATASETS = ['active', 'undated', 'closed'] as const

export function NoticePage() {
  const { id = '' } = useParams()
  // undefined while loading, null when no public list has the notice.
  const [item, setItem] = useState<Opportunity | null | undefined>(undefined)
  const [error, setError] = useState('')
  const { state: personal, toggle } = usePersonalState()

  useEffect(() => {
    let active = true
    setItem(undefined); setError('')
    Promise.all(DATASETS.map(name => loadOpportunities(name)))
      .then(payloads => { if (active) setItem(payloads.flatMap(payload => payload.items).find(value => value.id === id) ?? null) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했습니다') })
    return () => { active = false }
  }, [id])

  return (
    <main id="main-content" className="container">
      <p><a href="#/">← 전체 공고</a></p>
      {error && <div className="message error" role="alert">{error}</div>}
      {!error && item === undefined && <div className="message" role="status">공고를 불러오는 중입니다…</div>}
      {item === null && <div className="message"><strong>공고를 찾을 수 없습니다</strong><span>마감 후 3개월이 지나 목록에서 빠졌거나 주소가 잘못되었을 수 있습니다.</span></div>}
      {item && <>
        <div className="page-heading"><div><p className="eyebrow">NOTICE</p><h1>{item.title}</h1></div></div>
        <section className="opportunity-list" aria-label="공고"><OpportunityRow item={item} personal={personal} onToggle={toggle} defaultExpanded /></section>
      </>}
    </main>
  )
}
