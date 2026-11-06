import React, { useEffect, useRef, useState } from 'react'
import { api } from './api.ts'

interface Message { id: string, role: 'user' | 'assistant', text: string }
interface Reply { reply: string, pendingId?: string }
interface ChatProps { isOpen: boolean, onClose: () => void }
export function Chat({ isOpen, onClose }: ChatProps) {
  const [conversationId, setConversationId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [pendingId, setPendingId] = useState<string>()
  const retryRef = useRef<{ message: string, requestId: string } | undefined>(undefined)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (isOpen) {
      returnFocusRef.current = document.activeElement as HTMLElement
      return
    }
    returnFocusRef.current?.focus()
  }, [isOpen])
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [messages, isBusy])
  useEffect(() => {
    if (isOpen && !isBusy)
      inputRef.current?.focus()
  }, [isOpen, isBusy])
  async function send(message: string) {
    if (!message.trim() || isBusy)
      return
    setIsBusy(true)
    setError('')
    try {
      let id = conversationId
      if (!id) {
        const created = await api<{ id: string, greeting: string }>('/conversations', {})
        id = created.id
        setConversationId(id)
        setMessages(created.greeting
          ? [
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                text: created.greeting,
              },
            ]
          : [])
      }
      const submission = retryRef.current?.message === message
        ? retryRef.current
        : {
            message,
            requestId: crypto.randomUUID(),
          }
      if (retryRef.current?.message !== message) {
        setMessages(previous => [
          ...previous,
          {
            id: crypto.randomUUID(),
            role: 'user',
            text: message,
          },
        ])
      }
      retryRef.current = submission
      const reply = await api<Reply>(`/conversations/${id}/messages`, submission)
      setMessages(previous => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: reply.reply,
        },
      ])
      setPendingId(reply.pendingId)
      setText('')
      retryRef.current = undefined
    }
    catch (error) {
      setError(error instanceof Error
        ? error.message
        : 'Could not send. Please try again.')
    }
    finally {
      setIsBusy(false)
      inputRef.current?.focus()
    }
  }
  if (!isOpen)
    return null
  return (
    <section
      className="chat"
      role="dialog"
      aria-modal="false"
      aria-label="Chat with Sophie"
      onKeyDown={(event) => {
        if (event.key === 'Escape')
          onClose()
      }}
    >
      <header className="chat-header">
        <div className="avatar" aria-hidden="true">S</div>
        <div>
          <h2>Sophie</h2>
          <span>AI community assistant</span>
        </div>
        <button aria-label="Close chat" onClick={onClose}>×</button>
      </header>
      <div className="chat-tools">
        <button
          className="quiet"
          disabled={isBusy}
          onClick={() => {
            setConversationId('')
            setMessages([])
            setPendingId(undefined)
            retryRef.current = undefined
            setError('')
          }}
        >
          New chat
        </button>
      </div>
      <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions text">
        {!messages.length && (
          <div className="welcome">
            <p className="eyebrow">START HERE</p>
            <h3>What would you like to know?</h3>
            <p>Sophie is an AI assistant. Chats are stored for quality review. Demo requests do not contact staff or send material.</p>
            <button className="suggestion" onClick={() => send('How much does the community cost?')}>What does it cost?</button>
            <button className="suggestion" onClick={() => send('I would like a tour.')}>Plan a tour</button>
          </div>
        )}
        {messages.map(message => (
          <div key={message.id} className={`bubble ${message.role}`}>
            <span className="speaker">
              {message.role === 'user'
                ? 'YOU'
                : 'SOPHIE'}
            </span>
            <p>{message.text}</p>
          </div>
        ))}
        {isBusy && <p className="checking" role="status">Sophie is replying…</p>}
      </div>
      {pendingId && <button className="confirm" disabled={isBusy} onClick={() => send(`Confirm request ${pendingId}`)}>Confirm this demo request</button>}
      {error && (
        <div role="alert" className="chat-error">
          {error}
          <button onClick={() => retryRef.current && send(retryRef.current.message)}>Retry message</button>
        </div>
      )}
      <form onSubmit={(event) => {
        event.preventDefault()
        void send(text)
      }}
      >
        <label className="sr-only" htmlFor="message">Your message</label>
        <textarea
          id="message"
          ref={inputRef}
          value={text}
          maxLength={4000}
          disabled={isBusy}
          placeholder="Ask your question…"
          onChange={event => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send(text)
            }
          }}
        />
        <button className="send" disabled={isBusy || !text.trim()} aria-label="Send message">↑</button>
      </form>
      <p className="chat-note">
        AI replies can contain errors ·
        {text.length}
        /4,000
      </p>
    </section>
  )
}
