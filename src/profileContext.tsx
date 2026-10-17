import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccount } from './account'
import { hasBasics, type Profile } from './eligibility'
import { loadProfile, loadProfileOwner, profileFromDocument, profileToDocument, saveProfile } from './profile'

/** Where the answers are kept: only this browser, being matched with the account, in the account, or not reaching it. */
export type SaveState = 'local' | 'syncing' | 'saved' | 'failed'

interface ProfileContextValue {
  profile: Profile
  setProfile: (profile: Profile) => void
  saveState: SaveState
  /** Retries what failed: a write resends the current answers, a read reads the account again. */
  retry: () => void
  /** When the account copy was last saved; new-benefit alerts start from here. Empty when signed out. */
  since: string
  error: string
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, firebase, ready } = useAccount()
  const [profile, setLocal] = useState<Profile>(loadProfile)
  const [error, setError] = useState('')
  const [since, setSince] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('local')
  // Bumped to read the account again after a failed read.
  const [attempt, setAttempt] = useState(0)
  const failedRead = useRef(false)
  // Answers the account has not confirmed yet: a snapshot (such as Firestore rolling back a rejected
  // write) must not overwrite them, and retry resends them.
  const unsaved = useRef<Profile | null>(null)
  // Only the latest write may report, so a slow earlier one cannot overwrite its result.
  const writes = useRef(0)
  const uid = user?.uid ?? ''

  const write = useCallback((next: Profile) => {
    if (!uid || !firebase) return
    const { db, firestore: fs } = firebase
    const data = profileToDocument(next)
    const id = ++writes.current
    unsaved.current = next
    setSaveState('syncing')
    fs.setDoc(fs.doc(db, 'users', uid, 'profile', 'main'), data).then(
      () => { if (id === writes.current) { unsaved.current = null; setSaveState('saved') } },
      () => { if (id === writes.current) { setSaveState('failed'); setError('맞춤 조건을 계정에 저장하지 못했습니다.') } },
    )
    return data
  }, [uid, firebase])

  useEffect(() => {
    if (!uid || !firebase) {
      setSince('')
      setSaveState('local')
      // Signed out (once sign-in has been restored): an account's answers must not stay for the next person.
      if (ready && loadProfileOwner()) { saveProfile({}); setLocal({}) }
      return
    }
    const { db, firestore: fs } = firebase
    const reference = fs.doc(db, 'users', uid, 'profile', 'main')
    let active = true
    unsaved.current = null
    setSaveState('syncing')
    const stop = fs.onSnapshot(reference, snapshot => {
      if (!active) return
      if (snapshot.exists()) {
        if (unsaved.current) return
        const data = snapshot.data()
        const remote = profileFromDocument(data)
        saveProfile(remote, uid)
        setLocal(remote)
        setSince(typeof data.updatedAt === 'string' ? data.updatedAt : '')
        setSaveState('saved')
        return
      }
      // First sign-in on this account: keep what was entered before logging in, but never
      // another account's answers left in this browser.
      if (loadProfileOwner() && loadProfileOwner() !== uid) { saveProfile({}); setLocal({}); setSaveState('saved'); return }
      const local = loadProfile()
      if (!hasBasics(local)) { setSaveState('saved'); return }
      saveProfile(local, uid)
      const data = write(local)
      if (data) setSince(data.updatedAt as string)
    }, () => {
      if (!active) return
      failedRead.current = true
      setSaveState('failed')
      setError('계정의 맞춤 조건을 불러오지 못했습니다.')
    })
    return () => { active = false; stop() }
  }, [uid, firebase, ready, attempt, write])

  const setProfile = useCallback((next: Profile) => {
    // The browser copy is written first, so a failed account write never loses the answers.
    saveProfile(next, uid && firebase ? uid : '')
    setLocal(next)
    setError('')
    const data = write(next)
    if (data) setSince(data.updatedAt as string)
  }, [uid, firebase, write])

  const retry = useCallback(() => {
    setError('')
    // Unsaved answers go first: reading the account again would replace them with its older copy.
    if (unsaved.current) write(unsaved.current)
    else if (failedRead.current) {
      failedRead.current = false
      setAttempt(value => value + 1)
    }
  }, [write])

  return <ProfileContext.Provider value={{ profile, setProfile, saveState, retry, since, error }}>{children}</ProfileContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('ProfileProvider가 필요합니다.')
  return value
}
