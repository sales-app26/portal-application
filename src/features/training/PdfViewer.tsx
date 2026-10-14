import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { ViewerFrame } from './ViewerFrame'

GlobalWorkerOptions.workerSrc = workerUrl

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 3]

interface Props {
  url: string
  title: string
  onLoaded?: () => void
  /** The file couldn't be read here (blocked, not a PDF): the caller shows it another way. */
  onFailed: () => void
}

/**
 * A PDF drawn page by page inside the app (pdf.js), so it reads the same on every phone:
 * Android's browser won't show a PDF inside a page, and iPhones show only its first page.
 * Pages draw as they scroll near, sharp on high-density screens. Loaded only when a PDF is
 * on screen; the library is a separate download.
 */
export default function PdfViewer({ url, title, onLoaded, onFailed }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [ratio, setRatio] = useState(1.414)
  const [loaded, setLoaded] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState(1)
  const [width, setWidth] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const done = useRef({ onLoaded, onFailed })
  useEffect(() => {
    done.current = { onLoaded, onFailed }
  }, [onLoaded, onFailed])

  useEffect(() => {
    let cancelled = false
    const task = getDocument({ url })
    task.onProgress = ({ loaded: n, total }: { loaded: number; total: number }) => !cancelled && total > 0 && setLoaded(Math.round((n / total) * 100))
    task.promise
      .then(async (pdf) => {
        const first = await pdf.getPage(1)
        const v = first.getViewport({ scale: 1 })
        if (cancelled) return
        setRatio(v.height / v.width)
        setDoc(pdf)
        done.current.onLoaded?.()
      })
      .catch(() => !cancelled && done.current.onFailed())
    return () => {
      cancelled = true
      void task.destroy()
    }
  }, [url])

  // Pages fill the frame's width (less its padding); zoom scales from there.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setWidth(Math.max(200, el.clientWidth - 24))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The page most in view, for "Page 3 of 12".
  useEffect(() => {
    const el = scroller.current
    if (!el || !doc) return
    const onScroll = () => {
      const pages = [...el.querySelectorAll<HTMLElement>('[data-page]')]
      const middle = el.scrollTop + el.clientHeight / 3
      const current = pages.findLast((p) => p.offsetTop <= middle)
      setPage(current ? Number(current.dataset.page) : 1)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [doc])

  const step = (dir: 1 | -1) => setZoom((z) => ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + dir))])
  const pageWidth = Math.round(width * zoom)

  return (
    <ViewerFrame
      title={title}
      status={doc ? `Page ${page} of ${doc.numPages}` : 'Loading…'}
      zoom={doc ? { percent: Math.round(zoom * 100), canIn: zoom < ZOOMS.at(-1)!, canOut: zoom > ZOOMS[0], step } : undefined}
    >
      <div ref={scroller} className="size-full overflow-auto overscroll-contain bg-surface-secondary p-3" aria-label={title} role="document">
        {!doc ? (
          <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 text-body">
            <Spinner size={28} />
            <span className="text-body-sm">{loaded > 0 && loaded < 100 ? `Loading PDF… ${loaded}%` : 'Loading PDF…'}</span>
          </div>
        ) : (
          <div className={cn('flex flex-col gap-3', zoom <= 1 && 'items-center')} style={{ width: zoom > 1 ? pageWidth : undefined }}>
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage key={i} doc={doc} number={i + 1} width={pageWidth} ratio={ratio} root={scroller} />
            ))}
          </div>
        )}
      </div>
    </ViewerFrame>
  )
}

/** One page: a placeholder of the right height until it scrolls near, then drawn once per width. */
function PdfPage({ doc, number, width, ratio, root }: { doc: PDFDocumentProxy; number: number; width: number; ratio: number; root: React.RefObject<HTMLDivElement | null> }) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(number <= 2)
  const [height, setHeight] = useState(Math.round(width * ratio))

  useEffect(() => {
    if (near || !holder.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { root: root.current, rootMargin: '800px 0px' })
    io.observe(holder.current)
    return () => io.disconnect()
  }, [near, root])

  useEffect(() => {
    if (!near || !canvas.current || width <= 0) return
    let task: RenderTask | null = null
    let cancelled = false
    void doc.getPage(number).then((p) => {
      if (cancelled || !canvas.current) return
      const base = p.getViewport({ scale: 1 })
      const scale = width / base.width
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = p.getViewport({ scale: scale * dpr })
      const c = canvas.current
      c.width = Math.floor(viewport.width)
      c.height = Math.floor(viewport.height)
      setHeight(Math.round(viewport.height / dpr))
      task = p.render({ canvas: c, viewport })
      task.promise.catch(() => undefined)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, number, width, near])

  return (
    <div ref={holder} data-page={number} className="flex-none overflow-hidden rounded-md bg-white shadow-sm" style={{ width, height }}>
      <canvas ref={canvas} className="block size-full" aria-label={`Page ${number}`} />
    </div>
  )
}
