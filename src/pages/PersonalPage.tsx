import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAccount } from '../account'
import { favoritesCalendar } from '../calendar'
import { usePersonalState, type SavedOpportunity } from '../personal'

function downloadCalendar(favorites: SavedOpportunity[]) {
  const url = URL.createObjectURL(new Blob([favoritesCalendar(favorites)], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'questboard-favorites.ics'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked on the next tick so the browser has started the download first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function PersonalPage() {
  const account = useAccount()
  const personal = usePersonalState()
  const [keyword, setKeyword] = useState('')
  const [accountError, setAccountError] = useState('')
  const [favoriteDrafts, setFavoriteDrafts] = useState<Record<string, { resultDate: string; note: string }>>({})
  const focusedDetails = useRef(new Map<string, string>())

  useEffect(() => {
    setFavoriteDrafts(current => {
      const next: typeof current = {}
      for (const favorite of personal.favorites) {
        const draft = current[favorite.id]
        next[favorite.id] = {
          resultDate: focusedDetails.current.has(favorite.id + ':resultDate') ? draft?.resultDate ?? favorite.resultDate : favorite.resultDate,
          note: focusedDetails.current.has(favorite.id + ':note') ? draft?.note ?? favorite.note : favorite.note,
        }
      }
      return next
    })
  }, [personal.favorites])

  const changeFavoriteDetail = (id: string, field: 'resultDate' | 'note', value: string) => {
    setFavoriteDrafts(current => ({
      ...current,
      [id]: { resultDate: current[id]?.resultDate ?? '', note: current[id]?.note ?? '', [field]: value },
    }))
  }

  const saveFavoriteDetail = (id: string, field: 'resultDate' | 'note', value: string, savedValue: string) => {
    const key = id + ':' + field
    const initialValue = focusedDetails.current.get(key)
    focusedDetails.current.delete(key)
    const changed = initialValue !== undefined && value !== initialValue
    const nextValue = changed ? value : savedValue
    setFavoriteDrafts(current => ({
      ...current,
      [id]: { resultDate: current[id]?.resultDate ?? '', note: current[id]?.note ?? '', [field]: nextValue },
    }))
    if (changed && value !== savedValue) personal.saveFavoriteDetails(id, { [field]: value })
  }

  const addKeyword = async (event: FormEvent) => {
    event.preventDefault()
    await personal.addKeyword(keyword)
    setKeyword('')
  }

  const deleteAccount = async () => {
    if (!window.confirm('계정과 찜, 일정, 키워드, 알림 데이터를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return
    setAccountError('')
    try {
      await account.deleteAccount()
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : '계정을 삭제하지 못했습니다.')
    }
  }

  if (!account.user) {
    return (
      <main id="main-content" className="container personal-page">
        <div className="page-heading"><div><p className="eyebrow">PERSONAL ASSISTANT</p><h1>내 비서</h1><p>찜한 공고 일정과 맞춤 키워드를 한곳에서 관리합니다.</p></div></div>
        <section className="personal-section sign-in-prompt">
          <h2>Google 로그인이 필요합니다</h2>
          <p>공고 검색과 열람은 공개로 이용할 수 있으며, 찜·일정 알림·키워드는 계정에 저장됩니다.</p>
          <button type="button" className="primary-button" onClick={account.openLogin}>로그인 또는 가입</button>
        </section>
      </main>
    )
  }

  const unread = personal.notifications.filter(notification => !notification.read).length

  return (
    <main id="main-content" className="container personal-page">
      <div className="page-heading">
        <div><p className="eyebrow">PERSONAL ASSISTANT</p><h1>내 비서</h1><p>{account.user.displayName || account.user.email} 계정에 동기화됩니다.</p></div>
        <div className="summary-cards"><span><strong>{personal.favorites.length}</strong> 찜</span><span><strong>{unread}</strong> 안 읽은 알림</span><span><strong>{personal.keywords.length}</strong> 키워드</span></div>
      </div>

      {personal.error && <div className="message-inline error" role="alert">{personal.error}</div>}
      {accountError && <div className="message-inline error" role="alert">{accountError}</div>}
      {personal.migrationMessage && <div className="message-inline" role="status">{personal.migrationMessage}</div>}
      {personal.localFavoriteCount > 0 && <div className="local-import">
        <span>이 브라우저에 가져오지 않은 기존 찜 {personal.localFavoriteCount}개가 보존되어 있습니다.</span>
        <button type="button" className="account-button" onClick={() => void personal.importLocalFavorites()}>기존 찜 가져오기</button>
      </div>}

      <section className="personal-section" aria-labelledby="notifications-title">
        <div className="section-heading"><div><h2 id="notifications-title">알림함</h2><p>사이트에 접속했을 때 일정과 새 맞춤 공고를 확인합니다.</p></div>
          {unread > 0 && <button type="button" className="text-button" onClick={personal.markAllNotificationsRead}>모두 읽음</button>}
        </div>
        {personal.loading ? <p role="status">계정 데이터를 불러오는 중입니다…</p> : personal.notifications.length === 0 ? <p className="empty-personal">새 알림이 없습니다.</p> : (
          <div className="notification-list">
            {[...personal.notifications].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(notification => (
              <article className={'notification-card' + (notification.read ? ' is-read' : '')} key={notification.id}>
                <div><strong>{notification.title}</strong><p>{notification.message}</p>
                  {notification.date && <small>일정: {notification.date}</small>}
                </div>
                <div className="notification-actions">
                  {notification.opportunityId && <a href={`#/notice/${notification.opportunityId}`}>공고 보기</a>}
                  {notification.sourceUrl && <a href={notification.sourceUrl} target="_blank" rel="noopener noreferrer">원문 보기</a>}
                  {!notification.read && <button type="button" className="text-button" onClick={() => personal.markNotificationRead(notification.id)}>읽음</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="personal-section" aria-labelledby="favorites-title">
        <div className="section-heading"><div><h2 id="favorites-title">찜한 공고와 일정</h2><p>정확한 모집 마감·행사 날짜와 직접 입력한 합격 발표일을 기준으로 알림을 만듭니다.</p></div>
          {personal.favorites.length > 0 && <button type="button" className="text-button" onClick={() => downloadCalendar(personal.favorites)}>캘린더로 내보내기(.ics)</button>}
        </div>
        {personal.favorites.length === 0 ? <p className="empty-personal">아직 찜한 공고가 없습니다.</p> : (
          <div className="saved-list">
            {personal.favorites.map(favorite => (
              <article className="saved-card" key={favorite.id}>
                <div className="saved-card-title">
                  <div><a href={favorite.item.source_url} target="_blank" rel="noopener noreferrer">{favorite.item.title}</a><span>{favorite.item.organizer}</span></div>
                  <button type="button" className="text-button muted" onClick={() => personal.toggle('favorites', favorite.id, favorite.item)}>찜 해제</button>
                </div>
                <label className="saved-toggle"><input type="checkbox" checked={favorite.remindersEnabled} onChange={event => personal.setRemindersEnabled(favorite.id, event.target.checked)} /> 일정 알림 켜기</label>
                <div className="schedule-fields">
                  <label>합격 발표일 <input type="date" value={favoriteDrafts[favorite.id]?.resultDate ?? favorite.resultDate} onFocus={event => focusedDetails.current.set(favorite.id + ':resultDate', event.currentTarget.value)} onChange={event => changeFavoriteDetail(favorite.id, 'resultDate', event.currentTarget.value)} onBlur={event => saveFavoriteDetail(favorite.id, 'resultDate', event.currentTarget.value, favorite.resultDate)} /></label>
                  <label>메모 <textarea maxLength={500} value={favoriteDrafts[favorite.id]?.note ?? favorite.note} onFocus={event => focusedDetails.current.set(favorite.id + ':note', event.currentTarget.value)} onChange={event => changeFavoriteDetail(favorite.id, 'note', event.currentTarget.value)} onBlur={event => saveFavoriteDetail(favorite.id, 'note', event.currentTarget.value, favorite.note)} placeholder="선택 입력" /></label>
                </div>
                <small>모집 마감: {favorite.item.date_kind === 'exact' ? (favorite.item.recruit_end || '일정 없음') : '정확한 날짜 없음'} · 행사: {[favorite.item.event_start, favorite.item.event_end].filter(Boolean).join(' ~ ') || '일정 없음'}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="personal-section" aria-labelledby="keywords-title">
        <div className="section-heading"><div><h2 id="keywords-title">맞춤 키워드</h2><p>제목·기관·요약·출처·분야·대상 태그 중 하나라도 일치하면 목록에 표시합니다.</p></div></div>
        <form className="keyword-form" onSubmit={event => void addKeyword(event)}>
          <label className="sr-only" htmlFor="personal-keyword">추가할 키워드</label>
          <input id="personal-keyword" value={keyword} onChange={event => setKeyword(event.target.value)} maxLength={60} placeholder="예: 게임, 미디어" />
          <button className="primary-button" type="submit" disabled={!keyword.trim()}>키워드 추가</button>
        </form>
        {personal.keywords.length === 0 ? <p className="empty-personal">등록된 키워드가 없습니다.</p> : <ul className="keyword-list">
          {personal.keywords.map(value => <li key={value.id}><span>{value.word}</span><button type="button" className="text-button muted" onClick={() => personal.removeKeyword(value.id)}>삭제</button></li>)}
        </ul>}
        <h3>맞춤 공고 {personal.personalizedItems.length}개</h3>
        {personal.personalizedItems.length === 0 ? <p className="empty-personal">현재 키워드와 일치하는 공고가 없습니다.</p> : <ul className="personal-match-list">
          {personal.personalizedItems.map(item => <li key={item.id}><a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.title}</a><span>{item.organizer} · {[...item.field_tags, ...item.audience_tags].join(', ')}</span></li>)}
        </ul>}
      </section>

      <section className="personal-section account-settings">
        <h2>계정</h2>
        <p>계정 삭제 시 Firestore에 저장된 이 계정의 찜·키워드·알림을 함께 지웁니다.</p>
        <button type="button" className="danger-button" onClick={() => void deleteAccount()}>계정과 데이터 삭제</button>
      </section>
    </main>
  )
}
