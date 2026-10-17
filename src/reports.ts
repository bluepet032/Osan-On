import type { DocumentData } from 'firebase/firestore'
import type { Opportunity } from './types'

// Signed-in visitors report wrong benefit details; the admin reads and clears them in 수집 상태.
// Keep the fields and limits in sync with the /reports rules in firestore.rules.
export type ReportReason = 'period' | 'target' | 'link' | 'other'

export const REPORT_REASONS: Record<ReportReason, string> = {
  period: '신청 기간이 달라요',
  target: '지원 대상이 달라요',
  link: '링크가 안 열려요',
  other: '기타',
}

export interface ErrorReport {
  id: string
  opportunityId: string
  title: string
  sourceUrl: string
  reason: ReportReason
  note: string
  createdAt: string
}

export const reportDocument = (item: Opportunity, reason: ReportReason, note: string, uid: string) => ({
  opportunityId: item.id.slice(0, 100),
  title: item.title.slice(0, 200),
  sourceUrl: item.source_url.slice(0, 2000),
  reason,
  note: note.trim().slice(0, 500),
  uid,
  createdAt: new Date().toISOString(),
})

export function reportFromDocument(id: string, data: DocumentData): ErrorReport | null {
  if (!(data.reason in REPORT_REASONS) || typeof data.opportunityId !== 'string' || typeof data.title !== 'string') return null
  return {
    id,
    opportunityId: data.opportunityId,
    title: data.title,
    sourceUrl: typeof data.sourceUrl === 'string' && data.sourceUrl.startsWith('https://') ? data.sourceUrl : '',
    reason: data.reason,
    note: typeof data.note === 'string' ? data.note : '',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
  }
}
