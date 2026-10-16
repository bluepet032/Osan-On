import { useId, useState } from 'react'
import {
  activeAdvancedCount, ADVANCED_LABELS, ADVANCED_PARAMS, APPLY_OPTIONS, coverageLabel, SPARSE_COVERAGE, type AdvancedFilters, type AdvancedKey,
} from '../advancedFilters'

interface Props {
  advanced: AdvancedFilters
  /** Number of items that would remain with ``key`` set to ``value`` and every other filter unchanged. */
  countWith: (key: AdvancedKey, value: string) => number
  /** Share of items in the current view that carry each filter's fact; null without items. */
  coverage: Record<AdvancedKey, number> | null
  onChange: (param: string, value: string) => void
  /** Apply several URL changes at once; sequential single updates would each start from stale params. */
  onChangeMany: (changes: Record<string, string>) => void
}

type Field = { key: AdvancedKey; label: string; empty: string; options: [string, string][]; hint?: string }

const FIELDS: Field[] = [
  { key: 'apply', label: ADVANCED_LABELS.apply, empty: '모든 신청 방법', options: Object.entries(APPLY_OPTIONS), hint: '온라인과 방문을 모두 받는 혜택은 양쪽에 나옵니다.' },
]

export function AdvancedFilterPanel({ advanced, countWith, coverage, onChange, onChangeMany }: Props) {
  const active = activeAdvancedCount(advanced)
  const [open, setOpen] = useState(active > 0)
  const panelId = useId()
  const reset = () => onChangeMany(Object.fromEntries([...Object.values(ADVANCED_PARAMS), 'unknown'].map(param => [param, ''])))
  // Most sources never state some of these facts, so picking one would hide nearly everything.
  // Those filters stay reachable but folded away, unless one is already in use.
  const sparse = (field: Field) => coverage !== null && coverage[field.key] < SPARSE_COVERAGE && !advanced[field.key]
  const main = FIELDS.filter(field => !sparse(field))
  const folded = FIELDS.filter(sparse)

  const renderField = (field: Field) => (
    <label key={field.key} className="advanced-field">
      <span>{field.label}{coverage && <em className="advanced-coverage">{coverageLabel(coverage[field.key])}</em>}</span>
      <select aria-label={field.label} value={advanced[field.key]} onChange={event => onChange(ADVANCED_PARAMS[field.key], event.target.value)}>
        <option value="">{field.empty}</option>
        {field.options.map(([value, text]) => <option key={value} value={value}>{`${text} (${countWith(field.key, value)})`}</option>)}
      </select>
      {field.hint && <small>{field.hint}</small>}
    </label>
  )

  return (
    <div className="advanced-filters">
      <div className="advanced-toggle-row">
        <button type="button" className={`advanced-toggle ${active ? 'has-active' : ''}`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
          상세 조건{active > 0 && <span className="advanced-count">{active}</span>}
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {active > 0 && <button type="button" className="text-button" onClick={reset}>상세 조건 초기화</button>}
      </div>
      {open && (
        <div className="advanced-panel" id={panelId}>
          {main.map(renderField)}
          {folded.length > 0 && (
            <details className="advanced-sparse">
              <summary>정보가 적은 조건 {folded.length}개 ({folded.map(field => field.label).join(', ')})</summary>
              <p>대부분의 출처가 이 정보를 알려 주지 않아, 고르면 결과가 크게 줄어듭니다.</p>
              <div className="advanced-sparse-fields">{folded.map(renderField)}</div>
            </details>
          )}
          <label className="advanced-unknown">
            <input type="checkbox" checked={advanced.includeUnknown} onChange={event => onChange('unknown', event.target.checked ? '1' : '')} />
            <span>정보가 없는 혜택도 함께 보기</span>
          </label>
        </div>
      )}
    </div>
  )
}
