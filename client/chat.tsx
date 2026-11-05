import React, {useEffect, useRef, useState} from 'react';
import {api} from './api.ts';
interface Message {role: 'user' | 'assistant'; text: string;}
interface Reply {reply: string; pendingId?: string;}
interface ChatProps {isOpen: boolean; onClose: () => void;}
export function Chat({isOpen, onClose}: ChatProps) {
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [variant, setVariant] = useState('single');
  const [pendingId, setPendingId] = useState<string>();
  const retry = useRef<{message: string; requestId: string} | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [messages, isBusy]);
  useEffect(() => { if (isOpen) input.current?.focus(); }, [isOpen]);
  async function send(message: string) {
    if (!message.trim() || isBusy) return;
    setIsBusy(true); setError('');
    try {
      let id = conversationId;
      if (!id) {
        const created = await api<{id: string; greeting: string}>('/conversations', {});
        id = created.id; setConversationId(id);
        setMessages([{role: 'assistant', text: created.greeting}]);
      }
      const submission = retry.current?.message === message ? retry.current : {message, requestId: crypto.randomUUID()};
      if (!retry.current) setMessages(previous => [...previous, {role: 'user', text: message}]);
      retry.current = submission;
      const reply = await api<Reply>(`/conversations/${id}/messages?variant=${variant}`, submission);
      setMessages(previous => [...previous, {role: 'assistant', text: reply.reply}]);
      setPendingId(reply.pendingId); setText(''); retry.current = undefined;
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not send. Please retry.'); }
    finally { setIsBusy(false); input.current?.focus(); }
  }
  if (!isOpen) return null;
  return <section className="chat" role="dialog" aria-modal="false" aria-label="Chat with Sophie" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <header className="chat-header"><div className="avatar" aria-hidden="true">S</div><div><h2>Sophie</h2><span>AI community assistant</span></div><button aria-label="Close chat" onClick={onClose}>×</button></header>
    <div className="chat-controls"><label>Agent design <select value={variant} disabled={Boolean(conversationId)} onChange={event => setVariant(event.target.value)}><option value="single">One agent + checks</option><option value="specialists">Sophie + specialists</option><option value="baseline">Original prompt</option></select></label><button className="quiet" disabled={isBusy} onClick={() => {setConversationId(''); setMessages([]); setPendingId(undefined); retry.current = undefined; setError('');}}>New chat</button></div>
    <div className="chat-log" ref={log} role="log" aria-live="polite" aria-relevant="additions text">
      {!messages.length && <div className="welcome"><p className="eyebrow">START HERE</p><h3>What would you like to know?</h3><p>Sophie is an AI assistant. Chats are stored locally for review. Demo requests do not contact staff or send material.</p><button className="suggestion" onClick={() => send('How much does the community cost?')}>What does it cost?</button><button className="suggestion" onClick={() => send('I would like a tour.')}>Plan a tour</button></div>}
      {messages.map((message, index) => <div key={index} className={`bubble ${message.role}`}><span className="speaker">{message.role === 'user' ? 'YOU' : 'SOPHIE'}</span><p>{message.text}</p></div>)}
      {isBusy && <p className="checking" role="status">Sophie is preparing and checking a reply…</p>}
    </div>
    {pendingId && <button className="confirm" disabled={isBusy} onClick={() => send(`Confirm request ${pendingId}`)}>Confirm this demo request</button>}
    {error && <div role="alert" className="chat-error">{error}<button onClick={() => retry.current && send(retry.current.message)}>Retry message</button></div>}
    <form onSubmit={event => {event.preventDefault(); void send(text);}}><label className="sr-only" htmlFor="message">Your message</label><textarea id="message" ref={input} value={text} maxLength={4000} disabled={isBusy} placeholder="Ask your question…" onChange={event => setText(event.target.value)} onKeyDown={event => {if (event.key === 'Enter' && !event.shiftKey) {event.preventDefault(); void send(text);}}}/><button className="send" disabled={isBusy || !text.trim()} aria-label="Send message">↑</button></form><p className="chat-note">Local demo · AI replies can contain errors · {text.length}/4,000</p>
  </section>;
}
