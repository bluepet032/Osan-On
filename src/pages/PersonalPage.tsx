import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAccount } from '../account'
import { favoritesCalendar } from '../calendar'
import { clearDataCache } from '../data'
import { usePersonalState, type SavedOpportunity } from '../personal'
import type { Opportunity } from '../types'

function downloadCalendar(favorites: SavedOpportunity[]) {
  const url = URL.createObjectURL(new Blob([favoritesCalendar(favorites)], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'osanon-favorites.ics'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked on the next tick so the browser has started the download first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const deadlineText = (item: Opportunity) =>
  item.date_kind === 'exact' ? (item.recruit_end || '일정 없음') : item.date_kind === 'ongoing' ? '상시 신청' : '정확한 날짜 없음'

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
    const saved: SavedOpportunity[] = personal.localFavoriteItems.map(item => ({ id: item.id, item, remindersEnabled: true, resultDate: '', note: '' }))
    // Favorites whose notice left the public list (closed and removed) cannot be shown; a failed load says nothing about that.
    const missing = personal.loading || personal.error ? 0 : personal.localFavoriteCount - saved.length
    return (
      <main id="main-content" className="container personal-page">
        <div className="page-heading"><div><p className="eyebrow">찜·알림·키워드</p><h1>내 혜택함</h1><p>로그인 없이 찜한 혜택은 이 브라우저에 저장됩니다.</p></div></div>
        <section className="personal-section" aria-labelledby="favorites-title">
          <div className="section-heading"><div><h2 id="favorites-title">찜한 혜택</h2><p>이 브라우저에 저장되어 있어 다른 기기에서는 보이지 않고, 브라우저 데이터를 지우면 함께 사라집니다.</p></div>
            {saved.length > 0 && <button type="button" className="text-button" onClick={() => downloadCalendar(saved)}>캘린더로 내보내기(.ics)</button>}
          </div>
          {personal.loading ? <p role="status">찜한 혜택을 불러오는 중입니다…</p>
            : personal.error && saved.length === 0 ? <p className="message-inline error" role="alert">찜한 혜택을 불러오지 못했습니다. 찜은 이 브라우저에 그대로 있습니다. <button type="button" className="text-button" onClick={clearDataCache}>다시 시도</button></p>
            : saved.length === 0 ? <p className="empty-personal">아직 찜한 혜택이 없습니다.</p> : (
            <div className="saved-list">
              {saved.map(favorite => (
                <article className="saved-card" key={favorite.id}>
                  <div className="saved-card-title">
                    <div><a href={favorite.item.source_url} target="_blank" rel="noopener noreferrer">{favorite.item.title}</a><span>{favorite.item.organizer}</span></div>
                    <button type="button" className="text-button muted" onClick={() => personal.toggle('favorites', favorite.id, favorite.item)}>찜 해제</button>
                  </div>
                  <small>신청 마감: {deadlineText(favorite.item)}</small>
                </article>
              ))}
            </div>
          )}
          {missing > 0 && <p className="empty-personal">공개 목록에서 내려간 찜 {missing}개는 표시하지 않습니다.</p>}
        </section>
        <section className="personal-section sign-in-prompt">
          <h2>로그인하면 더 할 수 있어요</h2>
          <p>Google 계정에 저장하면 다른 기기에서도 찜을 보고, 신청 일정 알림, 선정 발표일·메모, 맞춤 키워드와 새 혜택 알림을 쓸 수 있습니다. 로그인하면 이 브라우저의 찜을 계정에 합칠 수 있습니다.</p>
          <button type="button" className="primary-button" onClick={account.openLogin}>로그인 또는 가입</button>
        </section>
      </main>
    )
  }

  const unread = personal.notifications.filter(notification => !notification.read).length

  return (
    <main id="main-content" className="container personal-page">
      <div className="page-heading">
        <div><p className="eyebrow">찜·알림·키워드</p><h1>내 혜택함</h1><p>{account.user.displayName || account.user.email} 계정에 동기화됩니다.</p></div>
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
        <div className="section-heading"><div><h2 id="notifications-title">알림함</h2><p>사이트에 접속하면 찜한 혜택의 일정, 맞춤 조건을 저장한 뒤 새로 올라온 '가능성 높음' 혜택(최근 20건), 키워드에 맞는 새 혜택을 확인합니다.</p></div>
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
                  {notification.opportunityId && <a href={`#/notice/${notification.opportunityId}`}>혜택 보기</a>}
                  {notification.sourceUrl && <a href={notification.sourceUrl} target="_blank" rel="noopener noreferrer">원문 보기</a>}
                  {!notification.read && <button type="button" className="text-button" onClick={() => personal.markNotificationRead(notification.id)}>읽음</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="personal-section" aria-labelledby="favorites-title">
        <div className="section-heading"><div><h2 id="favorites-title">찜한 혜택과 일정</h2><p>정확한 신청 마감일과 직접 입력한 선정 발표일을 기준으로 알림을 만듭니다.</p></div>
          {personal.favorites.length > 0 && <button type="button" className="text-button" onClick={() => downloadCalendar(personal.favorites)}>캘린더로 내보내기(.ics)</button>}
        </div>
        {personal.favorites.length === 0 ? <p className="empty-personal">아직 찜한 혜택이 없습니다.</p> : (
          <div className="saved-list">
            {personal.favorites.map(favorite => (
              <article className="saved-card" key={favorite.id}>
                <div className="saved-card-title">
                  <div><a href={favorite.item.source_url} target="_blank" rel="noopener noreferrer">{favorite.item.title}</a><span>{favorite.item.organizer}</span></div>
                  <button type="button" className="text-button muted" onClick={() => personal.toggle('favorites', favorite.id, favorite.item)}>찜 해제</button>
                </div>
                <label className="saved-toggle"><input type="checkbox" checked={favorite.remindersEnabled} onChange={event => personal.setRemindersEnabled(favorite.id, event.target.checked)} /> 일정 알림 켜기</label>
                <div className="schedule-fields">
                  <label>선정 발표일 <input type="date" value={favoriteDrafts[favorite.id]?.resultDate ?? favorite.resultDate} onFocus={event => focusedDetails.current.set(favorite.id + ':resultDate', event.currentTarget.value)} onChange={event => changeFavoriteDetail(favorite.id, 'resultDate', event.currentTarget.value)} onBlur={event => saveFavoriteDetail(favorite.id, 'resultDate', event.currentTarget.value, favorite.resultDate)} /></label>
                  <label>메모 <textarea maxLength={500} value={favoriteDrafts[favorite.id]?.note ?? favorite.note} onFocus={event => focusedDetails.current.set(favorite.id + ':note', event.currentTarget.value)} onChange={event => changeFavoriteDetail(favorite.id, 'note', event.currentTarget.value)} onBlur={event => saveFavoriteDetail(favorite.id, 'note', event.currentTarget.value, favorite.note)} placeholder="선택 입력" /></label>
                </div>
                <small>신청 마감: {deadlineText(favorite.item)}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="personal-section" aria-labelledby="keywords-title">
        <div className="section-heading"><div><h2 id="keywords-title">맞춤 키워드</h2><p>혜택명·기관·요약·분야 중 하나라도 일치하면 목록에 표시하고, 새로 올라오면 알려 드립니다.</p></div></div>
        <form className="keyword-form" onSubmit={event => void addKeyword(event)}>
          <label className="sr-only" htmlFor="personal-keyword">추가할 키워드</label>
          <input id="personal-keyword" value={keyword} onChange={event => setKeyword(event.target.value)} maxLength={60} placeholder="예: 월세, 출산, 장학금" />
          <button className="primary-button" type="submit" disabled={!keyword.trim()}>키워드 추가</button>
        </form>
        {personal.keywords.length === 0 ? <p className="empty-personal">등록된 키워드가 없습니다.</p> : <ul className="keyword-list">
          {personal.keywords.map(value => <li key={value.id}><span>{value.word}</span><button type="button" className="text-button muted" onClick={() => personal.removeKeyword(value.id)}>삭제</button></li>)}
        </ul>}
        <h3>키워드 혜택 {personal.personalizedItems.length}개</h3>
        {personal.personalizedItems.length === 0 ? <p className="empty-personal">현재 키워드와 일치하는 혜택이 없습니다.</p> : <ul className="personal-match-list">
          {personal.personalizedItems.map(item => <li key={item.id}><a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.title}</a><span>{item.organizer} · {[...item.field_tags, ...item.audience_tags].join(', ')}</span></li>)}
        </ul>}
      </section>

      <section className="personal-section account-settings">
        <h2>계정</h2>
        <p>계정 삭제 시 Firestore에 저장된 이 계정의 맞춤 조건·찜·키워드·알림과 보낸 정보 오류 신고를 함께 지웁니다.</p>
        <button type="button" className="danger-button" onClick={() => void deleteAccount()}>계정과 데이터 삭제</button>
      </section>
    </main>
  )
}
