import { useCallback, useEffect, useState } from 'react'
import { AUTO_REFRESH_LABEL, COLLECT_WORKFLOW_URL, STALE_AFTER_MS } from '../constants'
import { ADVANCED_LABELS, ADVANCED_PARAMS, coveragePercent, type AdvancedKey } from '../advancedFilters'
import { clearDataCache, loadOpportunities, loadStatuses } from '../data'
import type { CrawlStatus, Opportunity } from '../types'

export function StatusPage() {
  const [statuses, setStatuses] = useState<CrawlStatus[]>([])
  const [review, setReview] = useState<Opportunity[]>([])
  const [generated, setGenerated] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(() => {
    setLoading(true); setError('')
    Promise.all([loadStatuses(), loadOpportunities('review')])
      .then(([sourcePayload, reviewPayload]) => { setStatuses(sourcePayload.items); setReview(reviewPayload.items); setGenerated(sourcePayload.generated_at) })
      .catch(reason => setError(reason instanceof Error ? reason.message : '상태 데이터를 불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])
  const reload = () => { clearDataCache(); load() }
  const coverageText = (item: CrawlStatus) => {
    const coverage = item.facet_coverage
    if (!coverage) return ''
    return (Object.keys(ADVANCED_PARAMS) as AdvancedKey[])
      .filter(key => typeof coverage[key] === 'number')
      .map(key => `${ADVANCED_LABELS[key]} ${coveragePercent(coverage[key] as number)}`)
      .join(' · ')
  }
  const stale = (item: CrawlStatus) => !item.last_success_at || Date.now() - Date.parse(item.last_success_at) > STALE_AFTER_MS || item.consecutive_failures >= 3
  return (
    <main id="main-content" className="container status-page">
      <div className="page-heading"><div><p className="eyebrow">PIPELINE HEALTH</p><h1>수집 상태</h1><p>공개 수집기의 최근 실행과 수동 검토 대상을 확인합니다.</p></div></div>
      {error && <div className="message error" role="alert">{error}</div>}
      <p className="updated-at">마지막 상태 생성: {generated ? new Date(generated).toLocaleString('ko-KR') : '없음'} · 자동 갱신 {AUTO_REFRESH_LABEL}</p>
      <section className="manual-refresh" aria-labelledby="manual-refresh-title">
        <div>
          <h2 id="manual-refresh-title">수동 갱신</h2>
          <p>저장소 관리자는 GitHub Actions에서 <strong>Run workflow</strong>를 눌러 바로 수집할 수 있습니다. 수집과 배포에는 보통 5~10분이 걸리며, 끝난 뒤 <strong>최신 데이터 다시 불러오기</strong>를 누르면 반영됩니다.</p>
        </div>
        <div className="manual-refresh-actions">
          <a className="button-link" href={COLLECT_WORKFLOW_URL} target="_blank" rel="noopener noreferrer">GitHub에서 지금 수집 실행</a>
          <button type="button" className="text-button" onClick={reload} disabled={loading}>{loading ? '불러오는 중…' : '최신 데이터 다시 불러오기'}</button>
        </div>
      </section>
      <section><h2>출처별 상태</h2><div className="status-grid">{statuses.map(item => <article key={item.source_id} className={`source-card ${item.status} ${stale(item) ? 'stale' : ''}`}><div><h3>{item.source_name}</h3><span className={`status status-${item.status === 'success' && !stale(item) ? 'open' : 'urgent'}`}>{stale(item) ? '주의' : item.status === 'success' ? '정상' : '실패'}</span></div><dl><div><dt>수집</dt><dd>{item.collected_count}건</dd></div><div><dt>공개</dt><dd>{item.published_count}건</dd></div><div><dt>검토</dt><dd>{item.review_count}건</dd></div><div><dt>연속 실패</dt><dd>{item.consecutive_failures}회</dd></div></dl>{coverageText(item) && <p className="source-coverage" title="상세 필터에 쓰이는 정보가 있는 공고 비율">필터 정보: {coverageText(item)}</p>}{item.error && <p className="source-error">{item.error}</p>}</article>)}</div></section>
      <details className="review-section">
        <summary className="section-heading"><div><h2>수동 검토 큐 (운영자용)</h2><p>관련성 점수 50~69점 후보입니다. 승인·제외는 <code>manual/overrides.yml</code>과 <code>manual/exclusions.yml</code>에서 처리합니다. 눌러서 펼치세요.</p></div><strong>{review.length}건</strong></summary>
        <div className="review-list">{review.map(item => <article key={item.id}><div><a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.title}</a><span>{item.source_name} · {item.organizer}</span></div><strong>{item.relevance.score}점</strong><ul>{item.relevance.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></article>)}</div>
        {!review.length && <div className="message">검토 대기 공고가 없습니다.</div>}
      </details>
    </main>
  )
}
