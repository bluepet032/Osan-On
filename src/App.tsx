import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { AccountProvider, useAccount } from './account'
import { isAdmin } from './admin'
import { AccountDialogs, AccountToolbar } from './AccountControls'
import { ThemeControl } from './components/ThemeControl'
import { NoticePage } from './pages/NoticePage'
import { OpportunityPage } from './pages/OpportunityPage'
import { PersonalPage } from './pages/PersonalPage'
import { StatusPage } from './pages/StatusPage'
import { WeeklyPage } from './pages/WeeklyPage'
import { PersonalProvider, usePersonalState } from './personal'
import { ProfileProvider } from './profileContext'

export function App() {
  return (
    <HashRouter>
      <AccountProvider>
        <ProfileProvider>
          <PersonalProvider>
            <AppContent />
          </PersonalProvider>
        </ProfileProvider>
      </AccountProvider>
    </HashRouter>
  )
}

function AppContent() {
  const { notifications } = usePersonalState()
  const { user } = useAccount()
  const unread = notifications.filter(notification => !notification.read).length
  const admin = isAdmin(user?.uid)

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <NavLink className="brand" to="/"><span>오</span><div><strong>오산온</strong><small>오산시민 맞춤 혜택 찾기</small></div></NavLink>
          <nav aria-label="주 메뉴">
            <NavLink to="/" end>혜택</NavLink>
            <NavLink to="/weekly">주간 요약</NavLink>
            <NavLink to="/closed">마감 혜택</NavLink>
            {admin && <NavLink to="/status">수집 상태</NavLink>}
            <NavLink to="/my">내 혜택함{unread > 0 && <span className="unread-badge">{unread}</span>}</NavLink>
          </nav>
          <div className="header-actions"><AccountToolbar /><ThemeControl /></div>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<OpportunityPage dataset="benefits" title="나에게 맞는 혜택" description="오산시·경기도·중앙정부의 복지, 지원금, 정부 혜택 중 내 조건에 해당할 가능성이 높은 것을 모았습니다." />} />
        <Route path="/undated" element={<Navigate to="/" replace />} />
        <Route path="/closed" element={<OpportunityPage dataset="closed" title="최근 마감 혜택" description="최근 3개월 내 신청이 마감된 혜택을 참고용으로 검색할 수 있습니다." />} />
        <Route path="/weekly" element={<WeeklyPage />} />
        <Route path="/notice/:id" element={<NoticePage />} />
        <Route path="/status" element={admin ? <StatusPage /> : <AdminOnly />} />
        <Route path="/my" element={<PersonalPage />} />
      </Routes>
      <footer><div className="container"><strong>오산온</strong><p>정부24·복지로 공공데이터를 바탕으로 해당 가능성을 안내합니다. 실제 자격과 신청 방법은 반드시 소관 기관 원문에서 확인하세요.</p></div></footer>
      <AccountDialogs />
    </>
  )
}

function AdminOnly() {
  return (
    <main id="main-content" className="container">
      <div className="message"><h1>관리자 전용 페이지</h1><span>수집 상태는 관리자 계정으로 로그인했을 때만 볼 수 있습니다.</span></div>
    </main>
  )
}
