import type { ReactNode } from 'react'

export function Badge({ value }: { value: string }) {
  const tone = ['pass', 'allow', 'approved', 'saved'].includes(value)
    ? 'good'
    : ['fail', 'block', 'rejected', 'error'].includes(value)
        ? 'bad'
        : 'neutral'
  const labels: Record<string, string> = {
    fixture_only: 'Fixture · not graded',
    fake: 'Fixture',
    clarify: 'Clarify',
    allow: 'Allowed',
    block: 'Blocked',
  }
  return <span className={`admin-badge ${tone}`}>{labels[value] || value.replaceAll('_', ' ')}</span>
}
export function Timestamp({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="admin-empty">{children}</div>
}
export function RawData({ value, label = 'Raw record' }: { value: unknown, label?: string }) {
  return (
    <details className="admin-raw">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  )
}
export function Message({ error, isLoading }: { error: string, isLoading: boolean }) {
  if (error)
    return <p className="admin-error" role="alert">{error}</p>
  if (isLoading)
    return <p role="status" className="admin-loading">Loading records…</p>
  return null
}
