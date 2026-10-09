import { Picker } from '@/components/ui/Picker'
import { Icon } from '@/icons'
import { useProject } from './ProjectContext'

/** Top-bar project picker (UX-COMPONENTS.md §5.1). Hidden when there is only one project. */
export function ProjectSwitcher() {
  const { projects, project, setProjectId } = useProject()
  if (!project) return null
  if (projects.length < 2)
    return <span className="block truncate text-title-sm">{project.name}</span>

  return (
    <Picker
      label="Project"
      value={project.id}
      onChange={setProjectId}
      options={projects.map((p) => ({
        value: p.id,
        label: p.name,
        description: [p.type === 'door_to_door' ? 'Door-to-door' : 'Online', p.status === 'closed' ? 'Closed' : null].filter(Boolean).join(' · '),
      }))}
      trigger={({ open }) => (
        <button type="button" onClick={open} className="pressable flex h-11 max-w-[60vw] items-center gap-1 rounded-pill px-2 -ml-2 active:bg-surface-strong medium:max-w-xs" aria-label={`Project: ${project.name}. Change project`}>
          <span className="truncate text-title-sm">{project.name}</span>
          <Icon name="expand-arrow" size={16} className="flex-none text-muted" />
        </button>
      )}
    />
  )
}
