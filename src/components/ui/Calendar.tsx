import type { ComponentProps } from 'react'
import { DayPicker } from 'react-day-picker'
import { Icon } from '@/icons'
import { cn } from '@/lib/cn'

/**
 * shadcn's Calendar (react-day-picker v9), restyled with DESIGN.md tokens.
 * Weeks start on Monday, as the API's weeks do (BRD §7).
 *
 * Day cells are 44px on phones and 40px on laptops, so a thumb can hit them
 * in a bottom sheet.
 */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn('w-full select-none', className)}
      classNames={{
        months: 'relative flex flex-col',
        month: 'flex w-full flex-col gap-3',
        month_caption: 'flex h-10 items-center px-1',
        caption_label: 'text-title-sm text-ink',
        nav: 'absolute top-0 right-0 flex h-10 items-center gap-1',
        button_previous: navButton,
        button_next: navButton,
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'flex-1 pb-1 text-center text-caption-strong uppercase text-muted',
        week: 'mt-1 flex w-full',
        day: 'flex flex-1 items-center justify-center p-0 text-center',
        day_button: cn(
          'pressable flex size-11 items-center justify-center rounded-full font-mono text-number text-ink expanded:size-10',
          'hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-primary',
        ),
        today: '[&>button]:shadow-[inset_0_0_0_1px_var(--color-ink)]',
        selected: '[&>button]:bg-ink [&>button]:text-on-dark [&>button]:hover:bg-ink',
        outside: '[&>button]:text-muted-soft',
        disabled: '[&>button]:pointer-events-none [&>button]:text-muted-soft',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => <Icon name={orientation === 'left' ? 'back' : 'forward'} size={20} />,
      }}
      {...props}
    />
  )
}

const navButton =
  'pressable flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface-strong disabled:pointer-events-none disabled:text-muted-soft'
