import { expect, test } from '@playwright/test'

// KST dates relative to today so the fixture never ages into the closed list.
const isoDay = (offset: number) => new Date(Date.now() + 9 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)

const opportunity = (overrides: Record<string, unknown>) => ({
  id: 'contest-1', title: 'AI 인디게임 공모전', source_name: '테스트 출처', source_url: 'https://example.com/contest',
  organizer: '게임재단', summary: '대학생 개발팀이 AI 인디게임을 제작해 출품하는 공모전으로 자세한 참가 조건과 일정은 원문에서 확인합니다.',
  primary_type: 'contest', field_tags: ['게임', 'AI', '인디'], audience_tags: ['대학생'], status: 'open',
  relevance: { score: 90, reasons: ['테스트'], decision: 'publish' }, first_seen_at: '2026-07-30T10:00:00+09:00',
  last_seen_at: '2026-07-30T10:00:00+09:00', sources: [{ source_id: 'test', source_name: '테스트 출처', source_url: 'https://example.com/contest', kind: 'official', priority: 100 }],
  recruit_start: isoDay(-10), recruit_end: isoDay(21), date_kind: 'exact', d_day: 21, fee: 'free', mode: 'online',
  ...overrides,
})

test('loads opportunity dashboard and changes theme', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: '지금 도전할 기회' })).toBeVisible()
  await page.getByLabel('화면 테마').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('status route is reachable', async ({ page }) => {
  await page.goto('/#/status')
  await expect(page.getByRole('heading', { name: '수집 상태' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'GitHub에서 지금 수집 실행' })).toHaveAttribute('href', /actions\/workflows\/collect\.yml$/)
  await expect(page.getByRole('button', { name: '최신 데이터 다시 불러오기' })).toBeEnabled()
  await expect(page.locator('details.review-section')).not.toHaveAttribute('open', '')
})

test('requires login for favorites and restores URL and hidden state after reload', async ({ page }) => {
  await page.route('**/data/active.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      schema_version: 1,
      generated_at: '2026-07-30T12:00:00+09:00',
      items: [
        opportunity({}),
        opportunity({ id: 'support-1', title: '게임 스타트업 제작지원', summary: '게임 스타트업의 사업화와 콘텐츠 제작비를 지원하며 자세한 대상과 신청 절차는 원문 공고에서 확인합니다.', primary_type: 'support', source_url: 'https://example.com/support', field_tags: ['게임', '창업'], audience_tags: ['창업자·기업'] }),
      ],
    }),
  }))
  await page.goto('/#/')
  await page.getByLabel('통합 검색').fill('인디')
  await expect(page).toHaveURL(/q=%EC%9D%B8%EB%94%94/)
  await expect(page.locator('.result-toolbar strong')).toHaveText('1개')
  await expect(page.getByRole('button', { name: '지원사업 0' })).toBeVisible()
  await page.getByRole('button', { name: '관심 등록' }).click()
  await expect(page.getByRole('dialog', { name: 'QuestBoard 계정' })).toBeVisible()
  await page.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: '숨김' }).click()
  await expect(page.getByRole('button', { name: '숨긴 공고 1개 모두 복원' })).toBeVisible()

  await page.reload()

  await expect(page.getByLabel('통합 검색')).toHaveValue('인디')
  await expect(page.getByRole('button', { name: '숨긴 공고 1개 모두 복원' })).toBeVisible()
  await page.getByRole('button', { name: '숨긴 공고 1개 모두 복원' }).click()
  await expect(page.getByRole('button', { name: '관심 등록' })).toBeVisible()
  await expect(page).toHaveURL(/q=%EC%9D%B8%EB%94%94/)
})

test('hides items whose deadline passed after the last collection', async ({ page }) => {
  await page.route('**/data/active.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      schema_version: 1,
      generated_at: '2026-07-30T12:00:00+09:00',
      items: [
        opportunity({}),
        opportunity({ id: 'stale-1', title: '이미 마감된 게임 공모전', source_url: 'https://example.com/stale', recruit_end: isoDay(-2), d_day: 5 }),
      ],
    }),
  }))
  await page.goto('/#/')
  await expect(page.locator('.result-toolbar strong')).toHaveText('1개')
  await expect(page.getByText('이미 마감된 게임 공모전')).toHaveCount(0)
  await expect(page.locator('.opportunity').first()).toContainText('D-21')
})

