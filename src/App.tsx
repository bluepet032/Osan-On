import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { AccountProvider } from './account'
import { AccountDialogs, AccountToolbar } from './AccountControls'
import { ThemeControl } from './components/ThemeControl'
import { NoticePage } from './pages/NoticePage'
import { OpportunityPage } from './pages/OpportunityPage'
import { PersonalPage } from './pages/PersonalPage'
import { StatusPage } from './pages/StatusPage'
import { WeeklyPage } from './pages/WeeklyPage'
import { PersonalProvider, usePersonalState } from './personal'

export function App() {
  return (
    <HashRouter>
      <AccountProvider>
        <PersonalProvider>
          <AppContent />
        </PersonalProvider>
      </AccountProvider>
    </HashRouter>
  )
}

function AppContent() {
  const { notifications } = usePersonalState()
  const unread = notifications.filter(notification => !notification.read).length

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <NavLink className="brand" to="/"><span>Q</span><div><strong>QuestBoard</strong><small>분야별 공모전·지원사업 모아보기</small></div></NavLink>
          <nav aria-label="주 메뉴">
            <NavLink to="/" end>공고</NavLink>
            <NavLink to="/weekly">주간 요약</NavLink>
            <NavLink to="/undated">날짜 미상</NavLink>
            <NavLink to="/closed">마감 공고</NavLink>
            <NavLink to="/status">수집 상태</NavLink>
            <NavLink to="/my">내 비서{unread > 0 && <span className="unread-badge">{unread}</span>}</NavLink>
          </nav>
          <div className="header-actions"><AccountToolbar /><ThemeControl /></div>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<OpportunityPage dataset="active" title="지금 도전할 기회" description="공모전, 지원사업과 행사를 분야별로, 마감이 가까운 순서로 확인하세요." />} />
        <Route path="/undated" element={<OpportunityPage dataset="undated" title="날짜 미상 공고" description="상시·선착순·예산 소진·일정 미정 공고를 따로 모았습니다." />} />
        <Route path="/closed" element={<OpportunityPage dataset="closed" title="최근 마감 공고" description="최근 3개월 내 마감된 공고를 참고용으로 검색할 수 있습니다." />} />
        <Route path="/weekly" element={<WeeklyPage />} />
        <Route path="/notice/:id" element={<NoticePage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/my" element={<PersonalPage />} />
      </Routes>
      <footer><div className="container"><strong>QuestBoard</strong><p>공개된 공고의 요약과 원문 링크만 제공합니다. 신청 전 반드시 주최기관 원문을 확인하세요.</p></div></footer>
      <AccountDialogs />
    </>
  )
}
