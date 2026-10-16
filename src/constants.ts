import type { Domain, OpportunityStatus, OpportunityType } from './types'

export const TYPE_LABELS: Record<OpportunityType, string> = {
  contest: '공모전', support: '지원사업', hackathon: '해커톤·게임잼', event: '행사·네트워킹',
  education: '교육·프로그램', supporters: '서포터즈', employment: '채용·인턴', other: '기타',
}

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  upcoming: '접수예정', open: '접수중', urgent: '긴급', today: '오늘마감', closed: '마감', ongoing: '상시모집', unknown: '날짜 미상',
}

export const TYPES = Object.keys(TYPE_LABELS) as OpportunityType[]

// Order matches the tab row; IT·게임 is the default tab and the site's original scope.
export const DOMAIN_LABELS: Record<Domain, string> = {
  it: 'IT·게임', design_media: '디자인·영상', literature_arts: '문학·예술', planning_ideas: '기획·아이디어', business: '창업·비즈니스',
}
export const DOMAINS = Object.keys(DOMAIN_LABELS) as Domain[]
export const DEFAULT_DOMAIN: Domain = 'it'
export const domainOf = (item: { domain?: Domain }): Domain => item.domain ?? DEFAULT_DOMAIN
export const QUICK_TAGS = ['대학생', '인디', 'AI', '공식 출처', 'NEW', 'UPDATED', '마감임박'] as const
export const PAGE_SIZE = 50


export const REPOSITORY_URL = 'https://github.com/bluepet032/QuestBoard'
export const COLLECT_WORKFLOW_URL = `${REPOSITORY_URL}/actions/workflows/collect.yml`
// The cron is 03:11 KST, but GitHub starts scheduled runs hours late (06:37–09:34 KST in Oct 2026).
export const AUTO_REFRESH_LABEL = '매일 오전(KST)'
// Collection runs daily, so a source is only stale after missing about two runs.
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000
