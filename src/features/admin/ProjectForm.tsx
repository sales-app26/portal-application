import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { settleOverlays } from '@/hooks/useOverlayHistory'
import { Segmented } from '@/components/ui/Choice'
import { DatePicker } from '@/components/ui/DatePicker'
import { FieldShell, TextAreaField, TextField } from '@/components/ui/Field'
import { ResponsiveOverlay } from '@/components/ui/Overlay'
import { apiWithMessage } from '@/lib/api'
import { handleFormError } from '@/lib/forms'
import { haptic } from '@/lib/haptics'
import { todayIST } from '@/lib/format'
import type { Project, ProjectType } from '@/lib/types'
import { invalidateProjects } from './queries'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter a project name.').max(120),
    description: z.string().trim().max(2000),
    type: z.enum(['online', 'door_to_door']),
    startDate: z.string().min(1, 'Choose a start date.'),
    endDate: z.string(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'The end date must be on or after the start date.' })
type Values = z.input<typeof schema>

const MAX_IMAGE = 2 * 1024 * 1024

/** Create (no `project`) or edit a project. Super Admin only (PRD §5.3). */
export function ProjectForm({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project?: Project }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string>()
  const editing = !!project
  const typeLocked = !!project?.typeLocked

  const defaults = (): Values => ({ name: project?.name ?? '', description: project?.description ?? '', type: project?.type ?? 'online', startDate: project?.startDate ?? todayIST(), endDate: project?.endDate ?? '' })
  const { register, control, handleSubmit, formState, reset, setError } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur', defaultValues: defaults() })

  useEffect(() => {
    if (!open) return
    reset(defaults())
    setImage(null)
    setImageError(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id])

  const pickImage = (f: File | undefined) => {
    setImageError(undefined)
    if (!f) return setImage(null)
    if (!/^image\/(jpeg|png)$/.test(f.type)) return setImageError('The project image must be a JPG or PNG.')
    if (f.size > MAX_IMAGE) return setImageError('The project image must be 2 MB or smaller.')
    setImage(f)
  }

  const onSubmit = handleSubmit(async (v) => {
    try {
      let saved: Project
      if (project) {
        const d = formState.dirtyFields
        const body: Record<string, string | null> = {}
        if (d.name) body.name = v.name.trim()
        if (d.description) body.description = v.description.trim() || null
        if (d.type && !typeLocked) body.type = v.type
        if (d.startDate) body.startDate = v.startDate
        if (d.endDate) body.endDate = v.endDate || null
        saved = Object.keys(body).length ? (await apiWithMessage<Project>(`/projects/${project.id}`, { method: 'PATCH', body })).data : project
        if (image) {
          const fd = new FormData()
          fd.append('image', image)
          saved = (await apiWithMessage<Project>(`/projects/${project.id}/image`, { method: 'POST', body: fd })).data
        }
      } else {
        const fields: Record<string, string> = { name: v.name.trim(), type: v.type, startDate: v.startDate }
        if (v.description.trim()) fields.description = v.description.trim()
        if (v.endDate) fields.endDate = v.endDate
        let body: Record<string, string> | FormData = fields
        if (image) {
          const fd = new FormData()
          for (const [k, val] of Object.entries(fields)) fd.append(k, val)
          fd.append('image', image)
          body = fd
        }
        saved = (await apiWithMessage<Project>('/projects', { method: 'POST', body })).data
      }
      haptic.success()
      toast.success(editing ? 'Project updated.' : 'Project created.')
      // Another project already has this name: allowed, but say so (PRD §5.3).
      saved.warnings?.forEach((w) => toast.message(w))
      invalidateProjects(qc)
      onOpenChange(false)
      if (!editing) {
        await settleOverlays()
        navigate(`/projects/${saved.id}`)
      }
    } catch (err) {
      handleFormError(err, setError, ['name', 'description', 'type', 'startDate', 'endDate'])
    }
  })

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit project' : 'New project'}
      variant="form"
      dirty={(formState.isDirty || !!image) && !formState.isSubmitting}
      footer={
        <Button type="submit" form="project-form" size="lg" block loading={formState.isSubmitting}>
          {editing ? 'Save changes' : 'Create project'}
        </Button>
      }
    >
      <form id="project-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pt-2">
        <TextField label="Name" autoCapitalize="words" enterKeyHint="next" error={formState.errors.name?.message} {...register('name')} />
        <TextAreaField label="Description" optional error={formState.errors.description?.message} {...register('description')} />
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <FieldShell label="Type" htmlFor="project-type" hint={typeLocked ? 'Locked: this project already has leads.' : 'Door-to-door visits need a live photo and GPS.'}>
              <div id="project-type" className={typeLocked ? 'pointer-events-none opacity-50' : ''}>
                <Segmented<ProjectType>
                  label="Project type"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'online', label: 'Online' },
                    { value: 'door_to_door', label: 'Door-to-door' },
                  ]}
                  className="w-full"
                />
              </div>
            </FieldShell>
          )}
        />
        <div className="grid grid-cols-1 gap-5 medium:grid-cols-2">
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => <DatePicker label="Start date" value={field.value} onChange={field.onChange} error={formState.errors.startDate?.message} />}
          />
          <Controller
            control={control}
            name="endDate"
            render={({ field }) => <DatePicker label="End date" optional value={field.value} onChange={field.onChange} error={formState.errors.endDate?.message} />}
          />
        </div>
        <FieldShell label="Image" htmlFor="project-image" optional error={imageError} hint="JPG or PNG, up to 2 MB.">
          <div className="flex items-center gap-3">
            <input id="project-image" ref={fileRef} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0])} />
            <Button type="button" variant="secondary" size="sm" icon="image" onClick={() => fileRef.current?.click()}>
              {image ? 'Change image' : project?.imageUrl ? 'Replace image' : 'Choose image'}
            </Button>
            {image && <span className="min-w-0 truncate text-body-sm text-body">{image.name}</span>}
          </div>
        </FieldShell>
      </form>
    </ResponsiveOverlay>
  )
}
