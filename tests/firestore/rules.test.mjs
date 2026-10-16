// Firestore 보안 규칙 검사. 실행 방법은 docs/DEPLOYMENT.md의 "보안 규칙 검사"를 참고하세요.
// Requires JDK 21+, firebase-tools, @firebase/rules-unit-testing and firebase (not project dependencies).
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'demo-questboard',
  firestore: { rules: readFileSync(process.env.RULES_PATH || new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
})

const results = []
async function check(name, promise) {
  try { await promise; results.push(['PASS', name]) } catch (error) { results.push(['FAIL', name, String(error).slice(0, 200)]) }
}

const alice = env.authenticatedContext('alice').firestore()
const bob = env.authenticatedContext('bob').firestore()
const anon = env.unauthenticatedContext().firestore()
const item = { id: 'abc', title: 'AI 게임 공모전', source_url: 'https://example.com', relevance: { score: 90 } }
const favorite = { item, remindersEnabled: true, resultDate: '', note: '', updatedAt: new Date().toISOString() }
const notification = {
  type: 'keyword', title: '새 맞춤 공고', message: 'AI 게임 공모전 · AI', opportunityId: 'abc',
  sourceUrl: 'https://example.com', date: '', read: false, createdAt: new Date().toISOString(),
}

// Writes the app makes (src/personal.tsx, src/account.tsx) must succeed.
await check('create favorite', assertSucceeds(setDoc(doc(alice, 'users/alice/favorites/f1'), favorite)))
await check('toggle reminders', assertSucceeds(updateDoc(doc(alice, 'users/alice/favorites/f1'), { remindersEnabled: false })))
await check('save result date and note', assertSucceeds(updateDoc(doc(alice, 'users/alice/favorites/f1'), { resultDate: '2026-11-01', note: '메모', updatedAt: new Date().toISOString() })))
await check('add keyword', assertSucceeds(addDoc(collection(alice, 'users/alice/keywords'), { word: '게임', createdAt: new Date().toISOString() })))
await check('create schedule notification', assertSucceeds(setDoc(doc(alice, 'users/alice/notifications/n1'), { ...notification, type: 'schedule', date: '2026-10-20' })))
await check('mark notification read', assertSucceeds(updateDoc(doc(alice, 'users/alice/notifications/n1'), { read: true })))
await check('delete notification', assertSucceeds(deleteDoc(doc(alice, 'users/alice/notifications/n1'))))
await check('delete favorite', assertSucceeds(deleteDoc(doc(alice, 'users/alice/favorites/f1'))))
await check('delete user document', assertSucceeds(deleteDoc(doc(alice, 'users/alice'))))

// Anything else must be denied.
await check('other user cannot read', assertFails(setDoc(doc(bob, 'users/alice/favorites/f2'), favorite)))
await check('anonymous cannot write', assertFails(setDoc(doc(anon, 'users/alice/favorites/f3'), favorite)))
await check('unknown favorite field', assertFails(setDoc(doc(alice, 'users/alice/favorites/f4'), { ...favorite, extra: 'x' })))
await check('note over 500 chars', assertFails(setDoc(doc(alice, 'users/alice/favorites/f5'), { ...favorite, note: 'x'.repeat(501) })))
await check('keyword over 60 chars', assertFails(addDoc(collection(alice, 'users/alice/keywords'), { word: 'x'.repeat(61), createdAt: '' })))
await check('empty keyword', assertFails(addDoc(collection(alice, 'users/alice/keywords'), { word: '', createdAt: '' })))
await check('keyword cannot be edited', assertFails(setDoc(doc(alice, 'users/alice/keywords/k1'), { word: 'a', createdAt: '' }).then(() => updateDoc(doc(alice, 'users/alice/keywords/k1'), { word: 'b' }))))
await check('unknown notification type', assertFails(setDoc(doc(alice, 'users/alice/notifications/n2'), { ...notification, type: 'spam' })))
await setDoc(doc(alice, 'users/alice/notifications/n3'), notification)
await check('notification text cannot be edited', assertFails(updateDoc(doc(alice, 'users/alice/notifications/n3'), { message: '변조' })))
await check('unknown collection', assertFails(setDoc(doc(alice, 'users/alice/other/x'), { a: 1 })))
await check('user document cannot be written', assertFails(setDoc(doc(alice, 'users/alice'), { a: 1 })))

await env.cleanup()
for (const row of results) console.log(row.join(' | '))
const failed = results.filter(row => row[0] === 'FAIL').length
console.log(`${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
