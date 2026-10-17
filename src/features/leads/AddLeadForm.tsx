import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { settleOverlays } from '@/hooks/useOverlayHistory'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { ApiError, apiWithMessage } from '@/lib/api'
import { api } from '@/lib/api'
import { formatPhone, normalizePhone } from '@/lib/format'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { LeadDetail, LeadSource, LeadSummary, MeProject, Paginated } from '@/lib/types'
import { dealDefaults, leadSchema, outcomeBody, type LeadValues } from './entrySchema'
import { SourceChoice } from './SourceChoice'
import { FollowUpFields } from './FollowUpFields'
import { LocationField } from './LocationField'
import { invalidateLeadData } from './queries'
import { createStatuses, nextDateRule } from './rules'
import { entryBody, VisitProofField, type VisitProof } from './VisitProof'

const EMPTY: LeadValues = {
  name: '',
  businessName: '',
  phone: '',
  notes: '',
  status: 'new',
  note: '',
  nextFollowUpDate: '',
  location: '',
  source: null,
  reason: null,
  ...dealDefaults(),
}

/** Add lead = client details + first follow-up in one save (PRD §5.5, flow 7.1). */
export function AddLeadForm({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project: MeProject }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const doorToDoor = project.type === 'door_to_door'
  // One id per submission, kept across retries so a double tap saves once (PRD §5.6).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [proof, setProof] = useState<VisitProof | null>(null)
  const [proofError, setProofError] = useState<string>()
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  // A teammate already has this number: the rep may ask for the lead instead of re-adding it.
  const [takenPhone, setTakenPhone] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const form = useForm<LeadValues>({ resolver: zodResolver(leadSchema), mode: 'onBlur', defaultValues: EMPTY })
  const { register, control, handleSubmit, formState, reset, setError, setValue } = form
  // Found while typing: the rep's own lead with this number, so they can open it instead of retyping.
  const [existing, setExisting] = useState<LeadSummary | null>(null)
  const phoneField = register('phone')

  const checkPhone = async (raw: string) => {
    const digits = normalizePhone(raw)
    setExisting(null)
    if (!digits) return
    try {
      const page = await api<Paginated<LeadSummary>>(`/projects/${project.id}/leads`, { query: { search: digits, limit: 1, mine: 'true' } })
      const hit = page.items.find((l) => l.phone === digits)
      if (hit) setExisting(hit)
    } catch {
      // Only a hint; the save still checks duplicates on the server.
    }
  }

  const pickContact = async () => {
    try {
      const [c] = await (
        navigator as unknown as { contacts: { select: (p: string[], o: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> } }
      ).contacts.select(['name', 'tel'], { multiple: false })
      if (!c) return
      if (c.name?.[0]) setValue('name', c.name[0], { shouldDirty: true, shouldValidate: true })
      const tel = c.tel?.find((t) => normalizePhone(t)) ?? c.tel?.[0]
      if (tel) {
        const digits = normalizePhone(tel)
        setValue('phone', digits ? formatPhone(digits) : tel, { shouldDirty: true, shouldValidate: true })
        void checkPhone(tel)
      }
    } catch {
      // Cancelled or not allowed: nothing to do.
    }
  }
  const canPickContact = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window

  useEffect(() => {
    if (!open) return
    reset(EMPTY)
    setRequestId(crypto.randomUUID())
    setProof(null)
    setProofError(undefined)
    setDuplicateOf(null)
    setExisting(null)
    setTakenPhone(null)
  }, [open, reset])

  const onSubmit = handleSubmit(async (v) => {
    if (doorToDoor && !proof) {
      setProofError('Take a photo of the visit to save it.')
      haptic.error()
      return
    }
    setDuplicateOf(null)
    try {
      const fields = {
        clientRequestId: requestId,
        businessName: v.businessName.trim(),
        name: v.name.trim() || undefined,
        phone: normalizePhone(v.phone) ?? v.phone,
        notes: v.notes.trim() || undefined,
        status: v.status ?? undefined,
        note: v.note.trim(),
        nextFollowUpDate: nextDateRule(v.status) === 'hidden' ? undefined : v.nextFollowUpDate || undefined,
        location: v.location.trim().replace(/\s+/g, ' '),
        source: v.source ?? undefined,
        ...outcomeBody(v, { dealAlways: true }),
      }
      const { data, message } = await apiWithMessage<LeadDetail>(`/projects/${project.id}/leads`, { method: 'POST', body: entryBody(fields, doorToDoor ? proof : null) })
      haptic.success()
      toast.success(message)
      invalidateLeadData(qc)
      qc.setQueryData(['leads', 'detail', data.id], data)
      onOpenChange(false)
      await settleOverlays()
      navigate(`/leads/${data.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_LEAD_OWN') {
        setError('phone', { message: err.message })
        setDuplicateOf(String(err.details?.leadId ?? ''))
        haptic.error()
        return
      }
      if (err instanceof ApiError && err.code === 'DUPLICATE_LEAD_OTHER') {
        setError('phone', { message: err.message })
        if (err.details?.canRequest) setTakenPhone(normalizePhone(v.phone) ?? v.phone)
        haptic.error()
        return
      }
      if (err instanceof ApiError && (err.code === 'CAPTURE_EXPIRED' || err.code === 'VISIT_PROOF_REQUIRED')) {
        setProof(null)
        setProofError(err.message)
        haptic.error()
        return
      }
      handleFormError(err, setError, ['name', 'businessName', 'phone', 'notes', 'status', 'note', 'nextFollowUpDate', 'location', 'source', 'reason', 'planCode', 'dealTenureMonths', 'dealValue', 'discountType', 'discountValue', 'couponCode'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Add lead"
      description={project.name}
      variant="form"
      dirty={(formState.isDirty || !!proof) && !formState.isSubmitting}
      footer={
        <Button type="submit" form="add-lead" size="lg" block loading={formState.isSubmitting}>
          Save lead
        </Button>
      }
    >
      <form id="add-lead" onSubmit={onSubmit} noValidate className="flex flex-col gap-8 pt-2">
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-4 flex w-full items-center justify-between gap-3 text-caption-strong text-muted uppercase">
            Client
            {canPickContact && (
              <Button type="button" variant="secondary" size="sm" icon="contacts" onClick={pickContact} className="normal-case">
                Pick from contacts
              </Button>
            )}
          </legend>
          <TextField
            label="Shop or business name"
            autoComplete="organization"
            autoCapitalize="words"
            enterKeyHint="next"
            error={formState.errors.businessName?.message}
            {...register('businessName')}
          />
          <TextField label="Owner or manager name" optional autoComplete="off" autoCapitalize="words" enterKeyHint="next" error={formState.errors.name?.message} {...register('name')} />
          <div className="flex flex-col gap-1.5">
            <TextField
              label="Phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              prefix="+91"
              enterKeyHint="next"
              error={formState.errors.phone?.message}
              {...phoneField}
              onBlur={(e) => {
                void phoneField.onBlur(e)
                void checkPhone(e.target.value)
              }}
            />
            {existing && !duplicateOf && (
              <p className="flex flex-wrap items-center gap-x-2 rounded-md bg-accent-yellow/15 px-3 py-2 text-body-sm text-ink">
                You already have this number: <strong>{existing.name}</strong>
                <button
                  type="button"
                  className="font-semibold text-primary"
                  onClick={async () => {
                    onOpenChange(false)
                    await settleOverlays()
                    navigate(`/leads/${existing.id}`)
                  }}
                >
                  Open lead
                </button>
              </p>
            )}
            {takenPhone && (
              <Button type="button" variant="soft" size="sm" icon="swap" className="self-start" onClick={() => setAsking(true)}>
                Ask for this lead
              </Button>
            )}
            {duplicateOf && (
              <Link
                to={`/leads/${duplicateOf}`}
                className="text-body-sm font-semibold text-primary"
                onClick={async (e) => {
                  // Close the sheet and let its history entry go before navigating, or the two collide.
                  e.preventDefault()
                  onOpenChange(false)
                  await settleOverlays()
                  navigate(`/leads/${duplicateOf}`, { viewTransition: true })
                }}
              >
                Open that lead
              </Link>
            )}
          </div>
          <Controller
            control={control}
            name="location"
            render={({ field }) => (
              <LocationField projectId={project.id} value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={formState.errors.location?.message} />
            )}
          />
          <TextAreaField label="About the client" optional placeholder="Anything worth remembering" error={formState.errors.notes?.message} {...register('notes')} rows={2} />
          <Controller control={control} name="source" render={({ field }) => <SourceChoice value={(field.value as LeadSource | null) ?? null} onChange={field.onChange} />} />
        </fieldset>

        {doorToDoor && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-4 text-caption-strong text-muted uppercase">Visit proof</legend>
            <VisitProofField value={proof} onChange={(p) => (setProof(p), setProofError(undefined))} error={proofError} />
            {proofError && <p className="text-caption text-down">{proofError}</p>}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-5">
          <legend className="mb-4 text-caption-strong text-muted uppercase">First follow-up</legend>
          <FollowUpFields projectId={project.id} statuses={createStatuses()} control={control} register={register} errors={formState.errors} showLocation={false} dealAlways />
        </fieldset>
      </form>
      {takenPhone && (
        <AskForLead
          open={asking}
          onOpenChange={setAsking}
          projectId={project.id}
          phone={takenPhone}
          onSent={async () => {
            onOpenChange(false)
            await settleOverlays()
          }}
        />
      )}
    </ResponsiveOverlay>
  )
}

/** Ask a moderator to move a teammate's lead (same phone) to you, with a reason. */
function AskForLead({
  open,
  onOpenChange,
  projectId,
  phone,
  onSent,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projectId: string
  phone: string
  onSent: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try {
      await apiWithMessage(`/projects/${projectId}/leads/request-by-phone`, { method: 'POST', body: { phone, reason: reason.trim() } })
      haptic.success()
      toast.success('Request sent. Your sales manager decides, and you get a notification.')
      onOpenChange(false)
      await onSent()
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title="Ask for this lead"
      description={`+91 ${formatPhone(phone)} belongs to a teammate. A sales manager decides.`}
      variant="short"
      footer={
        <Button size="lg" block loading={busy} disabled={reason.trim().length < 3} onClick={() => void send()}>
          Send request
        </Button>
      }
    >
      <div className="pt-1">
        <TextAreaField
          label="Why should it be yours?"
          placeholder="e.g. The owner called me directly; I visited them today."
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </ResponsiveOverlay>
  )
}
