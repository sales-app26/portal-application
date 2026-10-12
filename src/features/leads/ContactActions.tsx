import { Icon } from '@/icons'
import { cn } from '@/lib/cn'
import { telHref, whatsappHref } from '@/lib/contact'

/** A chat bubble with a handset: reads as "WhatsApp" next to the green fill without copying the logo. */
export function ChatIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={cn('flex-none', className)}>
      <path d="M12 3a9 9 0 0 0-7.79 13.5L3 21l4.62-1.18A9 9 0 1 0 12 3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path
        d="M9.2 8.1c.2-.38.48-.4.7-.4h.48c.2 0 .4.1.5.36l.62 1.45c.1.23.04.48-.12.65l-.42.47a.4.4 0 0 0-.05.47 5.6 5.6 0 0 0 2.2 2.2c.17.1.37.08.48-.05l.47-.42c.17-.16.42-.22.65-.12l1.45.62c.26.1.36.3.36.5v.48c0 .22-.02.5-.4.7-.53.3-1.33.5-2.05.3a6.9 6.9 0 0 1-4.83-4.83c-.2-.72 0-1.52.3-2.05z"
        fill="currentColor"
      />
    </svg>
  )
}

const round = 'pressable inline-flex flex-none items-center justify-center rounded-full'

/**
 * Call and WhatsApp as two round buttons. Used in list rows, so it stops the tap from
 * reaching the row behind it.
 */
export function ContactButtons({ phone, name, size = 40, className }: { phone: string; name: string; size?: number; className?: string }) {
  const style = { width: size, height: size }
  return (
    <span className={cn('flex flex-none items-center gap-2', className)}>
      <a href={telHref(phone)} aria-label={`Call ${name}`} title="Call" style={style} className={cn(round, 'bg-primary/10 text-primary active:bg-primary/20')} onClick={(e) => e.stopPropagation()}>
        <Icon name="phone" size={20} />
      </a>
      <a
        href={whatsappHref(phone)}
        target="_blank"
        rel="noreferrer"
        aria-label={`WhatsApp ${name}`}
        title="WhatsApp"
        style={style}
        className={cn(round, 'bg-[#25d366]/12 text-[#128c4a] active:bg-[#25d366]/25')}
        onClick={(e) => e.stopPropagation()}
      >
        <ChatIcon size={21} />
      </a>
    </span>
  )
}
