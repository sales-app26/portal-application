import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Page } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Avatar, EmptyState, ErrorState, Skeleton, Tag } from '@/components/ui/Display'
import { TextField } from '@/components/ui/Field'
import { ListGroup } from '@/components/ui/ListRow'
import { Picker } from '@/components/ui/Picker'
import { invalidateProjects, useProjectDetail, useProjectMembers } from '@/features/admin/queries'
import { Icon } from '@/icons'
import { ApiError, apiWithMessage } from '@/lib/api'
import { cn } from '@/lib/cn'
import { saveCsv } from '@/lib/download'
import { formatPhone, plural, ROLE_LABEL } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import type { ImportResult, Member } from '@/lib/types'

const MAX_BYTES = 1024 * 1024
// The business first: it is the only one required. `phone` and `name` (the owner or manager) are optional.
const COLUMNS = ['business_name', 'phone', 'name', 'location', 'notes', 'owner_email']

type Step = 'form' | 'preview' | 'done'
/**
 * review: check the file, then pick a person per lead on screen (or leave some for later).
 * single: the whole file goes to one person.
 * later: add them now, assign later from the campaign's Not assigned leads.
 */
type Mode = 'review' | 'single' | 'later'

const downloadTemplate = () =>
  saveCsv('leads-sample-sheet.csv', COLUMNS, [
    ['Patil General Store', '98765 43210', 'Asha Patil', 'Wanowrie', 'Likes calls after 4 pm', ''],
    ['Shaikh Bakers', '9123456780', '', 'Kondhwa', '', 'priya@yourcompany.com'],
    ['Joshi Medicals', '', '', 'Kondhwa', 'No number yet', ''],
  ])

/**
 * Bulk import from a CSV (admins). Three ways to hand leads out:
 * - review: check the file, see every lead, assign them on screen (one by one or in bulk), then import;
 *   any left unpicked go in unassigned;
 * - single: the whole file goes to one person;
 * - later: add them all unassigned (except rows whose owner_email names someone), to hand out later.
 * Nothing is saved until the last step, and a file can be run twice safely.
 */
