import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Icon, type IconName } from '@/icons'
import { Spinner } from './Spinner'

// DESIGN.md buttons: every CTA is a pill; one action colour (UX-COMPONENTS.md §4.4).
const button = cva(
  'pressable inline-flex items-center justify-center gap-2 rounded-pill text-button whitespace-nowrap disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary active:bg-primary-active disabled:bg-primary-disabled',
        secondary: 'bg-surface-strong text-ink active:bg-hairline disabled:text-muted-soft',
        tertiary: 'bg-transparent text-primary active:text-primary-active disabled:text-muted-soft px-2',
        'outline-dark': 'bg-transparent text-on-dark border border-on-dark active:bg-surface-dark-elevated',
        'secondary-dark': 'bg-surface-dark-elevated text-on-dark',
      },
      size: {
        md: 'h-11 px-5',
        lg: 'h-14 px-8',
        sm: 'h-9 px-4 text-body-sm font-semibold',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean
  icon?: IconName
  asChild?: boolean
}

export function Button({ className, variant, size, block, loading, icon, children, disabled, asChild, ...rest }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(button({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
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

/** 48×48 hit area, 24px icon, always labelled (UX-COMPONENTS.md §4.4). */
export function IconButton({ icon, label, filled, tone = 'light', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'pressable inline-flex size-12 flex-none items-center justify-center rounded-full',
        tone === 'light' ? 'text-ink active:bg-surface-strong' : 'text-on-dark active:bg-surface-dark-elevated',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} filled={filled} />
    </button>
  )
}
