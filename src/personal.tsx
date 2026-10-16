import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DocumentData } from 'firebase/firestore'
import { useAccount } from './account'
import { loadOpportunities } from './data'
import { dueReminders, isNewKeywordMatch, kstDate, matchesPersonalKeyword } from './personalLogic'
import type { Opportunity, PersonalState } from './types'
import { readStorage, writeStorage } from './utils'

export interface SavedOpportunity {
  id: string
  item: Opportunity
  remindersEnabled: boolean
  resultDate: string
  note: string
}

export interface PersonalKeyword {
  id: string
  word: string
  createdAt: string
}

export interface PersonalNotification {
  id: string
  type: 'schedule' | 'keyword'
  title: string
  message: string
  opportunityId: string
  sourceUrl: string
  date: string
  read: boolean
  createdAt: string
}

interface PersonalContextValue {
  state: PersonalState
  favorites: SavedOpportunity[]
  keywords: PersonalKeyword[]
  notifications: PersonalNotification[]
  personalizedItems: Opportunity[]
  loading: boolean
  migrationOpen: boolean
  migrationMessage: string
  localFavoriteItems: Opportunity[]
  localFavoriteCount: number
  error: string
  toggle: (bucket: 'favorites' | 'read' | 'hidden', id: string, item?: Opportunity) => void
  restoreHidden: () => void
  openSignIn: () => void
  closeMigration: (skip: boolean) => void
  importLocalFavorites: () => Promise<void>
  setRemindersEnabled: (id: string, enabled: boolean) => void
  saveFavoriteDetails: (id: string, details: { resultDate?: string; note?: string }) => void
  addKeyword: (word: string) => Promise<void>
  removeKeyword: (id: string) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
}

const KEY = 'questboard.personal.v1'
const EMPTY: PersonalState = { version: 1, favorites: [], read: [], hidden: [] }
const PersonalContext = createContext<PersonalContextValue | null>(null)

function loadLocalState(): PersonalState {
  try {
    const parsed = JSON.parse(readStorage(KEY) || '') as Partial<PersonalState>
    if (parsed.version !== 1) return EMPTY
    return {
      version: 1,
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter(id => typeof id === 'string') : [],
      read: Array.isArray(parsed.read) ? parsed.read.filter(id => typeof id === 'string') : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter(id => typeof id === 'string') : [],
    }
  } catch {
    return EMPTY
  }
}

function documentId(value: string) {
  return encodeURIComponent(value)
}

function favoriteFromDocument(id: string, data: DocumentData): SavedOpportunity | null {
  const item = data.item as Opportunity | undefined
  if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || !Array.isArray(item.field_tags) || !Array.isArray(item.audience_tags)) return null
  return {
    id,
    item,
    remindersEnabled: data.remindersEnabled !== false,
    resultDate: typeof data.resultDate === 'string' ? data.resultDate : '',
    note: typeof data.note === 'string' ? data.note : '',
  }
}

function keywordFromDocument(id: string, data: DocumentData): PersonalKeyword | null {
  if (typeof data.word !== 'string' || typeof data.createdAt !== 'string') return null
  return { id, word: data.word, createdAt: data.createdAt }
}

function notificationFromDocument(id: string, data: DocumentData): PersonalNotification | null {
  if ((data.type !== 'schedule' && data.type !== 'keyword') || typeof data.title !== 'string' || typeof data.message !== 'string') return null
  return {
    id,
    type: data.type,
    title: data.title,
    message: data.message,
    opportunityId: typeof data.opportunityId === 'string' ? data.opportunityId : '',
    sourceUrl: typeof data.sourceUrl === 'string' && data.sourceUrl.startsWith('https://') ? data.sourceUrl : '',
    date: typeof data.date === 'string' ? data.date : '',
    read: data.read === true,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
  }
}

function noticeId(value: string) {
  return encodeURIComponent(value)
}

