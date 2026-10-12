import { Slot } from '@radix-ui/react-slot'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from '@/icons'
import { Spinner } from './Spinner'

/*
 * HeroUI v3 buttons (`button button--<variant>` from @heroui/styles) on a native <button>,
 * so forms submit and onClick works as everywhere else, with no extra JavaScript.
 * Heights are a touch taller than HeroUI's desktop defaults: thumbs, not cursors.
 */
const VARIANT = {
  primary: 'button--primary shadow-[0_1px_2px_rgb(10_120_176/0.25)]',
  /** Neutral fill: the everyday second action. */
  secondary: 'button--tertiary',
  /** Accent text on a soft accent fill: a friendly secondary that still reads as Pronttera. */
  soft: 'bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft-hover',
  /** Text-only, accent coloured: inline actions such as "Edit". */
  tertiary: 'button--ghost text-primary! px-2',
  outline: 'button--outline',
  danger: 'button--danger',
  'danger-soft': 'button--danger-soft',
  'outline-dark': 'border border-on-dark/60 text-on-dark hover:bg-white/10',
  'secondary-dark': 'bg-surface-dark-elevated text-on-dark hover:bg-white/10',
} as const

const SIZE = {
  sm: 'button--sm h-9 px-3.5 text-[13px] md:h-9',
  md: 'h-11 px-5 text-[15px] md:h-11',
  lg: 'button--lg h-14 px-7 text-base font-semibold md:h-13',
} as const

export type ButtonVariant = keyof typeof VARIANT

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: keyof typeof SIZE
  block?: boolean
  loading?: boolean
  icon?: IconName
  asChild?: boolean
}

export const buttonClass = ({ variant = 'primary', size = 'md', block, className }: { variant?: ButtonVariant; size?: keyof typeof SIZE; block?: boolean; className?: string }) =>
  cn('button font-semibold', VARIANT[variant], SIZE[size], block && 'button--full-width', className)

export function Button({ className, variant, size, block, loading, icon, children, disabled, asChild, ...rest }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp className={buttonClass({ variant, size, block: !!block, className })} disabled={disabled || loading} aria-busy={loading || undefined} data-pending={loading || undefined} {...rest}>
      {asChild ? (
        children
      ) : loading ? (
        // Width stays put: the label is hidden, not removed.
        <span className="relative inline-flex items-center justify-center">
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <Spinner className="absolute" size={20} />
        </span>
      ) : (
        <>
          {icon && <Icon name={icon} size={20} />}
          {children}
        </>
      )}
    </Comp>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  filled?: boolean
  tone?: 'light' | 'dark'
}

/** 48×48 hit area, 24px icon, always labelled (UX-COMPONENTS.md §4.4). HeroUI ghost icon button. */
export function IconButton({ icon, label, filled, tone = 'light', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'button button--icon-only size-12! rounded-full! md:size-11!',
        tone === 'light' ? 'button--ghost text-ink' : 'text-on-dark hover:bg-white/10 active:bg-white/15',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} filled={filled} />
    </button>
  )
}
