import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ErrorState } from '@/components/ui/Display'
import { Spinner } from '@/components/ui/Spinner'
import { Icon } from '@/icons'
import { api } from '@/lib/api'
import type { DocumentContent } from '@/lib/types'
import { ViewerFrame } from './ViewerFrame'

const PdfViewer = lazy(() => import('./PdfViewer'))

type View = { type: 'pdf'; url: string } | { type: 'image'; url: string } | { type: 'video'; src: string } | { type: 'page'; src: string; url: string }

const YT_ID = /^[\w-]{11}$/
const nocookie = 'https://www.youtube-nocookie.com/embed'

/**
 * How a link is best shown inside the app: YouTube in its player, Google Drive and Docs in
 * their own preview, a PDF in our reader, a picture as itself, anything else as a page.
 */
function viewForLink(link: string): View {
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return { type: 'page', src: link, url: link }
  }
  const host = u.hostname.replace(/^(www|m)\./, '')
  const list = u.searchParams.get('list')
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] ?? '')
    if (YT_ID.test(id)) return { type: 'video', src: `${nocookie}/${id}?rel=0&playsinline=1${list ? `&list=${encodeURIComponent(list)}` : ''}` }
    if (list) return { type: 'video', src: `${nocookie}/videoseries?list=${encodeURIComponent(list)}&rel=0&playsinline=1` }
  }
  const drive = host === 'drive.google.com' && u.pathname.match(/^\/file\/d\/([\w-]+)/)
  if (drive) return { type: 'page', src: `https://drive.google.com/file/d/${drive[1]}/preview`, url: link }
  const doc = host === 'docs.google.com' && u.pathname.match(/^\/(document|presentation|spreadsheets)\/d\/([\w-]+)/)
  if (doc) return { type: 'page', src: `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`, url: link }
  if (/\.pdf$/i.test(u.pathname)) return { type: 'pdf', url: link }
  if (/\.(png|jpe?g|webp|gif)$/i.test(u.pathname)) return { type: 'image', url: link }
  return { type: 'page', src: link, url: link }
}

interface Props {
  lessonId: string
  projectId: string
  title: string
  content: DocumentContent
  /** Once something has shown: the lesson counts as opened. */
  onOpened: () => void
}

/**
 * A document lesson read where it is, never in a new tab: the uploaded PDF or picture, and
 * the link (YouTube, Google Drive or Docs, a PDF, or a web page), each in its own frame.
 */
export function DocumentViewer({ lessonId, projectId, title, content, onOpened }: Props) {
  const opened = useRef(onOpened)
  useEffect(() => {
    opened.current = onOpened
  }, [onOpened])
  const once = useRef(false)
  const shown = () => {
    if (once.current) return
    once.current = true
    opened.current()
  }

  return (
    <div className="flex flex-col gap-4">
      {content.hasFile && <FileView lessonId={lessonId} projectId={projectId} title={content.fileName ?? title} contentType={content.contentType} onShown={shown} />}
      {content.link && <LinkView link={content.link} title={content.hasFile ? 'Link' : title} onShown={shown} />}
    </div>
  )
}

function FileView({ lessonId, projectId, title, contentType, onShown }: { lessonId: string; projectId: string; title: string; contentType: string | null; onShown: () => void }) {
  // Signed links last a while; asking again after a few minutes keeps a long read working.
  const file = useQuery({
    queryKey: ['training', 'file', lessonId, projectId],
    queryFn: () => api<{ url: string; fileName: string }>(`/training/items/${lessonId}/file`, { query: { projectId } }),
    staleTime: 5 * 60_000,
  })
  if (file.isPending) return <Loading title={title} />
  if (file.isError) return <ErrorState message={file.error.message} onRetry={() => void file.refetch()} />
  const url = file.data.url
  return contentType?.startsWith('image/') ? <ImageView url={url} title={title} onShown={onShown} /> : <PdfView url={url} title={title} onShown={onShown} />
}

function LinkView({ link, title, onShown }: { link: string; title: string; onShown: () => void }) {
  const view = viewForLink(link)
  if (view.type === 'pdf') return <PdfView url={view.url} title={title} onShown={onShown} />
  if (view.type === 'image') return <ImageView url={view.url} title={title} onShown={onShown} />
  if (view.type === 'video') {
    return (
      <ViewerFrame title={title}>
        <iframe
          className="absolute inset-0 size-full bg-black"
          src={view.src}
          title={title}
          onLoad={onShown}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </ViewerFrame>
    )
  }
  return <PageView src={view.src} url={view.url} title={title} onShown={onShown} />
}

/** A PDF in our reader; one it can't read (another site that won't share it) shows as a page. */
function PdfView({ url, title, onShown }: { url: string; title: string; onShown: () => void }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <PageView src={url} url={url} title={title} onShown={onShown} />
  return (
    <Suspense fallback={<Loading title={title} />}>
      <PdfViewer url={url} title={title} onLoaded={onShown} onFailed={() => setFailed(true)} />
    </Suspense>
  )
}

function PageView({ src, url, title, onShown }: { src: string; url: string; title: string; onShown: () => void }) {
  return (
    <ViewerFrame
      title={title}
      note={
        <span className="flex flex-wrap items-center gap-x-1">
          Page stays blank? Some sites don’t allow being shown inside other apps.
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
            Open it in the browser
            <Icon name="external" size={14} />
          </a>
        </span>
      }
    >
      <iframe
        className="absolute inset-0 size-full bg-white"
        src={src}
        title={title}
        onLoad={onShown}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads"
        allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </ViewerFrame>
  )
}

const IMAGE_ZOOMS = [1, 1.5, 2, 3]

function ImageView({ url, title, onShown }: { url: string; title: string; onShown: () => void }) {
  const [zoom, setZoom] = useState(1)
  const step = (dir: 1 | -1) => setZoom((z) => IMAGE_ZOOMS[Math.max(0, Math.min(IMAGE_ZOOMS.length - 1, IMAGE_ZOOMS.indexOf(z) + dir))])
  return (
    <ViewerFrame title={title} zoom={{ percent: zoom * 100, canIn: zoom < IMAGE_ZOOMS.at(-1)!, canOut: zoom > 1, step }}>
      <div className="size-full overflow-auto overscroll-contain bg-surface-secondary p-3">
        <img
          src={url}
          alt={title}
          onLoad={onShown}
          className={zoom === 1 ? 'mx-auto max-h-full max-w-full object-contain' : 'max-w-none'}
          style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }}
        />
      </div>
    </ViewerFrame>
  )
}

function Loading({ title }: { title: string }) {
  return (
    <ViewerFrame title={title} status="Loading…">
      <div className="flex size-full items-center justify-center bg-surface-secondary text-body">
        <Spinner size={28} />
      </div>
    </ViewerFrame>
  )
}
