import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CampaignTraining, Course, CourseDetail, Lesson, LearnerLesson, RoleplaySession, TrainingBoard, TrainingStep } from '@/lib/types'

export const trainingKeys = {
  all: ['training'] as const,
  campaign: (projectId: string) => ['training', 'campaign', projectId] as const,
  board: (projectId: string) => ['training', 'board', projectId] as const,
  campaignCourses: (projectId: string) => ['training', 'campaign-courses', projectId] as const,
  campaignLessons: (projectId: string) => ['training', 'campaign-lessons', projectId] as const,
  courses: ['training', 'courses'] as const,
  course: (id: string) => ['training', 'course', id] as const,
  pitches: (lessonId: string, projectId: string) => ['training', 'pitches', lessonId, projectId] as const,
  pitch: (id: string) => ['training', 'pitch', id] as const,
}

/** A campaign's training as the signed-in person takes it, with their progress. */
export function useCampaignTraining(projectId: string | undefined) {
  return useQuery({
    queryKey: trainingKeys.campaign(projectId ?? '-'),
    enabled: !!projectId,
    queryFn: () => api<CampaignTraining>(`/projects/${projectId}/training`),
    staleTime: 60_000,
  })
}

export function useTrainingBoard(projectId: string | undefined) {
  return useQuery({
    queryKey: trainingKeys.board(projectId ?? '-'),
    enabled: !!projectId,
    queryFn: () => api<TrainingBoard>(`/projects/${projectId}/training/board`),
  })
}

export function useCampaignCourses(projectId: string) {
  return useQuery({ queryKey: trainingKeys.campaignCourses(projectId), queryFn: () => api<Course[]>(`/projects/${projectId}/training/courses`) })
}

export function useCampaignOwnLessons(projectId: string) {
  return useQuery({ queryKey: trainingKeys.campaignLessons(projectId), queryFn: () => api<Lesson[]>(`/projects/${projectId}/training/items`) })
}

export function useCourses(enabled = true) {
  return useQuery({ queryKey: trainingKeys.courses, enabled, queryFn: () => api<Course[]>('/training/courses') })
}

export function useCourse(id: string | undefined) {
  return useQuery({ queryKey: trainingKeys.course(id ?? '-'), enabled: !!id, queryFn: () => api<CourseDetail>(`/training/courses/${id}`) })
}

export function useMyPitches(lessonId: string, projectId: string) {
  return useQuery({
    queryKey: trainingKeys.pitches(lessonId, projectId),
    queryFn: () => api<RoleplaySession[]>(`/training/items/${lessonId}/roleplay`, { query: { projectId } }),
  })
}

export function usePitch(id: string | undefined) {
  return useQuery({ queryKey: trainingKeys.pitch(id ?? '-'), enabled: !!id, queryFn: () => api<RoleplaySession>(`/roleplay/${id}`) })
}

/** After anything that changes training: progress, lessons, courses. */
export function invalidateTraining(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: trainingKeys.all })
}

/** Every lesson of a campaign, in the order a rep meets them. */
export const allLessons = (t: CampaignTraining): LearnerLesson[] => [...t.courses.flatMap((c) => c.lessons), ...t.campaignLessons]

export const STEPS: { value: TrainingStep; label: string; blurb: string; icon: 'play' | 'microphone' | 'quiz' | 'bulb' | 'book' }[] = [
  { value: 'watch', label: 'Watch', blurb: 'Short videos, a quick check after each.', icon: 'play' },
  { value: 'practise', label: 'Practise', blurb: 'Pitch an AI shop owner and get a score.', icon: 'microphone' },
  { value: 'prove', label: 'Prove', blurb: 'The quiz that earns your certificate.', icon: 'quiz' },
  { value: 'field', label: 'Field kit', blurb: 'Open these during a visit.', icon: 'bulb' },
  { value: 'library', label: 'Library', blurb: 'Look things up. No need to read it all.', icon: 'book' },
]

export const KIND_LABEL: Record<string, string> = {
  video: 'Video',
  document: 'Document',
  card: 'Card',
  quiz: 'Quiz',
  roleplay: 'Practice pitch',
}

export const KIND_ICON = {
  video: 'play',
  document: 'book',
  card: 'bulb',
  quiz: 'quiz',
  roleplay: 'microphone',
} as const
