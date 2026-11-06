export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, body === undefined
    ? undefined
    : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
  const payload = await response.json()
  if (!response.ok)
    throw new Error(payload.error || 'The request failed.')
  return payload
}
