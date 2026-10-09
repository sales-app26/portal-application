import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Avatar, EmptyState, ErrorState, Skeleton, Tag } from '@/components/ui/Display'
import { TextField } from '@/components/ui/Field'
import { ListGroup } from '@/components/ui/ListRow'
import { invalidateProjects, useProjectDetail, useProjectMembers } from '@/features/admin/queries'
import { Icon } from '@/icons'
import { ApiError, apiWithMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { saveCsv } from '@/lib/download'
import { formatPhone, plural, ROLE_LABEL } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import type { ImportResult, Member } from '@/lib/types'

const MAX_BYTES = 1024 * 1024
const COLUMNS = ['name', 'phone', 'business_name', 'location', 'notes', 'owner_email']

type Step = 'form' | 'preview' | 'done'

const downloadTemplate = () =>
  saveCsv('leads-template.csv', COLUMNS, [
    ['Asha Patil', '98765 43210', 'Patil General Store', 'Wanowrie', 'Likes calls after 4 pm', ''],
    ['Imran Shaikh', '9123456780', '', 'Kondhwa', '', 'priya@yourcompany.com'],
  ])

/**
 * Bulk import from a CSV (admins). Check the file first, read the report, then import:
 * nothing is saved until the second step, and a file can be run twice safely.
 */
export function ImportLeadsPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const project = useProjectDetail(id)
  const members = useProjectMembers(id)
  const fileInput = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('form')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string>()
  const [defaultLocation, setDefaultLocation] = useState('')
  const [owners, setOwners] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const back = `/projects/${id}?tab=leads`
  const people = (members.data ?? []).filter((m) => m.isActive && m.userIsActive && m.role !== 'super_admin')
  const closed = project.data?.status === 'closed'

  const choose = (f: File | undefined) => {
    setFileError(undefined)
    if (!f) return setFile(null)
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setFileError('Choose a CSV file. In Excel: Save As › CSV (Comma delimited).')
    if (f.size > MAX_BYTES) return setFileError('The file is over 1 MB. Split it into files of at most 1,000 leads.')
    setFile(f)
  }

  const run = async (dryRun: boolean) => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (defaultLocation.trim()) fd.append('defaultLocation', defaultLocation.trim())
      if (owners.length) fd.append('ownerIds', owners.join(','))
      fd.append('dryRun', String(dryRun))
      const { data } = await apiWithMessage<ImportResult>(`/projects/${id}/leads/import`, { method: 'POST', body: fd })
      setResult(data)
      if (dryRun) setStep('preview')
      else {
        haptic.success()
        toast.success(`${plural(data.imported, 'lead')} imported.`)
        setStep('done')
        invalidateProjects(qc)
        void qc.invalidateQueries({ queryKey: ['leads'] })
        void qc.invalidateQueries({ queryKey: ['dashboard'] })
      }
      window.scrollTo({ top: 0 })
    } catch (err) {
      haptic.error()
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
      // A file problem belongs next to the file; anything else is a toast.
      if (err instanceof ApiError && err.status === 400) setFileError(message)
      else toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const restart = () => {
    setStep('form')
    setResult(null)
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const cta =
    step === 'form'
      ? { label: 'Check file', icon: 'checkmark' as const, onClick: () => void run(true), disabled: !file || closed, loading: busy }
      : step === 'preview'
        ? { label: result?.importable ? `Import ${plural(result.importable, 'lead')}` : 'Nothing to import', icon: 'download' as const, onClick: () => void run(false), disabled: !result?.importable, loading: busy }
        : { label: 'View leads', icon: 'contacts' as const, onClick: () => navigate(back) }

  return (
    <Page title="Import leads" back={back} cta={project.data && !closed ? cta : undefined}>
      <div className="expanded:max-w-[720px]">
        {project.isLoading || members.isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : project.isError ? (
          <ErrorState message={project.error.message} onRetry={() => void project.refetch()} />
        ) : closed ? (
          <EmptyState icon="lock" title="This project is closed" body="A closed project is read-only, so leads can't be imported into it." />
        ) : step === 'form' ? (
          <div className="flex flex-col gap-8">
            <p className="text-body-md text-body">
              Upload a CSV and the leads are assigned to your sales persons. They start as <b>New</b> in <b>{project.data?.name}</b> and each person finds theirs in My leads.
            </p>

            <section className="flex flex-col gap-3">
              <h2 className="text-title-md">1. The file</h2>
              <input ref={fileInput} id="import-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
              <label
                htmlFor="import-file"
                className={cn(
                  'pressable flex cursor-pointer items-center gap-4 rounded-lg border border-dashed bg-surface-soft p-4 active:bg-surface-strong',
                  fileError ? 'border-down' : 'border-hairline',
                )}
              >
                <span className="flex size-12 flex-none items-center justify-center rounded-full bg-primary text-on-primary">
                  <Icon name="csv" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-title-sm">{file ? file.name : 'Choose a CSV file'}</span>
                  <span className="block text-body-sm text-body">{file ? `${(file.size / 1024).toFixed(1)} KB · tap to change` : 'Up to 1,000 leads and 1 MB'}</span>
                </span>
              </label>
              {fileError && (
                <p role="alert" className="flex items-start gap-1 text-caption text-down">
                  <Icon name="error" size={16} className="mt-0.5 flex-none" />
                  {fileError}
                </p>
              )}
              <p className="text-body-sm text-body">
                First row = column names. <b>name</b> and <b>phone</b> are required. Optional: <b>business_name</b>, <b>location</b>, <b>notes</b> and <b>owner_email</b> (the email of the sales person who gets that lead).
              </p>
              <Button variant="secondary" size="sm" icon="download" className="self-start" onClick={downloadTemplate}>
                Download a template
              </Button>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-title-md">2. Who gets the leads</h2>
              <p className="text-body-sm text-body">Rows with an owner_email go to that person. All other rows are shared evenly, in file order, between the people you pick.</p>
              {people.length === 0 ? (
                <p className="text-body-sm text-body">There are no active members in this project yet. Add some first.</p>
              ) : (
                <>
                  <Button variant="tertiary" size="sm" className="self-start px-0" onClick={() => setOwners(owners.length === people.length ? [] : people.map((m) => m.userId))}>
                    {owners.length === people.length ? 'Clear selection' : 'Select everyone'}
                  </Button>
                  <ListGroup>
                    {people.map((m) => (
                      <OwnerRow key={m.userId} member={m} selected={owners.includes(m.userId)} onToggle={() => setOwners((o) => (o.includes(m.userId) ? o.filter((x) => x !== m.userId) : [...o, m.userId]))} />
                    ))}
                  </ListGroup>
                  <p className="text-caption text-muted" aria-live="polite">
                    {owners.length ? `${plural(owners.length, 'person', 'people')} picked` : 'No one picked: every row then needs an owner_email.'}
                  </p>
                </>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-title-md">3. Default location</h2>
              <TextField
                label="Location for rows that have none"
                optional
                value={defaultLocation}
                onChange={(e) => setDefaultLocation(e.target.value)}
                maxLength={100}
                placeholder="e.g. Pune"
                hint="Every lead needs a location. Rows with their own location keep it."
              />
            </section>
          </div>
        ) : step === 'preview' && result ? (
          <Preview result={result} onBack={restart} />
        ) : result ? (
          <Done result={result} projectId={id} onAgain={restart} />
        ) : null}
      </div>
    </Page>
  )
}

function OwnerRow({ member, selected, onToggle }: { member: Member; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn('flex min-h-14 w-full items-center gap-3 border-b border-hairline-soft px-4 py-2 text-left last:border-b-0', selected ? 'bg-surface-strong' : 'active:bg-surface-soft')}
    >
      <span className={cn('flex size-6 flex-none items-center justify-center rounded-full border-2', selected ? 'border-primary bg-primary text-on-primary' : 'border-hairline')}>{selected && <Icon name="checkmark" size={16} />}</span>
      <Avatar name={member.name} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-title-sm">{member.name}</span>
        <span className="block truncate text-caption text-muted">{member.email ?? ROLE_LABEL[member.role]}</span>
      </span>
      {member.role === 'moderator' && <Tag>Moderator</Tag>}
    </button>
  )
}

const reportCsv = (r: ImportResult) =>
  saveCsv('leads-not-imported.csv', ['row', 'kind', 'name', 'phone', 'reason'], r.problems.map((p) => [p.row, p.kind, p.name, p.phone, p.reason]))

function Counts({ result }: { result: ImportResult }) {
  return (
    <div className="flex flex-wrap gap-2">
      {result.duplicates > 0 && <Tag>{plural(result.duplicates, 'duplicate')}</Tag>}
      {result.invalid > 0 && <Tag tone="down">{plural(result.invalid, 'row')} with a problem</Tag>}
    </div>
  )
}

function ByOwner({ result }: { result: ImportResult }) {
  const max = Math.max(1, ...result.byOwner.map((o) => o.count))
  return (
    <ul className="flex flex-col gap-3">
      {result.byOwner.map((o) => (
        <li key={o.user.id} className="flex items-center gap-3">
          <Avatar name={o.user.name} size={32} />
          <span className="w-32 flex-none truncate text-body-sm">{o.user.name}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-strong">
            <span className="block h-full rounded-pill bg-ink" style={{ width: `${(o.count / max) * 100}%` }} />
          </span>
          <span className="w-10 flex-none text-right font-mono text-caption">{o.count}</span>
        </li>
      ))}
    </ul>
  )
}

function Problems({ result }: { result: ImportResult }) {
  if (result.problems.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title-md">Not imported</h2>
        <Button variant="secondary" size="sm" icon="download" onClick={() => reportCsv(result)}>
          Download list
        </Button>
      </div>
      <ul className="overflow-hidden rounded-xl border border-hairline">
        {result.problems.map((p) => (
          <li key={p.row} className="border-b border-hairline-soft px-4 py-3 last:border-b-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-caption text-muted">Row {p.row}</span>
              <span className="text-title-sm">{p.name}</span>
              {p.phone && <span className="font-mono text-caption text-body">{p.phone}</span>}
            </p>
            <p className={cn('text-body-sm', p.kind === 'invalid' ? 'text-down' : 'text-body')}>{p.reason}</p>
          </li>
        ))}
      </ul>
      {result.problemsTruncated && <p className="text-caption text-muted">Showing the first {result.problems.length}. The counts above include every row.</p>}
    </section>
  )
}

function Preview({ result, onBack }: { result: ImportResult; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-hairline p-5">
        <p className="text-title-md" role="status">
          {result.importable === 0 ? 'Nothing in this file can be imported' : `${plural(result.importable, 'lead')} ${result.importable === 1 ? 'is' : 'are'} ready to import`}
        </p>
        <p className="text-body-sm text-body">
          {result.total} {result.total === 1 ? 'row' : 'rows'} in the file. Nothing has been saved yet.
        </p>
        <Counts result={result} />
      </div>

      {result.byOwner.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-md">Who gets them</h2>
          <ByOwner result={result} />
        </section>
      )}

      {result.sample.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-md">First rows</h2>
          <ul className="overflow-hidden rounded-xl border border-hairline">
            {result.sample.map((s) => (
              <li key={s.row} className="flex items-center gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-sm">{s.name}</span>
                  <span className="block truncate text-caption text-body">
                    <span className="font-mono">{formatPhone(s.phone)}</span> · {s.location}
                  </span>
                </span>
                <span className="flex-none text-caption text-muted">{s.owner.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Problems result={result} />

      <Button variant="secondary" className="self-start" onClick={onBack}>
        Choose another file
      </Button>
    </div>
  )
}

function Done({ result, projectId, onAgain }: { result: ImportResult; projectId: string; onAgain: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-xl border border-hairline p-5">
        <Icon name="ok" size={32} className="text-up" />
        <p className="text-title-md" role="status">
          {plural(result.imported, 'lead')} imported
        </p>
        <p className="text-body-sm text-body">
          Each person finds theirs in <b>My leads</b>, as New.
          {result.duplicates + result.invalid > 0 && ` ${plural(result.duplicates + result.invalid, 'row')} ${result.duplicates + result.invalid === 1 ? 'was' : 'were'} skipped.`}
        </p>
        <Counts result={result} />
      </div>
      {result.byOwner.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-md">Who got them</h2>
          <ByOwner result={result} />
        </section>
      )}
      <Problems result={result} />
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="secondary">
          <Link to={`/projects/${projectId}?tab=leads`}>View the project's leads</Link>
        </Button>
        <Button variant="tertiary" onClick={onAgain}>
          Import another file
        </Button>
      </div>
    </div>
  )
}