const routeActive = (page: import('@playwright/test').Page, items: unknown[]) => page.route('**/data/active.json', route => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ schema_version: 1, generated_at: '2026-07-30T12:00:00+09:00', items }),
}))

test('opening the same notice twice keeps the read state after reload', async ({ page }) => {
  await routeActive(page, [opportunity({})])
  await page.context().route('https://example.com/contest', route => route.fulfill({ body: '공고 원문' }))
  await page.goto('/#/')
  const link = page.getByRole('link', { name: 'AI 인디게임 공모전', exact: true })
  await link.click()
  await expect(page.locator('.opportunity')).toHaveClass(/is-read/)
  await link.click()
  await expect(page.locator('.opportunity')).toHaveClass(/is-read/)
  await page.reload()
  await expect(page.locator('.opportunity')).toHaveClass(/is-read/)
})

test('field tabs, typo-tolerant search and source badges', async ({ page }) => {
  await routeActive(page, [
    opportunity({}),
    opportunity({ id: 'video-1', title: '2026 남원시 영상 공모전', organizer: '남원시', summary: '남원의 관광지와 축제를 소재로 한 짧은 영상을 공모하며 자세한 참가 조건과 일정은 원문 공고에서 확인합니다.', source_url: 'https://example.com/video', domain: 'design_media', field_tags: ['영상'], audience_tags: [], relevance: { score: 20, reasons: [], decision: 'publish' }, sources: [{ source_id: 'linkareer', source_name: '링커리어', source_url: 'https://example.com/video', kind: 'aggregate', priority: 40 }] }),
  ])
  await page.goto('/#/')
  await expect(page.locator('.result-toolbar strong')).toHaveText('1개')
  await expect(page.locator('.opportunity').first()).toContainText('공식기관')

  await page.getByRole('button', { name: /디자인·영상/ }).click()
  await expect(page).toHaveURL(/domain=design_media/)
  await expect(page.locator('.opportunity')).toHaveCount(1)
  await expect(page.locator('.opportunity').first()).toContainText('남원시 영상 공모전')
  await expect(page.locator('.opportunity').first()).toContainText('모음 사이트')

  await page.getByRole('button', { name: /모든 분야/ }).click()
  await page.getByLabel('통합 검색').fill('개임')
  await expect(page.getByText('철자가 비슷한 공고를 보여 드립니다')).toBeVisible()
  await expect(page.locator('.opportunity')).toHaveCount(1)
})

test('weekly digest lists deadlines this week', async ({ page }) => {
  await routeActive(page, [opportunity({ title: '오늘 마감 게임 공모전', recruit_end: isoDay(0), d_day: 0 })])
  await page.goto('/#/weekly')
  await expect(page.getByRole('heading', { name: '주간 요약' })).toBeVisible()
  const thisWeek = page.locator('section[aria-labelledby="closing-this-week"]')
  await expect(thisWeek).toContainText('오늘 마감 게임 공모전')
  await expect(thisWeek.locator('.section-heading strong')).toHaveText('1건')
})