export function ImportLeadsPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const project = useProjectDetail(id)
  const members = useProjectMembers(id)
  const fileInput = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('form')
  // From a member's menu: the whole file goes to them.
  const [params] = useSearchParams()
  const preset = params.get('owner')
  const [mode, setMode] = useState<Mode>(preset ? 'single' : 'review')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string>()
  const [defaultLocation, setDefaultLocation] = useState('')
  const [single, setSingle] = useState<string | null>(preset)
  /** File row number → member id, for the review. */
  const [assignments, setAssignments] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const back = `/projects/${id}?tab=leads`
  const people = (members.data ?? []).filter((m) => m.isActive && m.userIsActive && m.role !== 'super_admin')
  const closed = project.data?.status === 'closed'

  const choose = (f: File | undefined) => {
    setFileError(undefined)
    if (!f) return setFile(null)
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setFileError('Save your sheet as CSV first. In Excel: Save As › CSV (Comma delimited).')
    if (f.size > MAX_BYTES) return setFileError('The sheet is over 1 MB. Split it into sheets of at most 1,000 leads.')
    setFile(f)
  }

  const run = async (dryRun: boolean) => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (defaultLocation.trim()) fd.append('defaultLocation', defaultLocation.trim())
      if (mode === 'single' && single) fd.append('ownerId', single)
      if (mode === 'review') {
        if (dryRun) fd.append('review', 'true')
        else fd.append('assignments', JSON.stringify(assignments))
      }
      fd.append('dryRun', String(dryRun))
      const { data } = await apiWithMessage<ImportResult>(`/projects/${id}/leads/import`, { method: 'POST', body: fd })
      setResult(data)
      if (dryRun) {
        // Start from the file's own owner_email column, where it names someone.
        if (mode === 'review') setAssignments(Object.fromEntries(data.rows.filter((r) => r.owner).map((r) => [r.row, r.owner!.id])))
        setStep('preview')
      } else {
        haptic.success()
        toast.success(`${plural(data.imported, 'lead')} added.`)
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
      if (err instanceof ApiError && err.status === 400 && step === 'form') setFileError(message)
      else toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const restart = () => {
    setStep('form')
    setResult(null)
    setAssignments({})
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const importable = result?.importable ?? 0

  const cta =
    step === 'form'
      ? {
          label: 'Check sheet',
          icon: 'checkmark' as const,
          onClick: () => void run(true),
          disabled: !file || closed || (mode === 'single' && !single),
          loading: busy,
        }
      : step === 'preview'
        ? {
            label: !importable ? 'Nothing to add' : `Add ${plural(importable, 'lead')}`,
            icon: 'download' as const,
            onClick: () => void run(false),
            disabled: !importable,
            loading: busy,
          }
        : { label: 'View leads', icon: 'contacts' as const, onClick: () => navigate(back) }

  return (
    <Page title="Add leads from a sheet" back={back} cta={project.data && !closed && cta ? { ...cta, bar: true } : undefined}>
      <div className="expanded:max-w-[720px]">
        {project.isLoading || members.isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : project.isError ? (
          <ErrorState message={project.error.message} onRetry={() => void project.refetch()} />
        ) : closed ? (
          <EmptyState icon="lock" title="This campaign is closed" body="Leads can't be added to a closed campaign." />
        ) : step === 'form' ? (
          <div className="flex flex-col gap-8">
            <p className="text-body-md text-body">
              Add many leads at once from an Excel or CSV sheet. They start as <b>New</b> in <b>{project.data?.name}</b>, and each person finds theirs in My leads.
            </p>

            <section className="flex flex-col gap-3">
              <h2 className="text-title-md">1. Who gets the leads</h2>
              <ListGroup>
                <ModeRow
                  selected={mode === 'review'}
                  onSelect={() => setMode('review')}
                  title="I'll assign them after checking"
                  body="See every lead in the sheet, then pick a person for each one, or for many at once."
                />
                <ModeRow selected={mode === 'single'} onSelect={() => setMode('single')} title="All to one person" body="Every lead in the sheet goes to the person you pick." />
                <ModeRow
                  selected={mode === 'later'}
                  onSelect={() => setMode('later')}
                  title="Assign later"
                  body="Add the leads now. They wait under Not assigned in the campaign's leads until you hand them out."
                />
              </ListGroup>
              {mode === 'single' &&
                (people.length === 0 ? (
                  <p className="text-body-sm text-body">No one is on this campaign's team yet. Add people first.</p>
                ) : (
                  <ListGroup>
                    {people.map((m) => (
                      <OwnerRow key={m.userId} member={m} selected={single === m.userId} onToggle={() => setSingle(m.userId)} />
                    ))}
                  </ListGroup>
                ))}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-title-md">2. The sheet</h2>
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
                  <span className="block truncate text-title-sm">{file ? file.name : 'Choose your sheet'}</span>
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
                Put these headings on the top line, then one lead on each line below. Only <b>business_name</b> is needed. You can also add <b>phone</b> (leave it empty if you
                don't have the number yet), <b>name</b> (the owner or manager, if you know it),{' '}
                <b>location</b>, <b>notes</b>
                {mode === 'review' && (
                  <>
                    {' '}
                    and <b>owner_email</b> (fills in who gets that lead; you can still change it)
                  </>
                )}
                {mode === 'later' && (
                  <>
                    {' '}
                    and <b>owner_email</b> (that lead goes straight to that person)
                  </>
                )}
                .
              </p>
              <Button variant="secondary" size="sm" icon="download" className="self-start" onClick={downloadTemplate}>
                Download a sample sheet
              </Button>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-title-md">3. Location for the rest</h2>
              <TextField
                label="Location for leads that have none"
                optional
                value={defaultLocation}
                onChange={(e) => setDefaultLocation(e.target.value)}
                maxLength={100}
                placeholder="e.g. Pune"
                hint="Every lead needs a location. Leads with their own location keep it."
              />
            </section>
          </div>
        ) : step === 'preview' && result ? (
          mode === 'review' ? (
            <AssignStep result={result} people={people} assignments={assignments} onChange={setAssignments} onBack={restart} />
          ) : (
            <Preview result={result} onBack={restart} />
          )
        ) : result ? (
          <Done result={result} projectId={id} onAgain={restart} />
        ) : null}
      </div>
    </Page>
  )
}

function ModeRow({ selected, onSelect, title, body }: { selected: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-14 w-full items-start gap-3 border-b border-hairline-soft px-4 py-3 text-left last:border-b-0',
        selected ? 'bg-surface-strong' : 'active:bg-surface-soft',
      )}
    >
      <span
        className={cn('mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border-2', selected ? 'border-primary bg-primary text-on-primary' : 'border-hairline')}
      >
        {selected && <Icon name="checkmark" size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-title-sm">{title}</span>
        <span className="block text-body-sm text-body">{body}</span>
      </span>
    </button>
  )
}

const EVERYONE = '__everyone__'

/** The review: every importable lead with its person, assigned one by one or in bulk. */
function AssignStep({
  result,
  people,
  assignments,
  onChange,
  onBack,
}: {
  result: ImportResult
  people: Member[]
  assignments: Record<number, string>
  onChange: (next: Record<number, string>) => void
  onBack: () => void
}) {
  const [picked, setPicked] = useState<number[]>([])
  const rows = result.rows
  const names = new Map(people.map((m) => [m.userId, m.name]))
  const unassigned = rows.filter((r) => !assignments[r.row])
  const allPicked = rows.length > 0 && picked.length === rows.length

  const options = people.map((m) => ({ value: m.userId, label: m.name, description: m.email ?? ROLE_LABEL[m.role], leading: <Avatar name={m.name} size={32} /> }))
  const bulkOptions =
    people.length > 1 ? [{ value: EVERYONE, label: 'Share evenly between everyone', description: `${people.length} people, in sheet order` }, ...options] : options

  const assign = (target: number[], userId: string) => {
    const next = { ...assignments }
    target.forEach((row, i) => (next[row] = userId === EVERYONE ? people[i % people.length].userId : userId))
    onChange(next)
    setPicked([])
  }
  const toggle = (row: number) => setPicked((p) => (p.includes(row) ? p.filter((x) => x !== row) : [...p, row]))

  const counts = new Map<string, number>()
  for (const r of rows) if (assignments[r.row]) counts.set(assignments[r.row], (counts.get(assignments[r.row]) ?? 0) + 1)
  const byOwner = [...counts.entries()].map(([id, count]) => ({ user: { id, name: names.get(id) ?? 'Unknown' }, count })).sort((a, b) => b.count - a.count)

  if (rows.length === 0) return <Preview result={result} onBack={onBack} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 card card--default rounded-2xl p-5">
        <p className="text-title-md" role="status">
          {plural(rows.length, 'lead')} ready · {unassigned.length ? `${unassigned.length} not assigned yet` : 'all assigned'}
        </p>
        <p className="text-body-sm text-body">
          {result.total} {result.total === 1 ? 'line' : 'lines'} in the sheet. Pick leads, then choose who gets them. Nothing is saved until you add them.
          {unassigned.length > 0 && ' Leads you leave unassigned are added too, under Not assigned, to hand out later.'}
        </p>
        <Counts result={result} />
        {byOwner.length > 0 && <ByOwner result={{ ...result, byOwner }} />}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="tertiary" size="sm" className="px-0" onClick={() => setPicked(allPicked ? [] : rows.map((r) => r.row))}>
            {allPicked ? 'Clear selection' : 'Select all'}
          </Button>
          {unassigned.length > 0 && unassigned.length < rows.length && (
            <Button variant="tertiary" size="sm" onClick={() => setPicked(unassigned.map((r) => r.row))}>
              Select unassigned ({unassigned.length})
            </Button>
          )}
          <span className="flex-1" />
          <Picker
            label={`Assign ${plural(picked.length, 'lead')} to`}
            value={null}
            options={bulkOptions}
            onChange={(v) => assign(picked, v)}
            trigger={({ open }) => (
              <Button size="sm" icon="contacts" disabled={picked.length === 0} onClick={open}>
                {picked.length ? `Assign ${picked.length}` : 'Assign'}
              </Button>
            )}
          />
        </div>

        <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
          {rows.map((r) => {
            const selected = picked.includes(r.row)
            const owner = assignments[r.row]
            return (
              <li key={r.row} className={cn('flex items-center gap-3 border-b border-hairline-soft px-4 py-2 last:border-b-0', selected && 'bg-surface-strong')}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  aria-label={`Select ${r.businessName}`}
                  onClick={() => toggle(r.row)}
                  className={cn(
                    'flex size-6 flex-none items-center justify-center rounded-full border-2',
                    selected ? 'border-primary bg-primary text-on-primary' : 'border-hairline',
                  )}
                >
                  {selected && <Icon name="checkmark" size={16} />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-sm">{r.businessName}</span>
                  <span className="block truncate text-caption text-body">
                    {r.phone ? <span className="tabular-nums">{formatPhone(r.phone)}</span> : 'No phone'} · {r.location}
                    {r.name && ` · ${r.name}`}
                  </span>
                </span>
                <Picker
                  label={`Who gets ${r.businessName}`}
                  value={owner ?? null}
                  options={options}
                  onChange={(v) => onChange({ ...assignments, [r.row]: v })}
                  trigger={({ open }) => (
                    <button
                      type="button"
                      onClick={open}
                      className={cn(
                        'flex h-9 max-w-40 flex-none items-center gap-1 rounded-pill border px-3 text-caption-strong',
                        owner ? 'border-hairline' : 'border-dashed border-down text-down',
                      )}
                    >
                      <span className="truncate">{owner ? (names.get(owner) ?? 'Unknown') : 'Assign'}</span>
                      <Icon name="expand-arrow" size={16} className="flex-none" />
                    </button>
                  )}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <Problems result={result} />

      <Button variant="secondary" className="self-start" onClick={onBack}>
        Choose another sheet
      </Button>
    </div>
  )
}

function OwnerRow({ member, selected, onToggle }: { member: Member; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 border-b border-hairline-soft px-4 py-2 text-left last:border-b-0',
        selected ? 'bg-surface-strong' : 'active:bg-surface-soft',
      )}
    >
      <span className={cn('flex size-6 flex-none items-center justify-center rounded-full border-2', selected ? 'border-primary bg-primary text-on-primary' : 'border-hairline')}>
        {selected && <Icon name="checkmark" size={16} />}
      </span>
      <Avatar name={member.name} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-title-sm">{member.name}</span>
        <span className="block truncate text-caption text-muted">{member.email ?? ROLE_LABEL[member.role]}</span>
      </span>
      {member.role === 'moderator' && <Tag>Manager</Tag>}
    </button>
  )
}

const reportCsv = (r: ImportResult) =>
  saveCsv(
    'leads-not-added.csv',
    ['row', 'kind', 'lead', 'phone', 'reason'],
    r.problems.map((p) => [p.row, p.kind, p.name, p.phone, p.reason]),
  )

function Counts({ result }: { result: ImportResult }) {
  return (
    <div className="flex flex-wrap gap-2">
      {result.duplicates > 0 && <Tag>{plural(result.duplicates, 'duplicate')}</Tag>}
      {result.invalid > 0 && <Tag tone="down">{plural(result.invalid, 'line')} with a problem</Tag>}
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
          <span className="w-10 flex-none text-right tabular-nums text-caption">{o.count}</span>
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
        <h2 className="text-title-md">Not added</h2>
        <Button variant="secondary" size="sm" icon="download" onClick={() => reportCsv(result)}>
          Download list
        </Button>
      </div>
      <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
        {result.problems.map((p) => (
          <li key={p.row} className="border-b border-hairline-soft px-4 py-3 last:border-b-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-caption text-muted">Line {p.row}</span>
              <span className="text-title-sm">{p.name}</span>
              {p.phone && <span className="tabular-nums text-caption text-body">{p.phone}</span>}
            </p>
            <p className={cn('text-body-sm', p.kind === 'invalid' ? 'text-down' : 'text-body')}>{p.reason}</p>
          </li>
        ))}
      </ul>
      {result.problemsTruncated && <p className="text-caption text-muted">Showing the first {result.problems.length}. The counts above include every line.</p>}
    </section>
  )
}

function Preview({ result, onBack }: { result: ImportResult; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 card card--default rounded-2xl p-5">
        <p className="text-title-md" role="status">
          {result.importable === 0 ? 'Nothing in this sheet can be added' : `${plural(result.importable, 'lead')} ${result.importable === 1 ? 'is' : 'are'} ready to add`}
        </p>
        <p className="text-body-sm text-body">
          {result.total} {result.total === 1 ? 'line' : 'lines'} in the sheet. Nothing has been saved yet.
          {result.unassigned > 0 && ` ${plural(result.unassigned, 'lead')} will wait under Not assigned until you hand ${result.unassigned === 1 ? 'it' : 'them'} out.`}
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
          <h2 className="text-title-md">First few leads</h2>
          <ul className="card card--default gap-0 overflow-hidden rounded-2xl p-0">
            {result.sample.map((s) => (
              <li key={s.row} className="flex items-center gap-3 border-b border-hairline-soft px-4 py-3 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-sm">{s.businessName}</span>
                  <span className="block truncate text-caption text-body">
                    {s.phone ? <span className="tabular-nums">{formatPhone(s.phone)}</span> : 'No phone'} · {s.location}
                    {s.name && ` · ${s.name}`}
                  </span>
                </span>
                <span className="flex-none text-caption text-muted">{s.owner?.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Problems result={result} />

      <Button variant="secondary" className="self-start" onClick={onBack}>
        Choose another sheet
      </Button>
    </div>
  )
}

function Done({ result, projectId, onAgain }: { result: ImportResult; projectId: string; onAgain: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 card card--default rounded-2xl p-5">
        <Icon name="ok" size={32} className="text-up" />
        <p className="text-title-md" role="status">
          {plural(result.imported, 'lead')} added
        </p>
        <p className="text-body-sm text-body">
          {result.unassigned < result.imported && <>Each person finds theirs in <b>My leads</b>, as New. </>}
          {result.unassigned > 0 && (
            <>
              {plural(result.unassigned, 'lead')} {result.unassigned === 1 ? 'is' : 'are'} waiting under <b>Not assigned</b> in the campaign's leads: tap Select, pick them and{' '}
              tap <b>Assign</b> to hand them out.
            </>
          )}
          {result.duplicates + result.invalid > 0 && ` ${plural(result.duplicates + result.invalid, 'line')} ${result.duplicates + result.invalid === 1 ? 'was' : 'were'} skipped.`}
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
          <Link to={`/projects/${projectId}?tab=leads`}>View the campaign's leads</Link>
        </Button>
        <Button variant="tertiary" onClick={onAgain}>
          Add another sheet
        </Button>
      </div>
    </div>
  )
}
