import { expect, test } from '@playwright/test'

// KST dates relative to today so the fixture never ages into the closed list.
const isoDay = (offset: number) => new Date(Date.now() + 9 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)

const opportunity = (overrides: Record<string, unknown>) => ({
  id: 'contest-1', title: 'AI 인디게임 공모전', source_name: '테스트 출처', source_url: 'https://example.com/contest',
  organizer: '게임재단', summary: '대학생 개발팀이 AI 인디게임을 제작해 출품하는 공모전으로 자세한 참가 조건과 일정은 원문에서 확인합니다.',
  primary_type: 'cash', field_tags: ['게임', 'AI', '인디'], audience_tags: ['대학생'], status: 'open',
  relevance: { score: 90, reasons: ['테스트'], decision: 'publish' }, first_seen_at: '2026-07-30T10:00:00+09:00',
  last_seen_at: '2026-07-30T10:00:00+09:00', sources: [{ source_id: 'test', source_name: '테스트 출처', source_url: 'https://example.com/contest', kind: 'official', priority: 100 }],
  recruit_start: isoDay(-10), recruit_end: isoDay(21), date_kind: 'exact', d_day: 21,
  ...overrides,
})

// The open list also reads undated.json; keep the committed (real) data out of fixture-based tests.
test.beforeEach(async ({ page }) => {
  await page.route('**/data/undated.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ schema_version: 1, generated_at: '2026-07-30T12:00:00+09:00', items: [] }),
  }))
})

test('loads opportunity dashboard and changes theme', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: '나에게 맞는 혜택' })).toBeVisible()
  await page.getByLabel('화면 테마').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('status route is for admins only', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('link', { name: '수집 상태' })).toHaveCount(0)
  await page.goto('/#/status')
  await expect(page.getByRole('heading', { name: '관리자 전용 페이지' })).toBeVisible()
  await expect(page.getByText('출처별 상태')).toHaveCount(0)
})

test('keeps favorites without login and restores URL, favorite and hidden state after reload', async ({ page }) => {
  await page.route('**/data/active.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      schema_version: 1,
      generated_at: '2026-07-30T12:00:00+09:00',
      items: [
        opportunity({}),
        opportunity({ id: 'support-1', title: '게임 스타트업 제작지원', summary: '게임 스타트업의 사업화와 콘텐츠 제작비를 지원하며 자세한 대상과 신청 절차는 원문 공고에서 확인합니다.', primary_type: 'service', source_url: 'https://example.com/support', field_tags: ['게임', '창업'], audience_tags: ['창업자·기업'] }),
      ],
    }),
  }))
  await page.goto('/#/')
  await page.getByLabel('통합 검색').fill('인디')
  await expect(page).toHaveURL(/q=%EC%9D%B8%EB%94%94/)
  await expect(page.locator('.result-toolbar strong')).toHaveText('1개')
  await expect(page.getByRole('button', { name: '모든 분야 1' })).toBeVisible()
  await page.getByRole('button', { name: '관심 등록' }).click()
  await expect(page.getByRole('button', { name: '관심 해제' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '오산온 계정' })).toHaveCount(0)
  await page.getByRole('button', { name: '숨김' }).click()
  await expect(page.getByRole('button', { name: '숨긴 혜택 1개 모두 복원' })).toBeVisible()

  await page.reload()

  await expect(page.getByLabel('통합 검색')).toHaveValue('인디')
  await expect(page.getByRole('button', { name: '숨긴 혜택 1개 모두 복원' })).toBeVisible()
  await page.getByRole('button', { name: '숨긴 혜택 1개 모두 복원' }).click()
  await expect(page.getByRole('button', { name: '관심 해제' })).toBeVisible()
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
    opportunity({ id: 'video-1', title: '2026 남원시 영상 공모전', organizer: '남원시', summary: '남원의 관광지와 축제를 소재로 한 짧은 영상을 공모하며 자세한 참가 조건과 일정은 원문 공고에서 확인합니다.', source_url: 'https://example.com/video', domain: 'housing', field_tags: ['영상'], audience_tags: [], relevance: { score: 20, reasons: [], decision: 'publish' }, sources: [{ source_id: 'linkareer', source_name: '링커리어', source_url: 'https://example.com/video', kind: 'aggregate', priority: 40 }] }),
  ])
  await page.goto('/#/')
  await expect(page.locator('.result-toolbar strong')).toHaveText('2개')
  await expect(page.locator('.opportunity').filter({ hasText: 'AI 인디게임 공모전' })).toContainText('공식기관')

  await page.getByRole('button', { name: /주거·자립/ }).click()
  await expect(page).toHaveURL(/domain=housing/)
  await expect(page.locator('.opportunity')).toHaveCount(1)
  await expect(page.locator('.opportunity').first()).toContainText('남원시 영상 공모전')
  await expect(page.locator('.opportunity').first()).toContainText('모음 사이트')

  await page.getByRole('button', { name: /모든 분야/ }).click()
  await page.getByLabel('통합 검색').fill('개임')
  await expect(page.getByText('철자가 비슷한 혜택을 보여 드립니다')).toBeVisible()
  await expect(page.locator('.opportunity')).toHaveCount(1)
})

