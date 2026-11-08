import { useEffect, useState } from 'react'
import {
  searchGlobally,
  type GlobalSearchModule,
  type GlobalSearchResult,
} from '../services/global-search'

interface GlobalSearchProps {
  onNavigate: (module: GlobalSearchModule, query: string) => void
}

export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const normalizedQuery = query.trim()

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setResults([])
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      searchGlobally(normalizedQuery)
        .then((items) => {
          if (cancelled) return
          setResults(items)
          setError('')
        })
        .catch((cause: unknown) => {
          if (cancelled) return
          setResults([])
          setError(
            cause instanceof Error
              ? cause.message
              : 'No se pudo completar la búsqueda.',
          )
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [normalizedQuery])

  function chooseResult(module: GlobalSearchModule) {
    onNavigate(module, normalizedQuery)
    setQuery('')
    setResults([])
    setError('')
    setOpen(false)
  }

  return (
    <div className="global-search">
      <label className="global-search-label">
        <span className="visually-hidden">Búsqueda global</span>
        <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
          <circle cx="8.8" cy="8.8" r="5.8" />
          <path d="m13.2 13.2 4 4" />
        </svg>
        <input
          aria-autocomplete="list"
          aria-controls="global-search-results"
          aria-expanded={open && normalizedQuery.length >= 2}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
          placeholder="Buscar en todo…"
          maxLength={120}
          role="combobox"
          value={query}
        />
        {query && (
          <button
            aria-label="Limpiar búsqueda"
            className="global-search-clear"
            onClick={() => {
              setQuery('')
              setOpen(false)
            }}
            type="button"
          >
            ×
          </button>
        )}
      </label>
      {open && normalizedQuery.length >= 2 && (
        <div className="global-search-results" id="global-search-results" role="listbox">
          {loading ? (
            <div className="global-search-message" role="status">Buscando…</div>
          ) : error ? (
            <div className="global-search-message global-search-error" role="alert">{error}</div>
          ) : results.length === 0 ? (
            <div className="global-search-message" role="status">No se encontraron resultados.</div>
          ) : (
            results.map((result) => (
              <button
                className="global-search-result"
                key={`${result.module}-${result.id}`}
                onClick={() => chooseResult(result.module)}
                role="option"
                type="button"
              >
                <span className="global-search-result-copy">
                  <strong>{result.label}</strong>
                  <span>{result.detail}</span>
                </span>
                <span className="global-search-entity">{result.entity}</span>
              </button>
            ))
          )}
        </div>
      )}
      {open && normalizedQuery.length === 1 && (
        <div className="global-search-results">
          <div className="global-search-message">Escribe al menos 2 caracteres.</div>
        </div>
      )}
    </div>
  )
}
