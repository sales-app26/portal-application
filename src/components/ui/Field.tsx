import { forwardRef, useId, useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from '@/icons'

interface FieldShellProps {
  label?: string
  hint?: ReactNode
  error?: string
  htmlFor: string
  optional?: boolean
  children: ReactNode
  className?: string
}

/** Label above, helper or error below (UX-COMPONENTS.md §4.3), with HeroUI's label/description/error styles. */
export function FieldShell({ label, hint, error, htmlFor, optional, children, className }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="label text-[15px] font-semibold text-ink">
          {label}
          {optional && <span className="ml-1 text-body-sm font-normal text-muted">(optional)</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} role="alert" data-visible className="field-error flex items-center gap-1 text-caption font-medium text-down">
          <Icon name="error" size={16} />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-msg`} className="description text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** HeroUI field look (rounded-field, field background, border, focus ring) on a wrapper. */
export const inputBox =
  'w-full rounded-field border border-field-border bg-field text-body-md text-field-foreground shadow-field placeholder:text-field-placeholder ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-field-border-hover ' +
  'focus-within:border-primary focus-within:ring-3 focus-within:ring-focus/25 ' +
  'aria-[invalid=true]:border-down aria-[invalid=true]:ring-down/20 disabled:opacity-60'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string
  hint?: ReactNode
  error?: string
  optional?: boolean
  prefix?: ReactNode
  suffix?: ReactNode
  containerClassName?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optional, prefix, suffix, id, className, containerClassName, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId} optional={optional} className={containerClassName}>
      <div className={cn(inputBox, 'flex h-12 items-center')} aria-invalid={!!error}>
        {prefix && <span className="pl-4 text-body-md text-muted">{prefix}</span>}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
          className={cn('h-full min-w-0 flex-1 bg-transparent px-4 outline-none', prefix && 'pl-2', className)}
          {...rest}
        />
        {suffix}
      </div>
    </FieldShell>
  )
})

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: ReactNode
  error?: string
  optional?: boolean
}

/** Grows from 3 to 8 lines (UX-COMPONENTS.md §4.3). */
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, optional, id, className, value, onInput, ...rest },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const inner = useRef<HTMLTextAreaElement | null>(null)

  const grow = () => {
    const el = inner.current
    if (!el) return
    el.style.height = 'auto'
    const line = 24
    el.style.height = `${Math.min(Math.max(el.scrollHeight, line * 3 + 24), line * 8 + 24)}px`
  }
  useLayoutEffect(grow, [value])

  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fieldId} optional={optional}>
      <textarea
        ref={(el) => {
          inner.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        id={fieldId}
        value={value}
        rows={3}
        onInput={(e) => {
          grow()
          onInput?.(e)
        }}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
        className={cn(inputBox, 'resize-none px-4 py-3 outline-none', className)}
        {...rest}
      />
    </FieldShell>
  )
})
