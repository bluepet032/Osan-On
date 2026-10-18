import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react'
import { IconArrowUp, IconInfoCircle, IconList, IconRefresh, IconX } from '@tabler/icons-react'
import { ASSISTANT_STARTERS, askAssistant, type AssistantContext, type AssistantReply } from '../assistant'
import { JURISDICTION_LABELS } from '../constants'
import { dDayLabel } from '../utils'
import { BrandMark } from './BrandMark'

interface Message { id: number; role: 'user' | 'bot'; text: string; reply?: AssistantReply }

interface Props extends AssistantContext {
  open: boolean
  onClose: () => void
  /** Shows every match for a search reply in the benefit list. */
  onShowAll: (query: string) => void
  /** Pause before an answer, so it reads as a reply rather than an instant lookup. */
  thinkingMs?: number
  /** False while the benefits are still loading; a question then waits for them. */
  ready?: boolean
}

const WAIT_FOR_DATA_MS = 15000

export interface AssistantHandle { open: () => void; close: () => void }

/**
 * Owns whether the chat is open, so opening and closing re-renders only the chat and not the
 * page that holds it (the benefit page re-filters 1,300 benefits on every render).
 */
export function AssistantHost({ ref, ...props }: Omit<Props, 'open' | 'onClose'> & { ref?: Ref<AssistantHandle> }) {
  const [open, setOpen] = useState(false)
  useImperativeHandle(ref, () => ({ open: () => setOpen(true), close: () => setOpen(false) }), [])
  return <AssistantChat {...props} open={open} onClose={() => setOpen(false)} />
}

export function AssistantChat({ open, onClose, items, profile, verdictOf, onShowAll, thinkingMs = 700, ready = true }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLDivElement>(null)
  // Bumped by 새 대화, so an answer still being prepared for the old conversation is dropped.
  const round = useRef(0)
  const nextId = useRef(0)
  // An answer is worked out after the pause, from the benefits as they are then, not as they were when asked.
  const latest = useRef({ items, profile, verdictOf, ready })
  useEffect(() => { latest.current = { items, profile, verdictOf, ready } })

  useEffect(() => {
    if (!open) return
    // Focus goes back to whatever opened the chat once it closes.
    const opener = document.activeElement as HTMLElement | null
    field.current?.focus()
    return () => opener?.focus?.()
  }, [open])

  useEffect(() => {
    body.current?.scrollTo?.({ top: body.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  if (!open) return null

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || thinking) return
    const current = round.current
    setMessages(list => [...list, { id: nextId.current++, role: 'user', text }])
    setInput('')
    setMenuOpen(false)
    setThinking(true)
    await new Promise(resolve => setTimeout(resolve, thinkingMs))
    for (let waited = 0; !latest.current.ready && waited < WAIT_FOR_DATA_MS && round.current === current; waited += 100) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (round.current !== current) return
    const reply = latest.current.ready
      ? await askAssistant(text, latest.current)
      : { text: '혜택 정보를 아직 불러오지 못했어요. 잠시 후 다시 물어봐 주세요.', items: [], total: 0 }
    setMessages(list => [...list, { id: nextId.current++, role: 'bot', text: reply.text, reply }])
    setThinking(false)
  }

  const restart = () => {
    round.current += 1
    setMessages([])
    setThinking(false)
    setInput('')
    field.current?.focus()
  }

  const submit = (event: FormEvent) => { event.preventDefault(); void ask(input) }

  // Keeps Tab inside the chat while it is open, and Escape closes it.
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { onClose(); return }
    if (event.key !== 'Tab' || !panel.current) return
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]')]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  const chips = (
    <div className="assistant-chips">
      {ASSISTANT_STARTERS.map(starter => <button type="button" key={starter} onClick={() => void ask(starter)}>{starter}</button>)}
    </div>
  )

  return (
    <div className="assistant-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={panel} className="assistant" role="dialog" aria-modal="true" aria-label="오산온 AI" onKeyDown={keyDown}>
        <header className="assistant-head">
          <button type="button" className="assistant-icon" aria-label="새 대화" title="새 대화" onClick={restart}><IconRefresh size={20} aria-hidden="true" /></button>
          <strong>오산온 AI <span className="assistant-beta">베타</span></strong>
          <button type="button" className="assistant-icon" aria-label="닫기" onClick={onClose}><IconX size={20} aria-hidden="true" /></button>
        </header>

        <div ref={body} className="assistant-body" aria-live="polite">
          {messages.length === 0 && (
            <div className="assistant-welcome">
              <BrandMark />
              <h2>무엇을 도와드릴까요?</h2>
              <p>궁금한 점을 물어보면 받을 수 있는 혜택을 빠르게 찾아 드려요.</p>
              {chips}
              <p className="assistant-hint"><IconInfoCircle size={16} aria-hidden="true" /> 이렇게 써 보세요: “오산시 청년 월세 지원 알려줘”</p>
            </div>
          )}
          {messages.map(message => message.role === 'user'
            ? <p key={message.id} className="assistant-bubble user">{message.text}</p>
            : (
              <div key={message.id} className="assistant-answer">
                <BrandMark />
                <div>
                  <p className="assistant-bubble bot">{message.text}</p>
                  {message.reply && message.reply.items.length > 0 && (
                    <ul className="assistant-cards">
                      {message.reply.items.map(item => (
                        <li key={item.id}>
                          <a href={`#/notice/${item.id}`}>
                            <strong>{item.title}</strong>
                            <span>{item.jurisdiction ? JURISDICTION_LABELS[item.jurisdiction] : ''} · {item.organizer} · {dDayLabel(item)}{verdictOf(item) === 'eligible' && <em> · 가능성 높음</em>}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {message.reply?.query && (
                    <button type="button" className="assistant-more" onClick={() => onShowAll(message.reply!.query!)}>목록에서 더 찾아보기</button>
                  )}
                </div>
              </div>
            ))}
          {thinking && (
            <div className="assistant-answer">
              <BrandMark />
              <p className="assistant-bubble bot assistant-typing" role="status" aria-label="답변을 준비하는 중"><span /><span /><span /></p>
            </div>
          )}
        </div>

        <footer className="assistant-foot">
          {menuOpen && messages.length > 0 && chips}
          <form className="assistant-form" onSubmit={submit}>
            <button type="button" className="assistant-icon" aria-label="추천 질문 보기" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><IconList size={20} aria-hidden="true" /></button>
            <input ref={field} aria-label="질문 입력" value={input} maxLength={200} placeholder="궁금한 점을 입력해 주세요" onChange={event => setInput(event.target.value)} />
            <button type="submit" className="assistant-send" aria-label="보내기" disabled={!input.trim() || thinking}><IconArrowUp size={18} aria-hidden="true" /></button>
          </form>
          <p className="assistant-note">공개된 혜택 정보로 답하는 베타 서비스예요. 최종 자격은 원문에서 확인하세요.</p>
        </footer>
      </section>
    </div>
  )
}