test('advanced filters: unknown items, nationwide notices, reload and reset', async ({ page }) => {
  const source = (id: string) => ({ source_url: `https://example.com/${id}`, sources: [{ source_id: 'test', source_name: '테스트 출처', source_url: `https://example.com/${id}`, kind: 'official', priority: 100 }] })
  await routeActive(page, [
    opportunity({ id: 'seoul', title: '서울 무료 게임 행사', ...source('seoul'), regions: ['서울'], fee: 'free', mode: 'offline' }),
    opportunity({ id: 'nation', title: '전국 게임 공모전', ...source('nation'), regions: ['전국'], fee: 'free', mode: 'online' }),
    opportunity({ id: 'busan', title: '부산 게임 행사', ...source('busan'), regions: ['부산'], fee: 'paid', mode: 'offline' }),
    opportunity({ id: 'nodata', title: '정보 없는 게임 공모전', ...source('nodata'), regions: [], fee: 'unknown', mode: '' }),
  ])
  await page.goto('/#/')
  await expect(page.locator('.result-toolbar strong')).toHaveText('4개')

  await page.getByRole('button', { name: /^상세 조건\s*\d*$/ }).click()
  const field = (label: string) => page.locator('.advanced-field').filter({ has: page.getByLabel(label) })
  await expect(field('지역').locator('.advanced-coverage')).toHaveText('정보 있는 공고 75%')
  // No test item states a prize, so that filter is folded away until opened.
  await expect(page.locator('.advanced-sparse summary')).toHaveText('정보가 적은 조건 1개 (상금)')
  await expect(page.getByLabel('상금')).toBeHidden()
  await page.locator('.advanced-sparse summary').click()
  await expect(page.getByLabel('상금')).toBeVisible()

  await page.getByLabel('지역').selectOption('서울')
  await expect(page).toHaveURL(/region=%EC%84%9C%EC%9A%B8/)
  await expect(page.locator('.result-toolbar strong')).toHaveText('2개')
  await expect(page.locator('.opportunity')).toContainText(['서울 무료 게임 행사', '전국 게임 공모전'])
  await expect(page.getByText('정보가 없는 공고 1건은 목록에서 빠져 있습니다')).toBeVisible()

  await page.getByLabel('참가비').selectOption('free')
  await expect(page.locator('.result-toolbar strong')).toHaveText('2개')
  await page.getByLabel('진행 방식').selectOption('online')
  await expect(page.locator('.result-toolbar strong')).toHaveText('1개')
  await expect(page.getByRole('button', { name: /^상세 조건\s*\d*$/ })).toContainText('3')

  await page.getByRole('button', { name: '함께 보기' }).click()
  await expect(page).toHaveURL(/unknown=1/)
  await expect(page.locator('.result-toolbar strong')).toHaveText('2개')
  await expect(page.locator('.opportunity')).toContainText(['전국 게임 공모전', '정보 없는 게임 공모전'])

  await page.reload()
  await expect(page.getByLabel('지역')).toHaveValue('서울')
  await expect(page.getByLabel('진행 방식')).toHaveValue('online')
  await expect(page.getByRole('checkbox', { name: '정보가 없는 공고도 함께 보기' })).toBeChecked()
  await expect(page.locator('.result-toolbar strong')).toHaveText('2개')

  await page.getByRole('button', { name: '상세 조건 초기화' }).click()
  await expect(page.locator('.result-toolbar strong')).toHaveText('4개')
  await expect(page).not.toHaveURL(/region=|mode=|fee=|unknown=/)
})

test('each notice has its own shareable page', async ({ page }) => {
  const payload = (items: unknown[]) => ({ contentType: 'application/json', body: JSON.stringify({ schema_version: 1, generated_at: '2026-07-30T12:00:00+09:00', items }) })
  await page.route('**/data/active.json', route => route.fulfill(payload([opportunity({})])))
  await page.route('**/data/undated.json', route => route.fulfill(payload([])))
  await page.route('**/data/closed.json', route => route.fulfill(payload([])))
  await page.goto('/#/')
  await page.getByRole('button', { name: '펼치기' }).click()
  await page.getByRole('link', { name: '공유용 링크' }).click()

  await expect(page).toHaveURL(/#\/notice\/contest-1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'AI 인디게임 공모전' })).toBeVisible()
  await expect(page.getByRole('link', { name: '원문 보기' })).toHaveAttribute('href', 'https://example.com/contest')

  await page.goto('/#/notice/no-such-notice')
  await expect(page.getByText('공고를 찾을 수 없습니다')).toBeVisible()
})

test('the list links to the RSS feed of the selected field', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('link', { name: 'RSS' })).toHaveAttribute('href', /data\/feed-it\.xml$/)
  await page.goto('/#/?domain=all')
  await expect(page.getByRole('link', { name: 'RSS' })).toHaveAttribute('href', /data\/feed\.xml$/)
})