test('weekly digest lists deadlines this week and leaves out benefits the profile rules out', async ({ page }) => {
  await routeActive(page, [
    opportunity({ title: '오늘 마감 게임 공모전', recruit_end: isoDay(0), d_day: 0 }),
    opportunity({ id: 'men-only', title: '남성 전용 혜택', source_url: 'https://example.com/men', recruit_end: isoDay(0), d_day: 0, conditions: { codes: ['JA0101'], age_min: null, age_max: null } }),
  ])
  await page.addInitScript(() => localStorage.setItem('osanon.profile', JSON.stringify({ gender: 'female', age: 28 })))
  await page.goto('/#/weekly')
  await expect(page.getByText("'해당 없음'인 혜택 1건은 뺐습니다")).toBeVisible()
  await expect(page.getByText('남성 전용 혜택')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '주간 요약' })).toBeVisible()
  const thisWeek = page.locator('section[aria-labelledby="closing-this-week"]')
  await expect(thisWeek).toContainText('오늘 마감 게임 공모전')
  await expect(thisWeek.locator('.section-heading strong')).toHaveText('1건')
})

test('advanced filters: how to apply, unknown items, reload and reset', async ({ page }) => {
  const source = (id: string) => ({ source_url: `https://example.com/${id}`, sources: [{ source_id: 'test', source_name: '테스트 출처', source_url: `https://example.com/${id}`, kind: 'official', priority: 100 }] })
  await routeActive(page, [
    opportunity({ id: 'both', title: '온라인·방문 혜택', ...source('both'), apply_methods: ['online', 'visit'] }),
    opportunity({ id: 'online', title: '온라인 혜택', ...source('online'), apply_methods: ['online'] }),
    opportunity({ id: 'visit', title: '방문 혜택', ...source('visit'), apply_methods: ['visit'] }),
    opportunity({ id: 'nodata', title: '정보 없는 혜택', ...source('nodata'), apply_methods: [] }),
  ])
  await page.goto('/#/')
  await expect(page.locator('.result-toolbar strong')).toHaveText('4개')

  await page.getByRole('button', { name: /^상세 조건\s*\d*$/ }).click()
  await expect(page.locator('.advanced-field').filter({ has: page.getByLabel('신청 방법') }).locator('.advanced-coverage')).toHaveText('정보 있는 혜택 75%')
  await page.getByLabel('신청 방법').selectOption('online')
  await expect(page).toHaveURL(/apply=online/)
  await expect(page.locator('.result-toolbar strong')).toHaveText('2개')
  await expect(page.locator('.opportunity')).toContainText(['온라인·방문 혜택', '온라인 혜택'])
  await expect(page.getByText('정보가 없는 혜택 1건은 목록에서 빠져 있습니다')).toBeVisible()

  await page.getByRole('button', { name: '함께 보기' }).click()
  await expect(page).toHaveURL(/unknown=1/)
  await expect(page.locator('.result-toolbar strong')).toHaveText('3개')

  await page.reload()
  await expect(page.getByLabel('신청 방법')).toHaveValue('online')
  await expect(page.getByRole('checkbox', { name: '정보가 없는 혜택도 함께 보기' })).toBeChecked()

  await page.getByRole('button', { name: '상세 조건 초기화' }).click()
  await expect(page.locator('.result-toolbar strong')).toHaveText('4개')
  await expect(page).not.toHaveURL(/apply=|unknown=/)
})

