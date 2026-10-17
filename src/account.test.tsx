import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountProvider, useAccount } from './account'

const mocks = vi.hoisted(() => ({ services: null as unknown }))
vi.mock('./firebase', () => ({ firebaseConfigured: true, loadFirebase: () => Promise.resolve(mocks.services) }))

afterEach(() => cleanup())

function Probe() {
  const account = useAccount()
  return <p data-testid="account">{JSON.stringify({ ready: account.ready, uid: account.user?.uid ?? null, loaded: Boolean(account.firebase) })}</p>
}

const state = () => JSON.parse(screen.getByTestId('account').textContent || '{}')

it('renders before Firebase loads, then reports the signed-in user', async () => {
  const stop = vi.fn()
  mocks.services = {
    auth: {}, db: {}, firestore: {},
    authApi: { onAuthStateChanged: (_auth: unknown, next: (user: unknown) => void) => { next({ uid: 'user-1' }); return stop } },
  }
  const view = render(<AccountProvider><Probe /></AccountProvider>)
  expect(state()).toEqual({ ready: false, uid: null, loaded: false })

  await waitFor(() => expect(state()).toEqual({ ready: true, uid: 'user-1', loaded: true }))
  view.unmount()
  expect(stop).toHaveBeenCalled()
})

it('is ready without a user when Firebase is not available', async () => {
  mocks.services = null
  render(<AccountProvider><Probe /></AccountProvider>)
  await waitFor(() => expect(state()).toEqual({ ready: true, uid: null, loaded: false }))
})

it('deleting the account also removes the reports the user sent', async () => {
  const removed: string[] = []
  const queries: unknown[] = []
  const deleteUser = vi.fn()
  const docs = (path: string) => path === 'reports' ? [{ ref: 'reports/r1' }] : path.endsWith('favorites') ? [{ ref: path + '/f1' }] : []
  mocks.services = {
    auth: {}, db: {},
    firestore: {
      collection: (_db: unknown, ...path: string[]) => path.join('/'),
      doc: (_db: unknown, ...path: string[]) => path.join('/'),
      where: (...args: unknown[]) => args,
      query: (path: string, ...constraints: unknown[]) => { queries.push([path, ...constraints]); return path },
      getDocs: async (path: string) => ({ docs: docs(path) }),
      writeBatch: () => ({ delete: (ref: string) => removed.push(ref), commit: async () => {} }),
      deleteDoc: async (ref: string) => { removed.push(ref) },
    },
    authApi: {
      onAuthStateChanged: (_auth: unknown, next: (user: unknown) => void) => { next({ uid: 'user-1' }); return () => {} },
      GoogleAuthProvider: class {},
      reauthenticateWithPopup: async () => {},
      deleteUser,
    },
  }
  let remove: () => Promise<void> = async () => {}
  function Remover() { remove = useAccount().deleteAccount; return null }
  render(<AccountProvider><Probe /><Remover /></AccountProvider>)
  await waitFor(() => expect(state().loaded).toBe(true))
  await act(async () => { await remove() })
  expect(queries).toContainEqual(['reports', ['uid', '==', 'user-1']])
  expect(removed).toContain('reports/r1')
  expect(removed).toContain('users/user-1/favorites/f1')
  expect(deleteUser).toHaveBeenCalled()
})
