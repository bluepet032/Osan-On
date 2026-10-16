import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(config).every(Boolean)

export interface FirebaseServices {
  auth: Auth
  db: Firestore
  authApi: typeof import('firebase/auth')
  firestore: typeof import('firebase/firestore')
}

let loading: Promise<FirebaseServices | null> | null = null

// Firebase is about two thirds of the site's JavaScript, so it loads after the first render
// instead of delaying the list for every visitor.
export function loadFirebase(): Promise<FirebaseServices | null> {
  if (!firebaseConfigured) return Promise.resolve(null)
  loading ??= Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')])
    .then(([appApi, authApi, firestore]) => {
      const app = appApi.getApps()[0] || appApi.initializeApp(config)
      return { auth: authApi.getAuth(app), db: firestore.getFirestore(app), authApi, firestore }
    })
    .catch(error => {
      loading = null // let the next call retry, e.g. after a dropped connection
      throw error
    })
  return loading
}
