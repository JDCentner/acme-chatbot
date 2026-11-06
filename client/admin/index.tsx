import type { RecordKind } from './records.tsx'
import { useState } from 'react'
import { RecordsView } from './records.tsx'
import { SettingsView } from './settings.tsx'
import './style.css'

const TABS = [
  'Settings',
  'Conversations',
  'Evaluations',
  'Requests',
] as const
export function Admin() {
  const [tab, setTab] = useState<typeof TABS[number]>('Settings')
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/admin.html">
          ACME
          <span>AGENT WORKSPACE</span>
        </a>
        <p className="admin-sidebar-label">MANAGE & REVIEW</p>
        <nav aria-label="Admin navigation">
          {TABS.map((item, index) => (
            <button
              key={item}
              aria-current={tab === item
                ? 'page'
                : undefined}
              onClick={() => setTab(item)}
            >
              <span aria-hidden="true">
                0
                {index + 1}
              </span>
              {item}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <a href="http://localhost:15500" target="_blank" rel="noreferrer">Promptfoo results ↗</a>
          <a href="/" target="_blank" rel="noreferrer">Public website ↗</a>
          <p>Local demo · No authentication</p>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <span>Operator workspace</span>
          <span>Requests use local mock tools</span>
        </header>
        <div className="admin-content">
          {tab === 'Settings'
            ? <SettingsView />
            : <RecordsView key={tab} kind={tab.toLowerCase() as RecordKind} />}
        </div>
      </main>
    </div>
  )
}
