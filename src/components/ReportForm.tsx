import { useState, type FormEvent } from 'react'
import { useAccount } from '../account'
import { REPORT_REASONS, reportDocument, type ReportReason } from '../reports'
import type { Opportunity } from '../types'

export function ReportForm({ item }: { item: Opportunity }) {
  const { user, firebase, openLogin } = useAccount()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  // Reports need an account so they cannot be sent in bulk anonymously.
  const start = () => { if (user) setOpen(true); else openLogin() }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!user || !firebase || !reason) return
    const { db, firestore: fs } = firebase
    setState('sending')
    try {
      await fs.addDoc(fs.collection(db, 'reports'), reportDocument(item, reason, note, user.uid, fs.serverTimestamp()))
      setState('sent')
    } catch {
      setState('failed')
    }
  }

  if (state === 'sent') return <p className="message-inline" role="status">신고가 접수되었습니다. 운영자가 원문과 대조해 고치겠습니다.</p>
  if (!open) return (
    <p className="report-start">
      <button type="button" className="text-button" onClick={start}>정보 오류 신고</button>
      {!user && <small> 신고하려면 로그인이 필요합니다.</small>}
    </p>
  )
  return (
    <form className="report-form" aria-label="정보 오류 신고" onSubmit={event => void send(event)}>
      <fieldset>
        <legend>무엇이 다른가요?</legend>
        {(Object.entries(REPORT_REASONS) as [ReportReason, string][]).map(([value, label]) => (
          <label key={value}><input type="radio" name={`report-${item.id}`} checked={reason === value} onChange={() => setReason(value)} />{label}</label>
        ))}
      </fieldset>
      <label className="report-note">자세한 내용 (선택)<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="예: 원문에는 11월 30일 마감으로 나와 있어요" /></label>
      {state === 'failed' && <p className="message-inline error" role="alert">신고를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
      <div className="report-actions">
        <button type="submit" className="primary-button" disabled={!reason || state === 'sending'}>신고 보내기</button>
        <button type="button" className="text-button muted" onClick={() => setOpen(false)}>취소</button>
      </div>
    </form>
  )
}
