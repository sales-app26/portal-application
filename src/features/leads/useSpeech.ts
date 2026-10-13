import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

// The Web Speech API is not in the TypeScript DOM lib; this is the slice we use.
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort?(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
}
type RecognitionCtor = new () => Recognition

const Ctor = (): RecognitionCtor | undefined =>
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ??
      (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition)

/**
 * iPhone and iPad (iPadOS says "Macintosh", but has touch). Their browser speech recognition fails
 * silently in many setups, home-screen apps above all, while the keyboard's own mic always works.
 */
export const isAppleTouch = () =>
  typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))

/** Long enough for a note, short enough that a forgotten mic stops itself. */
const MAX_LISTEN_MS = 20_000

const ERRORS: Record<string, string> = {
  'not-allowed': 'Allow the microphone for Pronttera to speak notes, or use the mic on your keyboard.',
  'service-not-allowed': 'Voice notes aren’t available here. Use the mic on your keyboard instead.',
  'no-speech': 'Didn’t catch anything. Tap Speak and try again.',
  'audio-capture': 'No microphone found. Use the mic on your keyboard instead.',
  network: 'Voice notes need internet. Type the note, or try again when you’re online.',
}

/**
 * Dictation for note fields: a rep standing outside a shop can speak the note instead of typing it.
 * Uses the phone browser's own speech-to-text; nothing is recorded or kept by us.
 *
 * Phones don't always report that listening ended (iPhone, home-screen apps), so the button never
 * waits on the browser: Stop ends it at once and keeps the words heard so far, and a time limit
 * stops a forgotten mic.
 */
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  /** Words heard but not yet final, shown live while speaking. */
  const [heard, setHeard] = useState('')
  const rec = useRef<Recognition | null>(null)
  const pending = useRef('')
  const timer = useRef<number | undefined>(undefined)
  const cb = useRef(onText)
  cb.current = onText

  const finish = (r: Recognition) => {
    if (rec.current !== r) return
    rec.current = null
    window.clearTimeout(timer.current)
    pending.current = ''
    setHeard('')
    setListening(false)
  }

  const stop = () => {
    const r = rec.current
    if (!r) return
    // Keep what was said even if the browser never sends the final words.
    const words = pending.current.trim()
    if (words) cb.current(words)
    finish(r)
    try {
      r.stop()
    } catch {
      /* already stopped */
    }
    window.setTimeout(() => r.abort?.(), 1500)
  }

  useEffect(
    () => () => {
      const r = rec.current
      rec.current = null
      window.clearTimeout(timer.current)
      r?.abort?.()
    },
    [],
  )

  const start = () => {
    const R = Ctor()
    if (!R || rec.current) return
    const r = new R()
    r.lang = 'en-IN'
    r.interimResults = true
    r.continuous = false
    r.onresult = (e) => {
      if (rec.current !== r) return // a stopped session's late words
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const text = res[0]?.transcript ?? ''
        if (res.isFinal) {
          if (text.trim()) cb.current(text.trim())
        } else interim += text
      }
      pending.current = interim
      setHeard(interim.trim())
    }
    r.onend = () => {
      if (rec.current === r && pending.current.trim()) cb.current(pending.current.trim())
      finish(r)
    }
    r.onerror = (e) => {
      if (rec.current !== r) return
      const message = e.error ? ERRORS[e.error] : undefined
      if (message) toast.error(message)
      finish(r)
    }
    try {
      r.start()
    } catch {
      toast.error(ERRORS['service-not-allowed'])
      return
    }
    rec.current = r
    pending.current = ''
    setHeard('')
    setListening(true)
    timer.current = window.setTimeout(stop, MAX_LISTEN_MS)
  }

  return { supported: !!Ctor(), listening, heard, start, stop }
}
