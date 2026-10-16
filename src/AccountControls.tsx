import { useEffect, useState } from 'react'
import { useAccount } from './account'
import { usePersonalState } from './personal'

export function AccountToolbar() {
  const account = useAccount()

  return (
    <div className="account-toolbar">
      {account.user ? (
        <>
          <span className="account-email">{account.user.displayName || account.user.email}</span>
          <button type="button" className="account-button" onClick={() => void account.signOut()}>로그아웃</button>
        </>
      ) : (
        <button type="button" className="account-button" onClick={account.openLogin}>Google 로그인</button>
      )}
    </div>
  )
}

export function AccountDialogs() {
  const account = useAccount()
  const personal = usePersonalState()
  const [accepted, setAccepted] = useState(false)
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    if (!account.loginOpen) {
      setAccepted(false)
      setLoginError('')
    }
  }, [account.loginOpen])

  const login = async () => {
    setLoginError('')
    try {
      await account.signInWithGoogle()
    } catch (reason) {
      setLoginError(reason instanceof Error ? reason.message : 'Google 로그인에 실패했습니다.')
    }
  }

  return (
    <>
      {account.loginOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="login-title" tabIndex={-1} onKeyDown={event => {
          if (event.key === 'Escape') account.closeLogin()
        }} onMouseDown={event => {
          if (event.target === event.currentTarget) account.closeLogin()
        }}>
          <section className="modal-card">
            <button type="button" className="modal-close" aria-label="닫기" onClick={account.closeLogin}>×</button>
            <h2 id="login-title">QuestBoard 계정</h2>
            <p>Google 계정으로 가입하거나 로그인하면 찜한 공고와 일정, 합격 발표일과 메모, 개인 키워드, 알림 읽음 상태가 계정에 저장되고 기기 간 동기화됩니다.</p>
            <p>저장 정보는 본인 UID 아래 Firestore에 보관됩니다. 계정을 삭제하면 계정 데이터는 함께 삭제됩니다. 이 브라우저에 보관된 확인·숨김과 아직 가져오지 않은 찜은 브라우저에 남습니다. 공고 검색과 열람은 로그인 없이 이용할 수 있습니다.</p>
            {!account.configured && <p className="message-inline" role="status">Firebase 설정이 완료되면 Google 로그인을 사용할 수 있습니다.</p>}
            {loginError && <p className="message-inline error" role="alert">{loginError}</p>}
            <label className="privacy-check"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /> 저장되는 정보와 계정 삭제 방법을 확인했습니다.</label>
            <button type="button" className="primary-button" disabled={!accepted || !account.configured} onClick={() => void login()}>Google로 계속</button>
          </section>
        </div>
      )}
      {personal.migrationOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="migration-title" tabIndex={-1}>
          <section className="modal-card">
            <h2 id="migration-title">이 브라우저의 기존 찜</h2>
            <p>기존 브라우저 찜 {personal.localFavoriteCount}개를 계정 찜과 합칠까요? 같은 공고는 한 번만 저장하며, 이미 계정에 있는 내용은 덮어쓰지 않습니다.</p>
            <ul className="migration-list">
              {personal.localFavoriteItems.slice(0, 8).map(item => <li key={item.id}>{item.title}</li>)}
              {personal.localFavoriteCount > personal.localFavoriteItems.length && <li>목록에서 찾지 못한 {personal.localFavoriteCount - personal.localFavoriteItems.length}개는 브라우저에 남습니다.</li>}
            </ul>
            {personal.error && <p className="message-inline error" role="alert">{personal.error}</p>}
            <div className="modal-actions">
              <button type="button" className="primary-button" disabled={personal.loading} onClick={() => void personal.importLocalFavorites()}>계정 찜에 합치기</button>
              <button type="button" className="account-button" onClick={() => personal.closeMigration(true)}>나중에</button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
