import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as firestore from 'firebase/firestore'
import { ProfileProvider, useProfile } from './profileContext'

const mocks = vi.hoisted(() => ({
  remote: null as Record<string, unknown> | null,
  setDoc: vi.fn(async () => undefined),
  receive: null as ((snapshot: unknown) => void) | null,
  user: { uid: 'u1' } as { uid: string } | null,
}))

const services = { db: {}, firestore }
vi.mock('./account', () => ({ useAccount: () => ({ user: mocks.user, firebase: services }) }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (_path: string, receive: (snapshot: unknown) => void) => {
    mocks.receive = receive
    receive({ exists: () => mocks.remote !== null, data: () => mocks.remote })
    return vi.fn()
  },
  setDoc: mocks.setDoc,
}))

function Probe() {
  const { profile, setProfile, synced } = useProfile()
  return <div>
    <output>{JSON.stringify(profile)}</output>
    <span>{synced ? 'synced' : 'local'}</span>
    <button onClick={() => setProfile({ gender: 'male', age: 40 })}>change</button>
  </div>
}

describe('ProfileProvider', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    localStorage.clear()
    mocks.remote = null
    mocks.user = { uid: 'u1' }
    mocks.setDoc.mockClear()
  })

  it('uploads the browser profile when the account has none', () => {
    localStorage.setItem('osanon.profile', JSON.stringify({ gender: 'female', age: 28 }))
    render(<ProfileProvider><Probe /></ProfileProvider>)
    expect(mocks.setDoc).toHaveBeenCalledWith('users/u1/profile/main', expect.objectContaining({ gender: 'female', age: 28 }))
    expect(screen.getByText('synced')).toBeInTheDocument()
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

  it('stays in the browser without an account', () => {
    mocks.user = null
    render(<ProfileProvider><Probe /></ProfileProvider>)
    act(() => screen.getByRole('button', { name: 'change' }).click())
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(screen.getByText('local')).toBeInTheDocument()
  })
})
