import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.ts'

export function useLoad<T>(path: string) {
  const [result, setResult] = useState<{ key: string, data?: T, error: string }>()
  const [version, setVersion] = useState(0)
  const key = `${path}:${version}`
  const reload = useCallback(() => setVersion(value => value + 1), [])
  useEffect(() => {
    let isActive = true
    api<T>(path).then((data) => {
      if (isActive)
        setResult({ key, data, error: '' })
    }).catch((error) => {
      if (isActive)
        setResult({ key, error: error.message })
    })
    return () => {
      isActive = false
    }
  }, [path, key])
  const hasResult = result?.key === key
  return {
    data: hasResult ? result.data : undefined,
    error: hasResult ? result.error : '',
    isLoading: !hasResult,
    reload,
  }
}
