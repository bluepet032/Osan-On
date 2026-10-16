import { useState } from 'react'
import { STATUS_LABELS, TYPE_LABELS } from '../constants'
import type { Opportunity, PersonalState } from '../types'
import { FEE_OPTIONS, MODE_OPTIONS, prizeLabel } from '../advancedFilters'
import { kindOf, SOURCE_KINDS, sourceTrust } from '../sourceTrust'
import { dDayLabel, formatDate, isNew, isUpdated } from '../utils'

interface Props {
  item: Opportunity
  personal: PersonalState
  onToggle: (bucket: 'favorites' | 'read' | 'hidden', id: string, item?: Opportunity) => void
  defaultExpanded?: boolean
}

export function OpportunityRow({ item, personal, onToggle, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const favorite = personal.favorites.includes(item.id)
  const read = personal.read.includes(item.id)
  const trust = sourceTrust(item)
  return (
    <article className={`opportunity type-${item.primary_type} ${read ? 'is-read' : ''}`}>
      <div className="date-cell">
        <strong>{dDayLabel(item)}</strong>
        <span>{formatDate(item.recruit_start)}</span>
        <span>~ {formatDate(item.recruit_end)}</span>
      </div>
      <div className="opportunity-main">
        <div className="title-line">
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" onClick={() => onToggle('read', item.id)}>{item.title}</a>
          {isNew(item) && <span className="badge badge-new">NEW</span>}
          {isUpdated(item) && <span className="badge badge-updated">UPDATED</span>}
          <span className={`badge trust trust-${trust.kind}`} title={trust.description}>{trust.label}{trust.sourceCount > 1 && ` · 출처 ${trust.sourceCount}곳`}</span>
        </div>
        <p>{item.summary}</p>
        <div className="mobile-meta">{item.organizer} · {STATUS_LABELS[item.status]}</div>
        <div className="tags" aria-label="공고 분류">
          <span className={`badge type-badge type-${item.primary_type}`}>{TYPE_LABELS[item.primary_type]}</span>
          {[...item.field_tags, ...item.audience_tags].slice(0, 5).map(tag => <span className="badge tag" key={tag}>{tag}</span>)}
        </div>
        {expanded && (
          <div className="details">
            <dl>
              <div><dt>참가 대상</dt><dd>{item.eligibility || '원문 확인 필요'}</dd></div>
              <div><dt>혜택·지원</dt><dd>{item.benefits || '원문 확인 필요'}</dd></div>
              <div><dt>지역·장소</dt><dd>{item.location || item.regions?.join(', ') || '원문 확인 필요'}</dd></div>
              <div><dt>진행 방식</dt><dd>{item.mode === 'hybrid' ? '온·오프라인 병행' : MODE_OPTIONS[item.mode ?? ''] ?? '원문 확인 필요'}</dd></div>
              <div><dt>참가비</dt><dd>{FEE_OPTIONS[item.fee ?? ''] ?? '원문 확인 필요'}</dd></div>
              <div><dt>상금</dt><dd>{item.prize_manwon === null || item.prize_manwon === undefined ? '원문 확인 필요' : prizeLabel(item.prize_manwon)}</dd></div>
              <div><dt>출처</dt><dd>{item.sources.map(source => `${source.source_name}(${SOURCE_KINDS[kindOf(source)].label})`).join(', ')}</dd></div>
            </dl>
            {trust.kind === 'aggregate' && <p className="trust-note">{trust.description}</p>}
            <div className="detail-links">
              <a className="button-link" href={item.source_url} target="_blank" rel="noopener noreferrer">원문 보기</a>
              {item.application_url && <a href={item.application_url} target="_blank" rel="noopener noreferrer">신청하기</a>}
              {item.document_url && <a href={item.document_url} target="_blank" rel="noopener noreferrer">첨부파일</a>}
              <a href={`#/notice/${item.id}`}>공유용 링크</a>
            </div>
          </div>
        )}
      </div>
      <div className="type-cell"><span className={`badge type-badge type-${item.primary_type}`}>{TYPE_LABELS[item.primary_type]}</span></div>
      <div className="organizer-cell">{item.organizer}</div>
      <div className="state-cell">
        <span className={`status status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
        <div className="row-actions">
          <button type="button" className="icon-button" aria-label={favorite ? '관심 해제' : '관심 등록'} aria-pressed={favorite} onClick={() => onToggle('favorites', item.id, item)}>{favorite ? '★' : '☆'}</button>
          <button type="button" className="text-button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? '접기' : '펼치기'}</button>
          <button type="button" className="text-button muted" onClick={() => onToggle('hidden', item.id)}>숨김</button>
        </div>
      </div>
    </article>
  )
}

