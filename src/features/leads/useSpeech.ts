import { useEffect, useRef, useState } from 'react'

// The Web Speech API is not in the TypeScript DOM lib; this is the slice we use.
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type RecognitionCtor = new () => Recognition

const Ctor = (): RecognitionCtor | undefined =>
  typeof window === 'undefined' ? undefined : ((window as unknown as Record<string, RecognitionCtor | undefined>).SpeechRecognition ?? (window as unknown as Record<string, RecognitionCtor | undefined>).webkitSpeechRecognition)

/**
 * Dictation for note fields: a rep standing outside a shop can speak the note instead of typing it.
 * Chrome on Android supports it; elsewhere `supported` is false and no mic is shown.
 */
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onText)
  cb.current = onText

  useEffect(() => () => rec.current?.stop(), [])

  const start = () => {
    const R = Ctor()
    if (!R || listening) return
    const r = new R()
    r.lang = 'en-IN'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .filter((res) => res.isFinal)
        .map((res) => res[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (text) cb.current(text)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }

  const stop = () => rec.current?.stop()

  return { supported: !!Ctor(), listening, start, stop }
}
