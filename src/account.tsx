import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { firebaseConfigured, loadFirebase, type FirebaseServices } from './firebase'

interface AccountContextValue {
  user: User | null
  /** Loaded Firebase services, or null until loaded or when Firebase is not configured. */
  firebase: FirebaseServices | null
  ready: boolean
  configured: boolean
  loginOpen: boolean
  openLogin: () => void
  closeLogin: () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const AccountContext = createContext<AccountContextValue | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [firebase, setFirebase] = useState<FirebaseServices | null>(null)
  const [ready, setReady] = useState(!firebaseConfigured)
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    let active = true
    let stop: (() => void) | undefined
    loadFirebase().then(services => {
      if (!active) return
      if (!services) { setReady(true); return }
      setFirebase(services)
      stop = services.authApi.onAuthStateChanged(services.auth, next => {
        setUser(next)
        setReady(true)
        if (next) setLoginOpen(false)
      }, () => setReady(true))
    }, () => { if (active) setReady(true) })
    return () => { active = false; stop?.() }
  }, [])

  const openLogin = () => setLoginOpen(true)
  const closeLogin = () => setLoginOpen(false)

  const signInWithGoogle = async () => {
    // Loaded here too, so signing in works even if the background load has not finished.
    const services = await loadFirebase()
    if (!services) throw new Error('Firebase 설정이 아직 완료되지 않았습니다.')
    await services.authApi.signInWithPopup(services.auth, new services.authApi.GoogleAuthProvider())
  }

  const signOut = async () => {
    if (!firebase) return
    await firebase.authApi.signOut(firebase.auth)
  }

  const deleteAccount = async () => {
    if (!firebase || !user) throw new Error('로그인이 필요합니다.')
    const { authApi, db, firestore } = firebase
    await authApi.reauthenticateWithPopup(user, new authApi.GoogleAuthProvider())
    for (const name of ['favorites', 'keywords', 'notifications']) {
      const snapshot = await firestore.getDocs(firestore.collection(db, 'users', user.uid, name))
      for (let start = 0; start < snapshot.docs.length; start += 450) {
        const batch = firestore.writeBatch(db)
        for (const record of snapshot.docs.slice(start, start + 450)) batch.delete(record.ref)
        await batch.commit()
      }
    }
    await firestore.deleteDoc(firestore.doc(db, 'users', user.uid))
    await authApi.deleteUser(user)
  }

  const value: AccountContextValue = { user, firebase, ready, configured: firebaseConfigured, loginOpen, openLogin, closeLogin, signInWithGoogle, signOut, deleteAccount }

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccount() {
  const value = useContext(AccountContext)
  if (!value) throw new Error('AccountProvider가 필요합니다.')
  return value
}
