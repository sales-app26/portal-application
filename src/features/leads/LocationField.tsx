import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { FieldShell } from '@/components/ui/Field'
import { useDebounced } from '@/hooks/useDebounced'
import { Icon } from '@/icons'
import { api } from '@/lib/api'
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
 * the keyboard can't cover them, and as a dropdown on laptops.
 */
export function LocationField({ projectId, value, onChange, onBlur, error, label = 'Location' }: LocationFieldProps) {
  const id = useId()
  const listId = `${id}-list`
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const q = useDebounced(value.trim(), 200)

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
          className={cn(
            'flex h-12 items-center rounded-md border border-hairline bg-canvas',
            focused && 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]',
            error && 'border-down',
          )}
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
            className="mt-1 overflow-hidden rounded-md border border-hairline bg-canvas expanded:absolute expanded:inset-x-0 expanded:top-full expanded:z-30 expanded:shadow-soft"
          >
            {rows.map((r, i) => (
              <li
                key={r.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(r.name)}
                className={cn('flex min-h-12 cursor-pointer items-center gap-3 border-b border-hairline-soft px-4 text-body-md last:border-b-0', i === active ? 'bg-surface-strong' : 'active:bg-surface-soft expanded:hover:bg-surface-soft')}
              >
                <Icon name={r.isNew ? 'plus-math' : 'marker'} size={20} className="text-muted" />
                <span className="truncate">{r.isNew ? <>Use “{r.name}”</> : r.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}
