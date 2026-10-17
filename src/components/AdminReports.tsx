import { useEffect, useState } from 'react'
import { useAccount } from '../account'
import { REPORT_REASONS, reportFromDocument, type ErrorReport } from '../reports'

// Newest first; handled reports are deleted, so this stays short.
const SHOWN = 100

export function AdminReports() {
  const { firebase } = useAccount()
  const [reports, setReports] = useState<ErrorReport[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!firebase) return
    const { db, firestore: fs } = firebase
    let active = true
    fs.getDocs(fs.query(fs.collection(db, 'reports'), fs.orderBy('createdAt', 'desc'), fs.limit(SHOWN)))
      .then(snapshot => {
        if (!active) return
        setReports(snapshot.docs.map(record => reportFromDocument(record.id, record.data())).filter((value): value is ErrorReport => value !== null))
        setLoaded(true)
      })
      .catch(() => { if (active) { setError('신고를 불러오지 못했습니다. Firestore 규칙의 관리자 UID를 확인하세요.'); setLoaded(true) } })
    return () => { active = false }
  }, [firebase])

  const resolve = async (id: string) => {
    if (!firebase) return
    const { db, firestore: fs } = firebase
    try {
      await fs.deleteDoc(fs.doc(db, 'reports', id))
      setReports(current => current.filter(report => report.id !== id))
    } catch {
      setError('신고를 처리 완료로 바꾸지 못했습니다.')
    }
  }

  return (
    <section className="admin-reports" aria-labelledby="admin-reports-title">
      <h2 id="admin-reports-title">정보 오류 신고 {loaded && !error && <span>{reports.length}건</span>}</h2>
      {error && <p className="message-inline error" role="alert">{error}</p>}
      {!loaded ? <p role="status">신고를 불러오는 중입니다…</p> : reports.length === 0 && !error ? <p className="empty-personal">새 신고가 없습니다.</p> : (
        <ul className="report-list">
          {reports.map(report => (
            <li key={report.id}>
              <div>
                <a href={`#/notice/${report.opportunityId}`}>{report.title}</a>
                <span>{REPORT_REASONS[report.reason]} · {report.createdAt ? new Date(report.createdAt).toLocaleString('ko-KR') : ''}</span>
                {report.note && <p>{report.note}</p>}
              </div>
              <div className="report-actions">
                {report.sourceUrl && <a href={report.sourceUrl} target="_blank" rel="noopener noreferrer">원문</a>}
                <button type="button" className="text-button" onClick={() => void resolve(report.id)}>처리 완료</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
