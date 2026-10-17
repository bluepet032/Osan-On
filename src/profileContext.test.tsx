import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as firestore from 'firebase/firestore'
import { ProfileProvider, useProfile } from './profileContext'

const mocks = vi.hoisted(() => ({
  remote: null as Record<string, unknown> | null,
  setDoc: vi.fn(async () => undefined),
  receive: null as ((snapshot: unknown) => void) | null,
  failRead: false,
  subscriptions: 0,
  user: { uid: 'u1' } as { uid: string } | null,
  ready: true,
}))

const services = { db: {}, firestore }
vi.mock('./account', () => ({ useAccount: () => ({ user: mocks.user, firebase: services, ready: mocks.ready }) }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (_path: string, receive: (snapshot: unknown) => void, fail: (error: Error) => void) => {
    mocks.receive = receive
    mocks.subscriptions += 1
    if (mocks.failRead) fail(new Error('unavailable'))
    else receive({ exists: () => mocks.remote !== null, data: () => mocks.remote })
    return vi.fn()
  },
  setDoc: mocks.setDoc,
}))

function Probe() {
  const { profile, setProfile, saveState, retry, since } = useProfile()
  return <div>
    <output>{JSON.stringify(profile)}</output>
    <span data-testid="state">{saveState}</span>
    <span data-testid="since">{since}</span>
    <button onClick={() => setProfile({ gender: 'male', age: 40 })}>change</button>
    <button onClick={retry}>retry</button>
  </div>
}

