import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge our custom type utilities so `text-ink` and `text-body-sm` don't cancel out.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-title-lg', 'text-title-md', 'text-title-sm', 'text-body-md', 'text-body-sm',
        'text-caption', 'text-caption-strong', 'text-number', 'text-display-sm', 'text-button', 'text-nav',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
