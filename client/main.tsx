import React, { useEffect, useState } from 'react'
import { api } from './api.ts'
import { Chat } from './chat.tsx'
import './style.css'

interface Community { facts: { phone: string, address: string, pricing: { independentLivingFrom: number, assistedLivingFrom: number, entranceFee: number, included: string[] }, amenities: string[], careTypes: string[] } }
export function App() {
  const [community, setCommunity] = useState<Community>()
  const [error, setError] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => {
    api<Community>('/community').then(setCommunity).catch(error => setError(error.message))
  }, [])
  const facts = community?.facts
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#">
          ACME
          <span>SENIOR LIVING</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#living">Our community</a>
          <a href="#details">Plan your visit</a>
          <a className="nav-contact" href="#details">
            Contact us
            <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      <main>
        {error && <p role="alert">{error}</p>}
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">A NEW CHAPTER, AT YOUR PACE</p>
            <h1>
              Room to live.
              <br />
              Support to thrive.
            </h1>
            <p>Explore Independent Living and Assisted Living at ACME. Find answers, ask about daily life, and plan a visit with Sophie.</p>
            <button className="primary" onClick={() => setIsOpen(true)}>
              Ask a question
              <span aria-hidden="true">↗</span>
            </button>
            <p className="caption">Your AI community assistant. Take your time. We are here to help.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun" />
            <div className="arch arch-one" />
            <div className="arch arch-two" />
            <div className="plant">✳</div>
            <span className="art-caption">Make space for what matters.</span>
          </div>
        </section>
        <section id="living" className="living">
          <p className="eyebrow">LIFE AT ACME</p>
          <h2>A little help. More possibilities.</h2>
          <div className="cards">
            <article>
              <span className="card-number">01 / LIVE</span>
              <h3>Choose your space</h3>
              <p>
                {facts?.careTypes.join(' and ')}
                . Couples can live together.
              </p>
            </article>
            <article>
              <span className="card-number">02 / CONNECT</span>
              <h3>Find your everyday</h3>
              <p>
                {facts?.amenities.slice(2, 5).join('. ')}
                .
              </p>
            </article>
            <article>
              <span className="card-number">03 / FEEL AT HOME</span>
              <h3>Know what is included</h3>
              <p>
                {facts?.pricing.included.join(', ')}
                .
              </p>
            </article>
          </div>
        </section>
        <section id="details" className="visit">
          <div>
            <p className="eyebrow">COME WITH QUESTIONS</p>
            <h2>Let’s talk about your next chapter.</h2>
            <p>Tour starts: Monday to Friday, 9 a.m. to 5 p.m. Eastern time.</p>
            <p>{facts?.address}</p>
            <a href={`tel:${facts?.phone}`}>{facts?.phone}</a>
          </div>
          <div className="pricing">
            <p>
              Independent Living from
              <strong>
                $
                {facts?.pricing.independentLivingFrom.toLocaleString()}
                /month
              </strong>
            </p>
            <p>
              Assisted Living from
              <strong>
                $
                {facts?.pricing.assistedLivingFrom.toLocaleString()}
                /month
              </strong>
            </p>
            <p>
              Entrance fee: $
              {facts?.pricing.entranceFee.toLocaleString()}
              . Ask our team about prices for specific rooms.
            </p>
          </div>
        </section>
      </main>
      <footer>ACME Senior Living · A demonstration community. Tour and contact requests are for demonstration only.</footer>
      <Chat isOpen={isOpen} onClose={() => setIsOpen(false)} />
      {!isOpen && <button className="chat-launcher" onClick={() => setIsOpen(true)}>✳ Ask Sophie</button>}
    </>
  )
}