describe('ProfileProvider', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    localStorage.clear()
    mocks.remote = null
    mocks.user = { uid: 'u1' }
    mocks.ready = true
    mocks.setDoc.mockReset()
    mocks.setDoc.mockResolvedValue(undefined)
    mocks.failRead = false
    mocks.subscriptions = 0
  })

  it('uploads the browser profile when the account has none', () => {
    localStorage.setItem('osanon.profile', JSON.stringify({ gender: 'female', age: 28 }))
    render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(mocks.setDoc).toHaveBeenCalledWith('users/u1/profile/main', expect.objectContaining({ gender: 'female', age: 28 }))
  })

  it('prefers the account profile and keeps a browser copy', () => {
    localStorage.setItem('osanon.profile', JSON.stringify({ gender: 'female', age: 28 }))
    mocks.remote = { gender: 'male', age: 33, updatedAt: '2026-10-16T00:00:00Z' }
    render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('{"gender":"male","age":33}')
    expect(JSON.parse(localStorage.getItem('osanon.profile')!)).toEqual({ gender: 'male', age: 33 })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('saves changes to the browser and, when signed in, to the account', () => {
    render(<ProfileProvider><Probe /></ProfileProvider>)
    act(() => screen.getByRole('button', { name: 'change' }).click())
    expect(JSON.parse(localStorage.getItem('osanon.profile')!)).toEqual({ gender: 'male', age: 40 })
    expect(mocks.setDoc).toHaveBeenLastCalledWith('users/u1/profile/main', expect.objectContaining({ gender: 'male', age: 40 }))
  })

  it('never uploads a profile another account left in this browser', () => {
    localStorage.setItem('osanon.profile', JSON.stringify({ gender: 'female', age: 28, income: 'JA0201' }))
    localStorage.setItem('osanon.profile.owner', 'someone-else')
    render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('{}')
    expect(localStorage.getItem('osanon.profile')).toBe('{}')
  })

  it('marks a downloaded profile as the account copy and clears it after sign-out', () => {
    mocks.remote = { gender: 'male', age: 33, updatedAt: '2026-10-16T00:00:00Z' }
    const { unmount } = render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(localStorage.getItem('osanon.profile.owner')).toBe('u1')
    unmount()

    mocks.user = null
    render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('{}')
    expect(localStorage.getItem('osanon.profile')).toBe('{}')
  })

  it('keeps the account copy while sign-in is still being restored', () => {
    localStorage.setItem('osanon.profile', JSON.stringify({ gender: 'male', age: 33 }))
    localStorage.setItem('osanon.profile.owner', 'u1')
    mocks.user = null
    mocks.ready = false
    render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('{"gender":"male","age":33}')
  })

  it('stays in the browser without an account', () => {
    mocks.user = null
    render(<ProfileProvider><Probe /></ProfileProvider>)
    act(() => screen.getByRole('button', { name: 'change' }).click())
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(screen.getByTestId('state')).toHaveTextContent('local')
  })

  it('says saved only once the account write succeeds', async () => {
    let finish = () => {}
    mocks.setDoc.mockImplementationOnce(() => new Promise<undefined>(resolve => { finish = () => resolve(undefined) }))
    render(<ProfileProvider><Probe /></ProfileProvider>)
    act(() => screen.getByRole('button', { name: 'change' }).click())
    expect(screen.getByTestId('state')).toHaveTextContent('syncing')
    await act(async () => finish())
    expect(screen.getByTestId('state')).toHaveTextContent('saved')
  })

  it('reports a failed account write and retries it with the same answers', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('permission-denied'))
    render(<ProfileProvider><Probe /></ProfileProvider>)
    await act(async () => screen.getByRole('button', { name: 'change' }).click())
    expect(screen.getByTestId('state')).toHaveTextContent('failed')
    await act(async () => screen.getByRole('button', { name: 'retry' }).click())
    expect(mocks.setDoc).toHaveBeenCalledTimes(2)
    expect(mocks.setDoc).toHaveBeenLastCalledWith('users/u1/profile/main', expect.objectContaining({ gender: 'male', age: 40 }))
    expect(screen.getByTestId('state')).toHaveTextContent('saved')
  })

  it('keeps unsaved answers when the account copy comes back after a failed write', async () => {
    mocks.remote = { gender: 'female', age: 28, updatedAt: '2026-10-16T00:00:00Z' }
    mocks.setDoc.mockRejectedValueOnce(new Error('permission-denied'))
    render(<ProfileProvider><Probe /></ProfileProvider>)
    await act(async () => screen.getByRole('button', { name: 'change' }).click())
    // Firestore rolls the rejected write back and sends the old account copy again.
    act(() => mocks.receive!({ exists: () => true, data: () => mocks.remote }))
    expect(screen.getByRole('status')).toHaveTextContent('{"gender":"male","age":40}')
    expect(screen.getByTestId('state')).toHaveTextContent('failed')
    await act(async () => screen.getByRole('button', { name: 'retry' }).click())
    expect(mocks.setDoc).toHaveBeenLastCalledWith('users/u1/profile/main', expect.objectContaining({ gender: 'male', age: 40 }))
  })

  it('starts new-benefit alerts from the first upload of browser answers', () => {
    localStorage.setItem('osanon.profile', JSON.stringify({ gender: 'female', age: 28 }))
    render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(screen.getByTestId('since').textContent).not.toBe('')
  })

  it('retries a failed write before a failed read, so new answers are not replaced', async () => {
    mocks.failRead = true
    mocks.remote = { gender: 'female', age: 28, updatedAt: '2026-10-16T00:00:00Z' }
    mocks.setDoc.mockRejectedValueOnce(new Error('unavailable'))
    render(<ProfileProvider><Probe /></ProfileProvider>)
    await act(async () => screen.getByRole('button', { name: 'change' }).click())
    mocks.failRead = false
    await act(async () => screen.getByRole('button', { name: 'retry' }).click())
    expect(mocks.setDoc).toHaveBeenLastCalledWith('users/u1/profile/main', expect.objectContaining({ gender: 'male', age: 40 }))
    expect(screen.getByRole('status')).toHaveTextContent('{"gender":"male","age":40}')
  })

  it('reports a failed account read and retries by reading again', async () => {
    mocks.failRead = true
    mocks.remote = { gender: 'male', age: 33, updatedAt: '2026-10-16T00:00:00Z' }
    render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(screen.getByTestId('state')).toHaveTextContent('failed')
    mocks.failRead = false
    await act(async () => screen.getByRole('button', { name: 'retry' }).click())
    expect(mocks.subscriptions).toBe(2)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(screen.getByTestId('state')).toHaveTextContent('saved')
    expect(screen.getByRole('status')).toHaveTextContent('{"gender":"male","age":33}')
  })
})
