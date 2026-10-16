import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAccount } from './account'
import { hasBasics, type Profile } from './eligibility'
import { loadProfile, profileFromDocument, profileToDocument, saveProfile } from './profile'

interface ProfileContextValue {
  profile: Profile
  setProfile: (profile: Profile) => void
  /** True while signed in: the profile is also kept in the account. */
  synced: boolean
  /** When the account copy was last saved; new-benefit alerts start from here. Empty when signed out. */
  since: string
  error: string
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, firebase } = useAccount()
  const [profile, setLocal] = useState<Profile>(loadProfile)
  const [error, setError] = useState('')
  const [since, setSince] = useState('')
  const uid = user?.uid ?? ''

  useEffect(() => {
    if (!uid || !firebase) { setSince(''); return }
    const { db, firestore: fs } = firebase
    const reference = fs.doc(db, 'users', uid, 'profile', 'main')
    let active = true
    const stop = fs.onSnapshot(reference, snapshot => {
      if (!active) return
      if (snapshot.exists()) {
        const data = snapshot.data()
        const remote = profileFromDocument(data)
        saveProfile(remote)
        setLocal(remote)
        setSince(typeof data.updatedAt === 'string' ? data.updatedAt : '')
        return
      }
      // First sign-in on this account: keep what was entered before logging in.
      const local = loadProfile()
      if (hasBasics(local)) fs.setDoc(reference, profileToDocument(local)).catch(() => setError('맞춤 조건을 계정에 저장하지 못했습니다.'))
    }, () => { if (active) setError('계정의 맞춤 조건을 불러오지 못했습니다.') })
    return () => { active = false; stop() }
  }, [uid, firebase])

  const setProfile = useCallback((next: Profile) => {
    // The browser copy is written first, so a failed account write never loses the answers.
    saveProfile(next)
    setLocal(next)
    setError('')
    if (!uid || !firebase) return
    const { db, firestore: fs } = firebase
    const data = profileToDocument(next)
    setSince(data.updatedAt as string)
    fs.setDoc(fs.doc(db, 'users', uid, 'profile', 'main'), data).catch(() => setError('맞춤 조건을 계정에 저장하지 못했습니다.'))
  }, [uid, firebase])

  return <ProfileContext.Provider value={{ profile, setProfile, synced: Boolean(uid && firebase), since, error }}>{children}</ProfileContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('ProfileProvider가 필요합니다.')
  return value
}
