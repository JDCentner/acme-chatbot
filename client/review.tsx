import { createRoot } from 'react-dom/client'
import { Inspector } from './inspector.tsx'
import './style.css'

createRoot(document.getElementById('root')!).render(
  <main className="review-page">
    <header className="review-header">
      <p className="eyebrow">ACME · INTERNAL REVIEW</p>
      <h1>Conversation evidence</h1>
      <p>This local review page is separate from the prospect website. It has no authentication.</p>
    </header>
    <Inspector />
  </main>,
)
