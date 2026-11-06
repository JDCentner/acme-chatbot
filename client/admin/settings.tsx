import type { Settings, Variant } from './types.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import { Badge, Message } from './common.tsx'
import { DESIGNS } from './designs.ts'
import { useLoad } from './use-load.ts'

export function SettingsView() {
  const { data, error, isLoading, reload } = useLoad<Settings>('/admin/settings')
  const [selected, setSelected] = useState<Variant>()
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saveError, setSaveError] = useState('')
  const chosen = selected || data?.variant || 'single'
  async function save() {
    setIsSaving(true)
    setFeedback('')
    setSaveError('')
    try {
      await api('/admin/settings', { variant: chosen })
      reload()
      setFeedback('Design saved. New chats will use this design. Existing chats keep their current design.')
    }
    catch (error) {
      setSaveError(error instanceof Error
        ? error.message
        : 'Could not save the design. Try again.')
    }
    finally {
      setIsSaving(false)
    }
  }
  return (
    <section>
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">CONFIGURATION</p>
          <h1>Choose how Sophie works.</h1>
          <p>Compare three designs with the same community facts and local mock tools.</p>
        </div>
        <a className="admin-secondary" href="/" target="_blank" rel="noreferrer">Open public site ↗</a>
      </div>
      <Message error={error} isLoading={isLoading} />
      {error && <button className="admin-secondary" onClick={reload}>Try again</button>}
      {data && (
        <>
          <div className="admin-current">
            <span>
              Active design
              <strong>{DESIGNS[data.variant].name}</strong>
            </span>
            <Badge value={data.mode} />
          </div>
          <fieldset className="design-options" disabled={isSaving || isLoading}>
            <legend className="sr-only">Agent design</legend>
            {Object.entries(DESIGNS).map(([id, design]) => (
              <label
                className={`design-option ${chosen === id
                  ? 'selected'
                  : ''}`}
                key={id}
              >
                <span className="design-radio">
                  <input
                    type="radio"
                    name="design"
                    value={id}
                    checked={chosen === id}
                    onChange={() => {
                      setSelected(id as Variant)
                      setFeedback('')
                    }}
                  />
                  <strong>{design.name}</strong>
                  {data.variant === id && <span className="design-active">Active</span>}
                </span>
                <span>{design.description}</span>
              </label>
            ))}
          </fieldset>
          <div className="admin-save">
            <button className="admin-primary" disabled={isSaving || isLoading || chosen === data.variant} onClick={save}>{isSaving ? 'Saving…' : 'Use this design'}</button>
            <span>Saved in SQLite. No Docker restart is needed.</span>
          </div>
          {feedback && <p className="admin-success" role="status">{feedback}</p>}
          {saveError && <p role="alert" className="admin-error">{saveError}</p>}
          <section className="admin-card">
            <div className="admin-card-heading">
              <h2>Model configuration</h2>
              <span>Set in the runner environment</span>
            </div>
            <p>The three choices above are agent designs. They use the model settings below.</p>
            <div className="model-grid">
              {Object.entries(data.models).map(([role, model]) => (
                <div key={role}>
                  <span>
                    {role === 'agent'
                      ? 'Sophie and specialists'
                      : role}
                  </span>
                  <strong>{model}</strong>
                  <small>
                    {data.reasoning?.[role as keyof typeof data.models] || 'Default'}
                    {' '}
                    reasoning
                  </small>
                </div>
              ))}
            </div>
          </section>
          <section className="admin-card admin-links">
            <div>
              <h2>Review and test</h2>
              <p>Inspect the records here, or use Promptfoo for side-by-side comparisons.</p>
            </div>
            <a href="http://localhost:15500" target="_blank" rel="noreferrer" className="admin-secondary">Open Promptfoo ↗</a>
          </section>
          <p className="admin-footnote">Evaluation cases choose their own design. Changing this setting affects new public chats only.</p>
        </>
      )}
    </section>
  )
}