export function PersonalProvider({ children }: { children: ReactNode }) {
  const { user, ready: accountReady, openLogin, firebase } = useAccount()
  const userId = user?.uid || ''
  const [local, setLocal] = useState<PersonalState>(loadLocalState)
  const [favorites, setFavorites] = useState<SavedOpportunity[]>([])
  const [dataUserId, setDataUserId] = useState('')
  const [keywords, setKeywords] = useState<PersonalKeyword[]>([])
  const [notifications, setNotifications] = useState<PersonalNotification[]>([])
  const [publishedItems, setPublishedItems] = useState<Opportunity[]>([])
  const [storeReady, setStoreReady] = useState(false)
  const [publishedReady, setPublishedReady] = useState(false)
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [migrationMessage, setMigrationMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    writeStorage(KEY, JSON.stringify(local))
  }, [local])

  useEffect(() => {
    if (!userId || !firebase) {
      setFavorites([])
      setKeywords([])
      setNotifications([])
      setDataUserId('')
      setStoreReady(false)
      setMigrationOpen(false)
      return
    }

    setStoreReady(false)
    setFavorites([])
    setKeywords([])
    setNotifications([])
    setDataUserId(userId)
    setError('')
    const { db, firestore: fs } = firebase
    let active = true
    const loaded = new Set<string>()
    const markLoaded = (name: string) => {
      loaded.add(name)
      if (loaded.size === 3) setStoreReady(true)
    }
    const onError = (name: string) => (reason: Error) => {
      if (!active) return
      setError(reason.message || '계정 데이터를 불러오지 못했습니다.')
      markLoaded(name)
    }
    const stopFavorites = fs.onSnapshot(fs.collection(db, 'users', userId, 'favorites'), snapshot => {
      if (!active) return
      setFavorites(snapshot.docs.map(record => favoriteFromDocument(record.id, record.data())).filter((value): value is SavedOpportunity => value !== null))
      markLoaded('favorites')
    }, onError('favorites'))
    const stopKeywords = fs.onSnapshot(fs.collection(db, 'users', userId, 'keywords'), snapshot => {
      if (!active) return
      setKeywords(snapshot.docs.map(record => keywordFromDocument(record.id, record.data())).filter((value): value is PersonalKeyword => value !== null))
      markLoaded('keywords')
    }, onError('keywords'))
    const stopNotifications = fs.onSnapshot(fs.collection(db, 'users', userId, 'notifications'), snapshot => {
      if (!active) return
      setNotifications(snapshot.docs.map(record => notificationFromDocument(record.id, record.data())).filter((value): value is PersonalNotification => value !== null))
      markLoaded('notifications')
    }, onError('notifications'))
    return () => {
      active = false
      stopFavorites()
      stopKeywords()
      stopNotifications()
    }
  }, [userId, firebase])

  const currentUserData = userId !== '' && dataUserId === userId
  const currentFavorites = useMemo(() => {
    if (!currentUserData) return []
    const latestItems = new Map(publishedItems.map(item => [item.id, item]))
    const latestByUrl = new Map<string, Opportunity>()
    for (const item of publishedItems) {
      latestByUrl.set(item.source_url, item)
      for (const source of item.sources) latestByUrl.set(source.source_url, item)
    }
    return favorites.map(saved => {
      let latest = latestItems.get(saved.item.id) || latestByUrl.get(saved.item.source_url)
      if (!latest) {
        for (const source of saved.item.sources ?? []) {
          latest = latestByUrl.get(source.source_url)
          if (latest) break
        }
      }
      if (latest) return { ...saved, item: latest }
      return saved
    })
  }, [currentUserData, favorites, publishedItems])
  const currentKeywords = useMemo(() => currentUserData ? keywords : [], [currentUserData, keywords])
  const currentNotifications = useMemo(() => currentUserData ? notifications : [], [currentUserData, notifications])

  useEffect(() => {
    if (!userId || dataUserId !== userId || !storeReady) {
      setPublishedItems([])
      setPublishedReady(false)
      return
    }
    let active = true
    let request = 0
    const load = () => {
      const currentRequest = ++request
      setPublishedReady(false)
      Promise.all([
        loadOpportunities('active'),
        loadOpportunities('undated'),
        loadOpportunities('closed'),
      ]).then(payloads => {
        if (!active || currentRequest !== request) return
        const unique = new Map<string, Opportunity>()
        for (const payload of payloads) for (const item of payload.items) unique.set(item.id, item)
        setPublishedItems([...unique.values()])
        setPublishedReady(true)
      }).catch(reason => {
        if (active && currentRequest === request) {
          setError(reason instanceof Error ? reason.message : '맞춤 공고를 불러오지 못했습니다.')
          setPublishedReady(true)
        }
      })
    }
    load()
    window.addEventListener('questboard-data-refresh', load)
    return () => {
      active = false
      window.removeEventListener('questboard-data-refresh', load)
    }
  }, [userId, dataUserId, storeReady])

  useEffect(() => {
    if (!userId || dataUserId !== userId || !storeReady || !publishedReady || local.favorites.length === 0) return
    const key = 'questboard.favorite-import.v1.' + userId
    const decision = readStorage(key)
    if (decision !== 'done' && decision !== 'skipped') setMigrationOpen(true)
  }, [userId, dataUserId, storeReady, publishedReady, local.favorites.length])

  useEffect(() => {
    if (!userId || dataUserId !== userId || !firebase || !storeReady || !publishedReady) return
    let active = true
    const { db: firestore, firestore: fs } = firebase
    const today = kstDate()
    const candidates = new Map<string, Omit<PersonalNotification, 'id'>>()
    const scheduleIds = new Set<string>()

    for (const saved of currentFavorites) {
      if (!saved.remindersEnabled) continue
      const reminders = dueReminders(saved.item, today, saved.resultDate)
      for (const reminder of reminders) {
        const id = noticeId('schedule:' + saved.id + ':' + reminder.milestone + ':' + reminder.date + ':' + reminder.daysBefore)
        scheduleIds.add(id)
        const label = reminder.daysBefore === 0 ? '당일' : 'D-' + reminder.daysBefore
        candidates.set(id, {
          type: 'schedule',
          title: label + ' 일정 알림 · ' + reminder.milestone,
          message: saved.item.title + '의 ' + reminder.milestone + ' 일정이 ' + label + '입니다.',
          opportunityId: saved.id,
          sourceUrl: saved.item.source_url,
          date: reminder.date,
          read: false,
          createdAt: new Date().toISOString(),
        })
      }
    }

    for (const item of publishedItems) {
      const matchedWords = currentKeywords
        .filter(keyword => isNewKeywordMatch(item, keyword.word, keyword.createdAt))
        .map(keyword => keyword.word)
      if (matchedWords.length === 0) continue
      const id = noticeId('keyword:' + item.id)
      candidates.set(id, {
        type: 'keyword',
        title: '새 맞춤 공고',
        message: item.title + ' · ' + matchedWords.join(', '),
        opportunityId: item.id,
        sourceUrl: item.source_url,
        date: '',
        read: false,
        createdAt: new Date().toISOString(),
      })
    }

    // Every write re-runs this effect, so re-reading known alerts would cost one Firestore read each time.
    const existingIds = new Set(currentNotifications.map(notification => notification.id))
    const publishedIds = new Set(publishedItems.map(item => item.id))
    const saveMissing = async () => {
      for (const [id, value] of candidates) {
        if (!active) return
        if (existingIds.has(id)) continue
        const reference = fs.doc(firestore, 'users', userId, 'notifications', id)
        await fs.runTransaction(firestore, async transaction => {
          const existing = await transaction.get(reference)
          if (!existing.exists()) transaction.set(reference, value)
        })
      }
      for (const notification of currentNotifications) {
        if (!active) continue
        const outdated = notification.type === 'schedule'
          ? !notification.date || notification.date < today || !scheduleIds.has(notification.id)
          // Keyword alerts end with their notice; the size check skips this when public data failed to load.
          : publishedIds.size > 0 && !publishedIds.has(notification.opportunityId)
        if (outdated) await fs.deleteDoc(fs.doc(firestore, 'users', userId, 'notifications', notification.id))
      }
    }
    void saveMissing().catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : '알림을 갱신하지 못했습니다.')
    })
    return () => { active = false }
  }, [userId, dataUserId, firebase, storeReady, publishedReady, currentFavorites, currentKeywords, currentNotifications, publishedItems])

  const state = useMemo(() => ({
    ...local,
    favorites: userId ? currentFavorites.map(value => value.item.id) : local.favorites,
  }), [local, userId, currentFavorites])

  const toggle = useCallback((bucket: 'favorites' | 'read' | 'hidden', id: string, item?: Opportunity) => {
    if (bucket !== 'favorites') {
      setLocal(current => {
        const values = new Set(current[bucket])
        if (bucket === 'hidden' && values.has(id)) values.delete(id)
        else values.add(id)
        return { ...current, [bucket]: [...values] }
      })
      return
    }
    if (!userId || !firebase) {
      openLogin()
      return
    }
    const { db, firestore: fs } = firebase
    const existing = currentFavorites.find(value => value.id === id || value.item.id === id)
    if (existing) {
      void fs.deleteDoc(fs.doc(db, 'users', userId, 'favorites', existing.id)).catch(reason => setError(reason.message || '찜을 해제하지 못했습니다.'))
      return
    }
    if (!item) return
    const reference = fs.doc(db, 'users', userId, 'favorites', documentId(id))
    const value = { item, remindersEnabled: true, resultDate: '', note: '', updatedAt: new Date().toISOString() }
    void fs.runTransaction(db, async transaction => {
      const saved = await transaction.get(reference)
      if (!saved.exists()) transaction.set(reference, value)
    }).catch(reason => setError(reason.message || '찜을 저장하지 못했습니다.'))
  }, [userId, firebase, currentFavorites, openLogin])

  const restoreHidden = useCallback(() => setLocal(current => ({ ...current, hidden: [] })), [])

  const importLocalFavorites = useCallback(async () => {
    if (!userId || !firebase) return
    const { db, firestore: fs } = firebase
    const firestore = db
    setError('')
    try {
      let items = publishedItems
      if (!publishedReady) {
        const payloads = await Promise.all([loadOpportunities('active'), loadOpportunities('undated'), loadOpportunities('closed')])
        const unique = new Map<string, Opportunity>()
        for (const payload of payloads) for (const item of payload.items) unique.set(item.id, item)
        items = [...unique.values()]
        setPublishedItems(items)
        setPublishedReady(true)
      }
      const byId = new Map(items.map(item => [item.id, item]))
      const imported = new Set<string>()
      for (const id of local.favorites) {
        const item = byId.get(id)
        if (!item) continue
        const reference = fs.doc(db, 'users', userId, 'favorites', documentId(id))
        await fs.runTransaction(firestore, async transaction => {
          const saved = await transaction.get(reference)
          if (!saved.exists()) transaction.set(reference, {
            item,
            remindersEnabled: true,
            resultDate: '',
            note: '',
            updatedAt: new Date().toISOString(),
          })
        })
        imported.add(id)
      }
      setLocal(current => ({ ...current, favorites: current.favorites.filter(id => !imported.has(id)) }))
      writeStorage('questboard.favorite-import.v1.' + userId, 'done')
      setMigrationOpen(false)
      setMigrationMessage('현재 공개 목록에서 확인되는 기존 찜을 계정 찜에 합쳤습니다. 확인되지 않는 항목의 브라우저 찜은 그대로 보존했습니다.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '기존 찜을 가져오지 못했습니다.')
    }
  }, [userId, firebase, publishedItems, publishedReady, local.favorites])

  const closeMigration = (skip: boolean) => {
    if (skip && userId) writeStorage('questboard.favorite-import.v1.' + userId, 'skipped')
    setMigrationOpen(false)
  }

  const setRemindersEnabled = (id: string, enabled: boolean) => {
    if (!userId || !firebase) return
    const { db, firestore: fs } = firebase
    void fs.updateDoc(fs.doc(db, 'users', userId, 'favorites', documentId(id)), { remindersEnabled: enabled })
      .catch(reason => setError(reason.message || '알림 설정을 저장하지 못했습니다.'))
  }

  const saveFavoriteDetails = (id: string, details: { resultDate?: string; note?: string }) => {
    if (!userId || !firebase) return
    const { db, firestore: fs } = firebase
    if (details.resultDate && !/^\d{4}-\d{2}-\d{2}$/.test(details.resultDate)) {
      setError('합격 발표일은 날짜를 선택해 입력해 주세요.')
      return
    }
    if (details.note && details.note.length > 500) {
      setError('메모는 500자 이내로 입력해 주세요.')
      return
    }
    void fs.updateDoc(fs.doc(db, 'users', userId, 'favorites', documentId(id)), {
      ...details,
      updatedAt: new Date().toISOString(),
    }).catch(reason => setError(reason.message || '일정 메모를 저장하지 못했습니다.'))
  }

  const addKeyword = async (value: string) => {
    if (!userId || !firebase) return
    const { db, firestore: fs } = firebase
    const word = value.trim()
    if (!word || word.length > 60) {
      setError('키워드는 1~60자로 입력해 주세요.')
      return
    }
    if (keywords.some(keyword => keyword.word.toLocaleLowerCase('ko-KR') === word.toLocaleLowerCase('ko-KR'))) return
    try {
      await fs.addDoc(fs.collection(db, 'users', userId, 'keywords'), { word, createdAt: new Date().toISOString() })
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '키워드를 저장하지 못했습니다.')
    }
  }

  const removeKeyword = (id: string) => {
    if (!userId || !firebase) return
    const { db, firestore: fs } = firebase
    void fs.deleteDoc(fs.doc(db, 'users', userId, 'keywords', id)).catch(reason => setError(reason.message || '키워드를 삭제하지 못했습니다.'))
  }

  const markNotificationRead = (id: string) => {
    if (!userId || !firebase) return
    const { db, firestore: fs } = firebase
    void fs.updateDoc(fs.doc(db, 'users', userId, 'notifications', id), { read: true })
      .catch(reason => setError(reason.message || '알림을 확인 처리하지 못했습니다.'))
  }

  const markAllNotificationsRead = () => {
    for (const notification of currentNotifications) if (!notification.read) markNotificationRead(notification.id)
  }

  const personalizedItems = useMemo(() => publishedItems.filter(item =>
    currentKeywords.some(keyword => matchesPersonalKeyword(item, keyword.word)),
  ), [publishedItems, currentKeywords])

  const localFavoriteItems = publishedItems.filter(item => local.favorites.includes(item.id))
  const value: PersonalContextValue = {
    state,
    favorites: currentFavorites,
    keywords: currentKeywords,
    notifications: currentNotifications,
    personalizedItems,
    loading: !accountReady || (!!userId && (dataUserId !== userId || !storeReady || !publishedReady)),
    migrationOpen,
    migrationMessage,
    localFavoriteItems,
    localFavoriteCount: local.favorites.length,
    error,
    toggle,
    restoreHidden,
    openSignIn: openLogin,
    closeMigration,
    importLocalFavorites,
    setRemindersEnabled,
    saveFavoriteDetails,
    addKeyword,
    removeKeyword,
    markNotificationRead,
    markAllNotificationsRead,
  }

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePersonalState() {
  const value = useContext(PersonalContext)
  if (!value) throw new Error('PersonalProvider가 필요합니다.')
  return value
}
