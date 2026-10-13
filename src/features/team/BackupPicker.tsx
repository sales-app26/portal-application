import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChoiceList } from '@/components/ui/Choice'
import { Avatar } from '@/components/ui/Display'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import type { Member } from '@/lib/types'
import { invalidateTeam } from './queries'

const NONE = '__none__'

/** Pick who covers this member's follow-ups in this project while they are on leave. */
export function BackupPicker({
  projectId,
  member,
  members,
  open,
  onOpenChange,
}: {
  projectId: string
  member: Member
  members: Member[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const candidates = members.filter((m) => m.isActive && m.userIsActive && m.userId !== member.userId && m.role !== 'super_admin')

  const pick = async (value: string) => {
    try {
      await apiWithMessage(`/projects/${projectId}/members/${member.userId}/backup`, { method: 'PUT', body: { backupUserId: value === NONE ? null : value } })
      haptic.success()
      toast.success(value === NONE ? `${member.name} has no backup now.` : `${candidates.find((c) => c.userId === value)?.name} now covers for ${member.name}.`)
      invalidateTeam(qc)
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'members'] })
      onOpenChange(false)
    } catch (err) {
      handleFormError(err)
    }
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange} title={`Backup for ${member.name}`} description="Covers their follow-ups when they're on leave." variant="choice">
      <ChoiceList
        label="Backup"
        value={member.backup?.id ?? NONE}
        onSelect={(v) => void pick(v)}
        options={[
          { value: NONE, label: 'No backup' },
          ...candidates.map((c) => ({
            value: c.userId,
            label: c.name,
            description: c.role === 'moderator' ? 'Manager' : undefined,
            leading: <Avatar name={c.name} size={32} />,
          })),
        ]}
      />
    </ResponsiveOverlay>
  )
}
