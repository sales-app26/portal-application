import { Icon } from '@/icons'
import { cn } from '@/lib/cn'

/** HeroUI search field look: a pill with a search icon and a clear button once there is text. */
export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <label
      className={cn(
        'flex h-11 min-w-0 items-center gap-2 rounded-pill border border-field-border bg-field px-4 shadow-field transition-[border-color,box-shadow]',
        'focus-within:border-primary focus-within:ring-3 focus-within:ring-focus/25',
        className,
      )}
    >
      <Icon name="search" size={20} className="text-muted" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={120}
        className="h-full min-w-0 flex-1 bg-transparent text-body-md text-field-foreground outline-none placeholder:text-field-placeholder [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="-mr-2 flex size-8 items-center justify-center rounded-full bg-default text-muted hover:text-ink">
          <Icon name="multiply" size={14} />
        </button>
      )}
    </label>
  )
}
