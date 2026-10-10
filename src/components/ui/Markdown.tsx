import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/cn'

/**
 * Renders a release note.
 *
 * Styled per element: the portal carries no typography plugin, and a note only
 * uses a handful of tags. GFM is on for tables and task lists, which changelogs
 * written in a hurry do reach for. `react-markdown` renders no raw HTML unless
 * `rehype-raw` is added, and it isn't — a note is text, never markup that runs.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('text-body-md text-ink', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mt-6 mb-3 text-title-md first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-6 mb-2 text-title-md first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-4 mb-2 text-caption-strong text-muted uppercase first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-2">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          hr: () => <hr className="my-5 border-hairline" />,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="rounded-xs bg-surface-strong px-1.5 py-0.5 font-mono text-[0.8125rem]">{children}</code>,
          pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-sm bg-surface-strong p-3 text-caption">{children}</pre>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-hairline pl-3 text-body">{children}</blockquote>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-body-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-hairline bg-surface-soft px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-hairline px-3 py-2">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
