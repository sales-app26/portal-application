import { cn } from '@/lib/cn'

import spriteUrl from './sprite.svg?url'

// Gravity UI icons (MIT, the set HeroUI v3 uses), as one SVG sprite built by
// scripts/build-icons.mjs: a single cached file, no per-icon JavaScript, and they take the text colour.
export type IconName =
  | 'home'
  | 'contacts'
  | 'timeline'
  | 'today'
  | 'dashboard'
  | 'statistics'
  | 'briefcase'
  | 'conference-call'
  | 'add-user-male'
  | 'swap'
  | 'menu-2'
  | 'more'
  | 'user-male-circle'
  | 'plus-math'
  | 'camera'
  | 'marker'
  | 'map'
  | 'near-me'
  | 'calendar'
  | 'clock'
  | 'phone'
  | 'search'
  | 'filter'
  | 'sort'
  | 'back'
  | 'forward'
  | 'chevron-right'
  | 'expand-arrow'
  | 'collapse-arrow'
  | 'multiply'
  | 'checkmark'
  | 'edit'
  | 'synchronize'
  | 'refresh'
  | 'goal'
  | 'ok'
  | 'approval'
  | 'cancel'
  | 'csv'
  | 'download'
  | 'image'
  | 'high-priority'
  | 'error'
  | 'wi-fi-disconnected'
  | 'lock'
  | 'trash'
  | 'info'
  | 'visible'
  | 'invisible'
  | 'logout-rounded'
  | 'share'
  | 'add-square'
  | 'smartphone'
  | 'bell'
  | 'comment'
  | 'help'
  | 'leave'
  | 'pin'
  | 'send'
  | 'thumbs-up'
  | 'mention'
  | 'templates'
  | 'shield'
  | 'learn'
  | 'play'
  | 'book'
  | 'quiz'
  | 'microphone'
  | 'bulb'

interface IconProps {
  name: IconName
  filled?: boolean
  size?: number
  className?: string
}

export function Icon({ name, filled = false, size = 24, className }: IconProps) {
  return (
    <svg aria-hidden focusable="false" width={size} height={size} className={cn('icon flex-none', className)}>
      <use href={`${spriteUrl}#${name}${filled ? '-fill' : ''}`} />
    </svg>
  )
}