test('jurisdiction tabs narrow the list to one level of government', async ({ page }) => {
  await routeActive(page, [
    opportunity({ id: 'osan', title: '오산시 혜택', source_url: 'https://example.com/osan', jurisdiction: 'osan' }),
    opportunity({ id: 'gg', title: '경기도 혜택', source_url: 'https://example.com/gg', jurisdiction: 'gyeonggi' }),
    opportunity({ id: 'nation', title: '중앙정부 혜택', source_url: 'https://example.com/nation', jurisdiction: 'national' }),
  ])
  await page.goto('/#/')
  await expect(page.locator('.summary-cards span')).toHaveText(['1 오산시', '1 경기도', '0 마감임박'])
  await expect(page.locator('.opportunity').first()).toContainText('오산시 혜택')
  await page.getByRole('button', { name: /^경기도 1$/ }).click()
  await expect(page).toHaveURL(/place=gyeonggi/)
  await expect(page.locator('.opportunity')).toHaveCount(1)
  await expect(page.locator('.opportunity')).toContainText('경기도 혜택')
  await page.getByRole('button', { name: /^전체 소관 3$/ }).click()
  await expect(page.locator('.opportunity')).toHaveCount(3)
})

test('phones fold the support-form and quick tags behind a toggle', async ({ page, isMobile }) => {
  await routeActive(page, [opportunity({})])
  await page.goto('/#/')
  const toggle = page.getByRole('button', { name: /^지원 형태·빠른 필터/ })
  const cash = page.getByRole('button', { name: '현금 1' })
  if (!isMobile) {
    await expect(toggle).toBeHidden()
    await expect(cash).toBeVisible()
    return
  }
  await expect(cash).toBeHidden()
  await toggle.click()
  await cash.click()
  await expect(page).toHaveURL(/type=cash/)
  // A filter in use keeps the group open, as 상세 조건 does.
  await page.reload()
  await expect(cash).toBeVisible()
  await expect(toggle).toContainText('1')
})

test('each notice has its own shareable page', async ({ page }) => {
  const payload = (items: unknown[]) => ({ contentType: 'application/json', body: JSON.stringify({ schema_version: 1, generated_at: '2026-07-30T12:00:00+09:00', items }) })
  await page.route('**/data/active.json', route => route.fulfill(payload([opportunity({ conditions: { codes: [], age_min: 19, age_max: 34 } })])))
  await page.route('**/data/undated.json', route => route.fulfill(payload([])))
  await page.route('**/data/closed.json', route => route.fulfill(payload([])))
  await page.addInitScript(() => localStorage.setItem('osanon.profile', JSON.stringify({ gender: 'female', age: 28 })))
  await page.goto('/#/')
  await page.getByRole('button', { name: '펼치기' }).click()
  await page.getByRole('link', { name: '공유용 링크' }).click()

  await expect(page).toHaveURL(/#\/notice\/contest-1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'AI 인디게임 공모전' })).toBeVisible()
  await expect(page.getByRole('link', { name: '원문 보기' })).toHaveAttribute('href', 'https://example.com/contest')
  // The shared page judges the benefit against the visitor's own profile, as the list does.
  await expect(page.locator('.verdict')).toHaveText('가능성 높음')
  await expect(page.getByLabel('판정 근거')).toContainText('만 19~34세')

  await page.goto('/#/notice/no-such-notice')
  await expect(page.getByText('혜택을 찾을 수 없습니다')).toBeVisible()
})

test('the list links to the RSS feed of the selected field', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('link', { name: 'RSS' })).toHaveAttribute('href', /data\/feed\.xml$/)
  await page.goto('/#/?domain=living')
  await expect(page.getByRole('link', { name: 'RSS' })).toHaveAttribute('href', /data\/feed-living\.xml$/)
})

test('survey answers narrow the list to likely benefits', async ({ page }) => {
  const conditions = (codes: string[]) => ({ codes, age_min: 19, age_max: 34 })
  await routeActive(page, [
    opportunity({ id: 'women', title: '여성 청년 건강검진', source_url: 'https://example.com/women', conditions: conditions(['JA0102']) }),
    opportunity({ id: 'men', title: '남성 청년 지원', source_url: 'https://example.com/men', conditions: conditions(['JA0101']) }),
  ])
  await page.goto('/#/')
  await page.getByRole('radio', { name: '여성' }).check()
  await page.getByLabel('만 나이').fill('28')
  await page.getByRole('button', { name: '맞춤 혜택 보기' }).click()

  await expect(page.getByRole('button', { name: /가능성 높음 1/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.opportunity')).toHaveCount(1)
  await expect(page.locator('.opportunity')).toContainText('여성 청년 건강검진')
  await page.getByRole('button', { name: '펼치기' }).click()
  await expect(page.getByLabel('판정 근거')).toContainText('만 19~34세')

  await page.reload()
  await expect(page.getByText('여성 · 만 28세')).toBeVisible()
})
