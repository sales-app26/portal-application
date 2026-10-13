import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { FieldShell, inputBox } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Spinner'
import { fetchPlace, shortPlace } from '@/features/visits/place'
import { OsmCredit } from '@/features/visits/VisitPlace'
import { useDebounced } from '@/hooks/useDebounced'
import { Icon } from '@/icons'
import { api, ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { LocationSuggestion } from '@/lib/types'

interface LocationFieldProps {
  projectId: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  label?: string
}

/**
 * Free text with suggestions from the project's own locations (PRD §5.8,
 * UX-COMPONENTS.md §4.3). Suggestions render inline under the field on phones so
 * the keyboard can't cover them, and as a dropdown on laptops. "Use my location" fills
 * in the area the phone is in (looked up on OpenStreetMap by the API).
 */
export function LocationField({ projectId, value, onChange, onBlur, error, label = 'Location' }: LocationFieldProps) {
  const id = useId()
  const listId = `${id}-list`
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const q = useDebounced(value.trim(), 200)
  const here = useMyLocation((name) => {
    onChange(name)
    onBlur?.()
  })

  const { data = [] } = useQuery({
    queryKey: ['locations', projectId, q],
    queryFn: () => api<LocationSuggestion[]>(`/projects/${projectId}/locations`, { query: { q: q.slice(0, 100) } }),
    enabled: focused,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const typed = value.trim()
  const exact = data.some((s) => s.name.toLowerCase() === typed.toLowerCase())
  const rows = [...data.map((s) => ({ key: s.id, name: s.name, isNew: false })), ...(typed.length >= 2 && !exact ? [{ key: 'new', name: typed, isNew: true }] : [])]
  const showList = focused && rows.length > 0

  const choose = (name: string) => {
    onChange(name)
    setActive(-1)
    setFocused(false)
  }

  return (
    <FieldShell label={label} htmlFor={id} error={error}>
      <div className="relative">
        <div
          aria-invalid={!!error}
          className={cn(inputBox, 'flex h-12 items-center', focused && 'border-primary ring-3 ring-focus/25')}
        >
          <Icon name="marker" size={20} className="ml-4 text-muted" />
          <input
            id={id}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={!!error}
            autoComplete="off"
            enterKeyHint="next"
            maxLength={100}
            value={value}
            placeholder="Area, street or landmark"
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-body-md outline-none placeholder:text-muted-soft"
            onChange={(e) => {
              onChange(e.target.value)
              setActive(-1)
              here.clear()
            }}
            onFocus={() => {
              clearTimeout(blurTimer.current)
              setFocused(true)
            }}
            onBlur={() => {
              // Let a tap on a suggestion land before the list closes.
              blurTimer.current = setTimeout(() => {
                setFocused(false)
                onBlur?.()
              }, 150)
            }}
            onKeyDown={(e) => {
              if (!showList) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(rows.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(-1, a - 1))
              } else if (e.key === 'Enter' && active >= 0) {
                e.preventDefault()
                choose(rows[active].name)
              } else if (e.key === 'Escape') setFocused(false)
            }}
          />
        </div>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="mt-1.5 overflow-hidden rounded-2xl bg-overlay p-1 shadow-overlay expanded:absolute expanded:inset-x-0 expanded:top-full expanded:z-30"
          >
            {rows.map((r, i) => (
              <li
                key={r.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(r.name)}
                className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-body-md', i === active ? 'bg-default' : 'active:bg-default expanded:hover:bg-default')}
              >
                <Icon name={r.isNew ? 'plus-math' : 'marker'} size={20} className="text-muted" />
                <span className="truncate">{r.isNew ? <>Use “{r.name}”</> : r.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => void here.locate()}
          disabled={here.busy}
          className="pressable -ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-body-sm font-semibold text-primary active:opacity-70 disabled:opacity-60"
        >
          {here.busy ? <Spinner size={16} /> : <Icon name="near-me" size={18} />}
          {here.busy ? 'Finding your area…' : 'Use my location'}
        </button>
        {here.filled && (
          <span className="inline-flex items-center gap-2 text-caption text-muted" role="status">
            Filled in from your location <OsmCredit />
          </span>
        )}
      </div>
      {here.problem && (
        <p role="alert" className="text-caption text-body">
          {here.problem}
        </p>
      )}
    </FieldShell>
  )
}

/** Phone location → the area it is in → the field. Every failure ends in "type it instead". */
function useMyLocation(fill: (name: string) => void) {
  const [busy, setBusy] = useState(false)
  const [filled, setFilled] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const locate = async () => {
    setProblem(null)
    setFilled(false)
    if (!navigator.geolocation) {
      setProblem('This phone can’t share its location here. Type the area instead.')
      return
    }
    setBusy(true)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }),
      )
      const place = await fetchPlace(pos.coords.latitude, pos.coords.longitude)
      if (!place) {
        setProblem('We couldn’t find the area name here. Type it instead.')
        return
      }
      fill(shortPlace(place).slice(0, 100))
      setFilled(true)
    } catch (e) {
      setProblem(locationProblem(e))
    } finally {
      setBusy(false)
    }
  }

  return { busy, filled, problem, locate, clear: () => (setFilled(false), setProblem(null)) }
}

function locationProblem(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'RATE_LIMITED') return 'Too many tries. Wait a minute, or type the area.'
    return e.isNetwork ? 'No internet right now. Type the area instead.' : 'We couldn’t look up your area. Type it instead.'
  }
  const code = (e as { code?: number } | null)?.code
  if (code === 1) return 'Allow location for this app to use this, or type the area.'
  if (code === 3) return 'Finding your location took too long. Step outside or near a window and try again, or type the area.'
  return 'We couldn’t find your location. Turn on location and try again, or type the area.'
}
