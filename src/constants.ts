import type { Domain, Jurisdiction, OpportunityStatus, OpportunityType } from './types'

export const TYPE_LABELS: Record<OpportunityType, string> = {
  cash: '현금', in_kind: '현물', service: '서비스', voucher: '이용권', loan: '융자', reduction: '감면', other: '기타',
}

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  upcoming: '접수예정', open: '접수중', urgent: '긴급', today: '오늘마감', closed: '마감', ongoing: '상시', unknown: '기간 미정',
}

export const TYPES = Object.keys(TYPE_LABELS) as OpportunityType[]

// Order matches the tab row (정부24 서비스분야).
export const DOMAIN_LABELS: Record<Domain, string> = {
  living: '생활안정', housing: '주거·자립', childcare: '보육·교육', jobs: '고용·창업', health: '보건·의료',
  pregnancy: '임신·출산', care: '보호·돌봄', culture: '문화·환경', agriculture: '농림축산어업', admin: '행정·안전',
}
export const DOMAINS = Object.keys(DOMAIN_LABELS) as Domain[]
// Benefits are browsed across all fields first; a field tab only narrows the list.
export const DEFAULT_DOMAIN = 'all'
export const domainOf = (item: { domain?: Domain }): Domain => item.domain ?? 'living'
export const JURISDICTION_LABELS: Record<Jurisdiction, string> = { osan: '오산시', gyeonggi: '경기도', national: '중앙정부' }
export const QUICK_TAGS = ['NEW', 'UPDATED', '마감임박'] as const
export const PAGE_SIZE = 50


export const REPOSITORY_URL = 'https://github.com/bluepet032/Osan-On'
export const COLLECT_WORKFLOW_URL = `${REPOSITORY_URL}/actions/workflows/collect.yml`
// The cron is 03:11 KST, but GitHub starts scheduled runs hours late (06:37–09:34 KST in Oct 2026).
export const AUTO_REFRESH_LABEL = '매일 오전(KST)'
// Collection runs daily, so a source is only stale after missing about two runs.
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000
