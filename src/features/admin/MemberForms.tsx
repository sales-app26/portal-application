import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Choice'
import { Avatar } from '@/components/ui/Display'
import { FieldShell, TextAreaField, TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { Picker } from '@/components/ui/Picker'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import { ROLE_LABEL } from '@/lib/format'
import type { Member, TargetPeriod } from '@/lib/types'
import { invalidateProjects, projectMembersKey, useUserOptions } from './queries'

/** Target number and period are set together or cleared together (PRD §5.4). */
function TargetFields({ count, period, onCount, onPeriod, error }: { count: string; period: TargetPeriod; onCount: (v: string) => void; onPeriod: (p: TargetPeriod) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <TextField label="Target" optional inputMode="numeric" value={count} onChange={(e) => onCount(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Converted leads, e.g. 20" error={error} hint="Leave empty for no target." />
      <FieldShell label="Per" htmlFor="target-period">
        <div id="target-period">
          <Segmented<TargetPeriod>
            label="Period"
            value={period}
            onChange={onPeriod}
            options={[
              { value: 'weekly', label: 'Week' },
              { value: 'monthly', label: 'Month' },
            ]}
            className="w-full"
          />
        </div>
      </FieldShell>
    </div>
  )
}

function targetBody(count: string, period: TargetPeriod) {
  const n = count ? Number(count) : null
  return { targetCount: n, targetPeriod: n ? period : null }
}

const invalid = (count: string) => (count !== '' && (Number(count) < 1 || Number(count) > 100000) ? 'Enter a whole number from 1 to 100000.' : undefined)

export function SetTargetForm({ projectId, member, open, onOpenChange }: { projectId: string; member: Member; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [count, setCount] = useState('')
  const [period, setPeriod] = useState<TargetPeriod>('weekly')
  const [busy, setBusy] = useState(false)
  const error = invalid(count)

  useEffect(() => {
    if (!open) return
    setCount(member.targetCount ? String(member.targetCount) : '')
    setPeriod(member.targetPeriod ?? 'weekly')
  }, [open, member])

  const save = async () => {
    if (error) return
    setBusy(true)
    try {
      const { message } = await apiWithMessage(`/projects/${projectId}/members/${member.userId}/target`, { method: 'PATCH', body: targetBody(count, period) })
      haptic.success()
      toast.success(message)
      void qc.invalidateQueries({ queryKey: projectMembersKey(projectId) })
      invalidateProjects(qc)
      onOpenChange(false)
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
      title="Set target"
      description={`${member.name}. The new target applies to the current period straight away.`}
      variant="short"
      footer={
        <Button size="lg" block loading={busy} disabled={!!error} onClick={() => void save()}>
          Save target
        </Button>
      }
    >
      <div className="pt-1">
        <TargetFields count={count} period={period} onCount={setCount} onPeriod={setPeriod} error={error} />
      </div>
    </ResponsiveOverlay>
  )
}

export function AddMemberForm({ projectId, members, canAddModerators, open, onOpenChange }: { projectId: string; members: Member[]; canAddModerators: boolean; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const people = useUserOptions({ isActive: true }, open)
  const [userId, setUserId] = useState<string | null>(null)
  const [count, setCount] = useState('')
  const [period, setPeriod] = useState<TargetPeriod>('weekly')
  const [busy, setBusy] = useState(false)
  const [pickError, setPickError] = useState<string>()
  const error = invalid(count)

  useEffect(() => {
    if (!open) return
    setUserId(null)
    setCount('')
    setPeriod('weekly')
    setPickError(undefined)
  }, [open])

  // Already active members and Super Admins are not offered; moderators only for the Super Admin.
  const inProject = new Set(members.filter((m) => m.isActive).map((m) => m.userId))
  const candidates = (people.data ?? []).filter((u) => !inProject.has(u.id) && u.role !== 'super_admin' && (canAddModerators || u.role === 'sales_person'))

  const save = async () => {
    if (!userId) return setPickError('Choose a person.')
    if (error) return
    setBusy(true)
    try {
      const n = targetBody(count, period)
      const { message } = await apiWithMessage(`/projects/${projectId}/members`, { method: 'POST', body: { userId, ...(n.targetCount ? n : {}) } })
      haptic.success()
      toast.success(message)
      void qc.invalidateQueries({ queryKey: projectMembersKey(projectId) })
      invalidateProjects(qc)
      onOpenChange(false)
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
      title="Add member"
      variant="form"
      dirty={(!!userId || !!count) && !busy}
      footer={
        <Button size="lg" block loading={busy} onClick={() => void save()}>
          Add to project
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <Picker
          label="Person"
          value={userId}
          onChange={(v) => (setUserId(v), setPickError(undefined))}
          placeholder={people.isLoading ? 'Loading people…' : candidates.length ? 'Choose a person' : 'No one left to add'}
          error={pickError}
          options={candidates.map((u) => ({ value: u.id, label: u.name, description: `${ROLE_LABEL[u.role]} · ${u.email}`, leading: <Avatar name={u.name} size={32} /> }))}
        />
        <TargetFields count={count} period={period} onCount={setCount} onPeriod={setPeriod} error={error} />
      </div>
    </ResponsiveOverlay>
  )
}

/** Move leads to another active member with a reason; one lead or many (PRD §5.10). */
export function ReassignForm({ projectId, leadIds, members, open, onOpenChange, onDone, excludeUserId }: { projectId: string; leadIds: string[]; members: Member[]; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; /** The current owner, who can't be the recipient. */ excludeUserId?: string }) {
  const qc = useQueryClient()
  const [toUserId, setToUserId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ to?: string; reason?: string }>({})

  useEffect(() => {
    if (!open) return
    setToUserId(null)
    setReason('')
    setErrors({})
  }, [open])

  const save = async () => {
    const e = { to: toUserId ? undefined : 'Choose who should get these leads.', reason: reason.trim() ? undefined : 'Give a reason.' }
    setErrors(e)
    if (e.to || e.reason) return
    setBusy(true)
    try {
      // One lead goes through the single endpoint, many through the bulk one (api-contract §3).
      const single = leadIds.length === 1
      const { data } = await apiWithMessage<{ reassigned: number; skipped: number }>(single ? `/leads/${leadIds[0]}/reassign` : `/projects/${projectId}/leads/reassign`, {
        method: 'POST',
        body: single ? { toUserId, reason: reason.trim() } : { toUserId, reason: reason.trim(), leadIds },
      })
      haptic.success()
      toast.success(data.skipped ? `${data.reassigned} reassigned, ${data.skipped} skipped.` : `${data.reassigned} ${data.reassigned === 1 ? 'lead' : 'leads'} reassigned.`)
      void qc.invalidateQueries({ queryKey: ['leads'] })
      void qc.invalidateQueries({ queryKey: ['transfers'] })
      onDone()
      onOpenChange(false)
    } catch (err) {
      handleFormError(err)
    } finally {
      setBusy(false)
    }
  }

  const active = members.filter((m) => m.isActive && m.userIsActive && m.role !== 'super_admin' && m.userId !== excludeUserId)
  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={`Reassign ${leadIds.length} ${leadIds.length === 1 ? 'lead' : 'leads'}`}
      description="Earlier history keeps the original person's name."
      variant="short"
      dirty={(!!toUserId || !!reason) && !busy}
      footer={
        <Button size="lg" block loading={busy} onClick={() => void save()}>
          Reassign
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        <Picker label="Reassign to" value={toUserId} onChange={(v) => (setToUserId(v), setErrors((x) => ({ ...x, to: undefined })))} placeholder="Choose a person" error={errors.to} options={active.map((m) => ({ value: m.userId, label: m.name, description: ROLE_LABEL[m.role], leading: <Avatar name={m.name} size={32} /> }))} />
        <TextAreaField label="Reason" value={reason} onChange={(e) => (setReason(e.target.value), setErrors((x) => ({ ...x, reason: undefined })))} maxLength={500} error={errors.reason} />
      </div>
    </ResponsiveOverlay>
  )
}
