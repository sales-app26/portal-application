import { useEffect, useId, useRef, useState } from 'react'

// The slice of the YouTube IFrame Player API we use (https://developers.google.com/youtube/iframe_api_reference).
interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
}
interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string
      host?: string
      playerVars?: Record<string, number | string>
      events?: { onStateChange?: (e: { data: number }) => void; onReady?: () => void }
    },
  ) => YTPlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number }
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let loading: Promise<YTNamespace> | null = null

/** Loads YouTube's player script once per page. Rejects if it can't load (blocked, offline). */
function loadYouTube(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  loading ??= new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT) resolve(window.YT)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => {
      loading = null
      reject(new Error('YouTube could not load'))
    }
    document.head.appendChild(s)
    setTimeout(() => !window.YT?.Player && reject(new Error('YouTube took too long')), 10_000)
  })
  return loading
}

interface Props {
  youtubeId: string
  title: string
  startSeconds: number | null
  endSeconds: number | null
  /** Where the rep left off last time. */
  resumeAt?: number | null
  /** How far through (0–100) and where, every few seconds while playing and on pause or end. */
  onProgress: (percent: number, positionSeconds: number) => void
  /** Played to the end (a playlist moves on to its next module). */
  onEnded?: () => void
  /** Start playing at once: the next module of a playlist. */
  autoplay?: boolean
}

/**
 * A YouTube video (unlisted is fine) that reports how much has been watched, so the
 * lesson can count as done at 90%. Videos never pass through our servers. If YouTube's
 * player script can't load, it falls back to the plain embed and the rep marks it done.
 */
export function YouTubePlayer({ youtubeId, title, startSeconds, endSeconds, resumeAt, onProgress, onEnded, autoplay }: Props) {
  const id = `yt-${useId().replace(/[^a-z0-9]/gi, '')}`
  const [fallback, setFallback] = useState(false)
  const report = useRef(onProgress)
  const ended = useRef(onEnded)
  useEffect(() => {
    report.current = onProgress
    ended.current = onEnded
  }, [onProgress, onEnded])

  useEffect(() => {
    let player: YTPlayer | null = null
    let timer: number | undefined
    let cancelled = false
    const start = startSeconds ?? 0

    const tick = () => {
      if (!player) return
      const duration = player.getDuration()
      const now = player.getCurrentTime()
      const end = endSeconds ?? duration
      if (!duration || end <= start) return
      const percent = Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)))
      report.current(percent, Math.round(now))
    }

    loadYouTube()
      .then((YT) => {
        if (cancelled) return
        player = new YT.Player(id, {
          videoId: youtubeId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            ...(autoplay ? { autoplay: 1 } : {}),
            start: Math.max(start, resumeAt && resumeAt > start ? resumeAt : start),
            ...(endSeconds ? { end: endSeconds } : {}),
          },
          events: {
            onStateChange: (e) => {
              window.clearInterval(timer)
              if (e.data === YT.PlayerState.PLAYING) timer = window.setInterval(tick, 5_000)
              if (e.data === YT.PlayerState.ENDED && player) {
                report.current(100, Math.round(player.getCurrentTime()))
                ended.current?.()
              } else if (e.data === YT.PlayerState.PAUSED) tick()
            },
          },
        })
      })
      .catch(() => !cancelled && setFallback(true))

    return () => {
      cancelled = true
      window.clearInterval(timer)
      try {
        player?.destroy()
      } catch {
        /* already gone */
      }
    }
  }, [id, youtubeId, startSeconds, endSeconds, resumeAt, autoplay])

  const src = `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&playsinline=1${startSeconds ? `&start=${startSeconds}` : ''}${endSeconds ? `&end=${endSeconds}` : ''}${autoplay ? '&autoplay=1' : ''}`
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      {fallback ? (
        <iframe
          className="absolute inset-0 size-full"
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <div id={id} className="absolute inset-0 size-full [&>iframe]:size-full" aria-label={title} />
      )}
    </div>
  )
}
