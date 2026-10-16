import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
