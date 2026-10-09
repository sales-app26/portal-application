import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useMe } from '@/auth/AuthProvider'
import type { MeProject } from '@/lib/types'

interface ProjectState {
  /** Projects the user works in (active memberships), active ones first. */
  projects: MeProject[]
  project: MeProject | null
  setProjectId: (id: string) => void
}

const Ctx = createContext<ProjectState | null>(null)
const keyFor = (userId: string) => `st.project.${userId}`

function readStored(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** The project picked in the top-bar switcher, remembered per user (UX-COMPONENTS.md §5.1). */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const me = useMe()
  const projects = useMemo(() => [...me.projects].sort((a, b) => Number(a.status === 'closed') - Number(b.status === 'closed')), [me.projects])
  const [chosen, setChosen] = useState<string | null>(() => readStored(keyFor(me.id)))

  const project = projects.find((p) => p.id === chosen) ?? projects.find((p) => p.status === 'active') ?? projects[0] ?? null

  const setProjectId = useCallback(
    (id: string) => {
      setChosen(id)
      try {
        localStorage.setItem(keyFor(me.id), id)
      } catch {
        /* per-tab only */
      }
    },
    [me.id],
  )

  const value = useMemo(() => ({ projects, project, setProjectId }), [projects, project, setProjectId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProject() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProject outside ProjectProvider')
  return ctx
}
