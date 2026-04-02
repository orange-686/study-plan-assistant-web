import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseEnabled, supabase } from './lib/supabase'

type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed'
type Priority = 'high' | 'medium' | 'low'
type PomodoroPhase = 'focus' | 'break'
type AppView = 'planner' | 'exam' | 'stats'
type ThemeMode = 'light' | 'dark'
type ScheduleMode = 'fixed' | 'flexible'
type ExamStatus = 'not_started' | 'running' | 'paused' | 'finished'

type StudyTask = {
  id: string
  title: string
  subject: string
  priority: Priority
  scheduleMode: ScheduleMode
  estimatedMinutes: number
  deadline: string
  startTime: string
  plannedDate: string
  postponedFromDate?: string
  status: TaskStatus
  actualMinutes: number
  createdAt: string
  updatedAt: string
}

type CourseBlock = {
  id: string
  name: string
  dayOfWeek: number
  startTime: string
  endTime: string
  location: string
}

type PomodoroSettings = {
  focusMinutes: number
  breakMinutes: number
}

type PomodoroState = {
  activeTaskId: string | null
  phase: PomodoroPhase
  isRunning: boolean
  secondsLeft: number
  cycleCount: number
  endsAt: number | null
}

type TaskFormState = {
  title: string
  subject: string
  priority: Priority
  scheduleMode: ScheduleMode
  estimatedMinutes: number
  deadline: string
  startTime: string
}

type CourseFormState = {
  name: string
  dayOfWeek: number
  startTime: string
  endTime: string
  location: string
}

type PlannerRules = {
  availableStartTime: string
  availableEndTime: string
  preferredRanges: Array<{ id: string; label: string; startTime: string; endTime: string }>
  courseBufferMinutes: number
}

type ExamTimerState = {
  title: string
  subject: string
  totalSeconds: number
  remainingSeconds: number
  status: ExamStatus
  endsAt: number | null
  triggeredWarnings: number[]
  recordedAt: string | null
}

type ExamRecord = {
  id: string
  title: string
  subject: string
  date: string
  minutes: number
  completedAt: string
}

type TimeRange = {
  start: number
  end: number
}

type TimelineItem = {
  id: string
  title: string
  subtitle: string
  startTime: string
  endTime: string
  tone: 'task' | 'course'
}

type PlannerSnapshot = {
  version: 1
  selectedDate: string
  tasks: StudyTask[]
  courses: CourseBlock[]
  settings: PomodoroSettings
  plannerRules: PlannerRules
  examTimer: ExamTimerState
  examHistory: ExamRecord[]
  theme: ThemeMode
}

type CloudStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'
type AuthMode = 'sign_in' | 'sign_up'

const TASKS_STORAGE_KEY = 'study-planner-tasks'
const SETTINGS_STORAGE_KEY = 'study-planner-settings'
const NOTIFICATION_STORAGE_KEY = 'study-planner-notification-log'
const COURSES_STORAGE_KEY = 'study-planner-courses'
const THEME_STORAGE_KEY = 'study-planner-theme'
const PLANNER_RULES_STORAGE_KEY = 'study-planner-rules'
const EXAM_TIMER_STORAGE_KEY = 'study-planner-exam-timer'
const EXAM_HISTORY_STORAGE_KEY = 'study-planner-exam-history'
const SNAPSHOT_VERSION = 1
const EXAM_WARNING_SECONDS = [30 * 60, 15 * 60, 5 * 60, 60]

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const getStorageItem = (key: string) => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const setStorageItem = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Keep the app usable even when browser storage is unavailable.
  }
}

const statusLabelMap: Record<TaskStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  delayed: '延期',
}

const priorityLabelMap: Record<Priority, string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
}

const scheduleModeLabelMap: Record<ScheduleMode, string> = {
  fixed: '固定时间',
  flexible: '允许自动改期',
}

const weekdayLabelMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const statusClasses: Record<TaskStatus, string> = {
  not_started: 'bg-white/80 text-slate-600 dark:bg-slate-700 dark:text-slate-200',
  in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  delayed: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

const priorityClasses: Record<Priority, string> = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
}

const defaultFormState = (): TaskFormState => ({
  title: '',
  subject: '',
  priority: 'medium',
  scheduleMode: 'flexible',
  estimatedMinutes: 60,
  deadline: '22:00',
  startTime: '09:00',
})

const defaultCourseFormState = (): CourseFormState => ({
  name: '',
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '09:40',
  location: '',
})

const defaultPlannerRules = (): PlannerRules => ({
  availableStartTime: '07:00',
  availableEndTime: '23:00',
  preferredRanges: [
    { id: 'morning', label: '上午优先', startTime: '08:00', endTime: '12:00' },
    { id: 'afternoon', label: '下午优先', startTime: '13:30', endTime: '17:30' },
    { id: 'evening', label: '晚间优先', startTime: '19:00', endTime: '21:30' },
  ],
  courseBufferMinutes: 15,
})

const defaultPomodoroState = (focusMinutes: number): PomodoroState => ({
  activeTaskId: null,
  phase: 'focus',
  isRunning: false,
  secondsLeft: focusMinutes * 60,
  cycleCount: 0,
  endsAt: null,
})

const defaultExamTimerState = (): ExamTimerState => ({
  title: '',
  subject: '',
  totalSeconds: 90 * 60,
  remainingSeconds: 90 * 60,
  status: 'not_started',
  endsAt: null,
  triggeredWarnings: [],
  recordedAt: null,
})

const getPomodoroPhaseSeconds = (phase: PomodoroPhase, settings: PomodoroSettings) =>
  (phase === 'focus' ? settings.focusMinutes : settings.breakMinutes) * 60

const resolvePomodoroState = (
  state: PomodoroState,
  settings: PomodoroSettings,
  now: number,
  activeTaskTitle: string,
) => {
  if (!state.isRunning) {
    return {
      state,
      completedFocusSessions: 0,
      creditedTaskId: null as string | null,
      notifications: [] as Array<{ title: string; body: string }>,
    }
  }

  let endsAt =
    typeof state.endsAt === 'number' ? state.endsAt : now + Math.max(1, state.secondsLeft) * 1000
  const nextState = { ...state, endsAt }
  const notifications: Array<{ title: string; body: string }> = []
  let completedFocusSessions = 0

  while (now >= endsAt) {
    const finishedPhase = nextState.phase
    const nextPhase: PomodoroPhase = finishedPhase === 'focus' ? 'break' : 'focus'
    const nextSeconds = getPomodoroPhaseSeconds(nextPhase, settings)

    if (finishedPhase === 'focus' && nextState.activeTaskId) {
      completedFocusSessions += 1
    }

    notifications.push({
      title: finishedPhase === 'focus' ? '专注结束，休息一下' : '休息结束，准备下一轮专注',
      body:
        finishedPhase === 'focus'
          ? `${activeTaskTitle} 的番茄钟已完成。`
          : '新的专注周期已经准备好了。',
    })

    nextState.phase = nextPhase
    nextState.secondsLeft = nextSeconds
    nextState.cycleCount =
      finishedPhase === 'break' ? nextState.cycleCount + 1 : nextState.cycleCount
    endsAt += nextSeconds * 1000
    nextState.endsAt = endsAt
  }

  nextState.secondsLeft = Math.max(1, Math.ceil((endsAt - now) / 1000))

  return {
    state: nextState,
    completedFocusSessions,
    creditedTaskId: nextState.activeTaskId,
    notifications,
  }
}

const getBeijingNowParts = () => {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date())
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
  }
}

const todayString = () => {
  const now = getBeijingNowParts()
  return `${String(now.year).padStart(4, '0')}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`
}

const addDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const formatDateZh = (dateString: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${dateString}T00:00:00`))

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`
}

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

const formatDurationClock = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

const examStatusLabelMap: Record<ExamStatus, string> = {
  not_started: '未开始',
  running: '进行中',
  paused: '已暂停',
  finished: '已结束',
}

const getWeekStart = (date = new Date()) => {
  const current = new Date(date)
  const day = current.getDay()
  const diff = day === 0 ? -6 : 1 - day
  current.setHours(0, 0, 0, 0)
  current.setDate(current.getDate() + diff)
  return current
}

const getTaskEffectiveMinutes = (task: StudyTask) =>
  task.actualMinutes > 0 ? task.actualMinutes : task.status === 'completed' ? task.estimatedMinutes : 0

const normalizeTask = (
  task: Omit<StudyTask, 'scheduleMode'> & { scheduleMode?: ScheduleMode; postponedFromDate?: string },
): StudyTask => ({
  ...task,
  scheduleMode: task.scheduleMode ?? 'flexible',
})

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const minutesToTime = (value: number) => {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const calculateEndTime = (startTime: string, duration: number) => minutesToTime(timeToMinutes(startTime) + duration)

const getMinimumStartMinute = (dateString: string) => {
  if (dateString !== todayString()) return 0
  const now = getBeijingNowParts()
  return now.hour * 60 + now.minute + 3
}

const overlap = (firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) =>
  firstStart < secondEnd && secondStart < firstEnd

const dateToWeekday = (dateString: string) => new Date(`${dateString}T00:00:00`).getDay()

const sortByPriority = (tasks: StudyTask[]) =>
  [...tasks].sort((first, second) => {
    const priorityRank = { high: 0, medium: 1, low: 2 }
    return (
      priorityRank[first.priority] - priorityRank[second.priority] ||
      first.deadline.localeCompare(second.deadline) ||
      first.createdAt.localeCompare(second.createdAt)
    )
  })

const mergeRanges = (ranges: TimeRange[]) => {
  const sorted = [...ranges].sort((first, second) => first.start - second.start)
  return sorted.reduce<TimeRange[]>((merged, current) => {
    const last = merged[merged.length - 1]
    if (!last || current.start > last.end) {
      merged.push({ ...current })
      return merged
    }
    last.end = Math.max(last.end, current.end)
    return merged
  }, [])
}

const getCourseRanges = (courses: CourseBlock[], dateString: string) => {
  const weekday = dateToWeekday(dateString)
  return courses
    .filter((course) => course.dayOfWeek === weekday)
    .map((course) => ({ start: timeToMinutes(course.startTime), end: timeToMinutes(course.endTime) }))
}

const getTaskRanges = (tasks: StudyTask[], dateString: string, excludeTaskId?: string) =>
  tasks
    .filter((task) => task.plannedDate === dateString && task.id !== excludeTaskId)
    .map((task) => ({ start: timeToMinutes(task.startTime), end: timeToMinutes(task.deadline) }))

const isTaskConflictingWithCourses = (startTime: string, endTime: string, courses: CourseBlock[], dateString: string) => {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  return getCourseRanges(courses, dateString).some((range) => overlap(start, end, range.start, range.end))
}

const getAvailableRanges = (blockedRanges: TimeRange[], dayStart = 8 * 60, dayEnd = 22 * 60 + 30) => {
  const merged = mergeRanges(
    blockedRanges
      .map((range) => ({
        start: Math.max(dayStart, range.start),
        end: Math.min(dayEnd, range.end),
      }))
      .filter((range) => range.end > range.start),
  )
  const available: TimeRange[] = []
  let pointer = dayStart
  merged.forEach((range) => {
    if (range.start > pointer) {
      available.push({ start: pointer, end: range.start })
    }
    pointer = Math.max(pointer, range.end)
  })
  if (pointer < dayEnd) {
    available.push({ start: pointer, end: dayEnd })
  }
  return available
}

const findAutoSlotForTask = (
  tasks: StudyTask[],
  courses: CourseBlock[],
  plannerRules: PlannerRules,
  dateString: string,
  duration: number,
  windowStartTime: string,
  windowEndTime: string,
  excludeTaskId?: string,
) => {
  const courseRanges = getCourseRanges(courses, dateString)
  const bufferedCourseRanges = courseRanges.map((range) => ({
    start: Math.max(timeToMinutes(plannerRules.availableStartTime), range.start - plannerRules.courseBufferMinutes),
    end: Math.min(timeToMinutes(plannerRules.availableEndTime), range.end + plannerRules.courseBufferMinutes),
  }))
  const minimumStartMinute = getMinimumStartMinute(dateString)
  const dayStart = Math.max(timeToMinutes(plannerRules.availableStartTime), timeToMinutes(windowStartTime), minimumStartMinute)
  const dayEnd = Math.min(timeToMinutes(plannerRules.availableEndTime), timeToMinutes(windowEndTime))
  if (dayStart >= dayEnd || dayEnd - dayStart < duration) {
    return null
  }
  const blockedRanges = mergeRanges([
    ...getTaskRanges(tasks, dateString, excludeTaskId),
    ...bufferedCourseRanges,
  ])
  const availableRanges = getAvailableRanges(blockedRanges, dayStart, dayEnd)
  const preferredRanges: TimeRange[] = plannerRules.preferredRanges.map((range) => ({
    start: timeToMinutes(range.startTime),
    end: timeToMinutes(range.endTime),
  }))

  const findSlotInRanges = (candidateRanges: TimeRange[]) => {
    for (const preferred of candidateRanges) {
      for (const available of availableRanges) {
        const start = Math.max(preferred.start, available.start)
        const end = Math.min(preferred.end, available.end)
        if (end - start >= duration) {
          return {
            startTime: minutesToTime(start),
            deadline: minutesToTime(start + duration),
          }
        }
      }
    }
    return null
  }

  return findSlotInRanges(preferredRanges) ?? findSlotInRanges([{ start: dayStart, end: dayEnd }])
}

const findSuggestedSlots = (tasks: StudyTask[], courses: CourseBlock[], plannerRules: PlannerRules, dateString: string) => {
  const targetTasks = sortByPriority(
    tasks.filter(
      (task) =>
        task.plannedDate === dateString &&
        task.status !== 'completed' &&
        task.scheduleMode === 'flexible',
    ),
  )
  const suggestions = new Map<string, { startTime: string; deadline: string }>()
  let blockingTasks = tasks.filter(
    (task) =>
      task.plannedDate !== dateString ||
      task.status === 'completed' ||
      task.scheduleMode === 'fixed',
  )

  targetTasks.forEach((task) => {
    const suggestion = findAutoSlotForTask(
      blockingTasks,
      courses,
      plannerRules,
      dateString,
      task.estimatedMinutes,
      plannerRules.availableStartTime,
      plannerRules.availableEndTime,
      task.id,
    )
    if (suggestion) {
      suggestions.set(task.id, suggestion)
      blockingTasks = [
        ...blockingTasks,
        {
          ...task,
          startTime: suggestion.startTime,
          deadline: suggestion.deadline,
        },
      ]
    }
  })

  return suggestions
}

const rollOverTasks = (tasks: StudyTask[], currentDate: string) =>
  tasks.map((task) => {
    if (task.status === 'completed') return task
    let nextDate = task.plannedDate
    let changed = false
    while (nextDate < currentDate) {
      nextDate = addDays(nextDate, 1)
      changed = true
    }
    return changed
      ? {
          ...task,
          plannedDate: nextDate,
          postponedFromDate: task.postponedFromDate ?? task.plannedDate,
          status: task.status === 'in_progress' ? 'delayed' : task.status,
          updatedAt: new Date().toISOString(),
        }
      : task
  })

const loadTasks = () => {
  const raw = getStorageItem(TASKS_STORAGE_KEY)
  if (!raw) return []
  try {
    return rollOverTasks((JSON.parse(raw) as StudyTask[]).map(normalizeTask), todayString())
  } catch {
    return []
  }
}

const loadSettings = (): PomodoroSettings => {
  const raw = getStorageItem(SETTINGS_STORAGE_KEY)
  if (!raw) return { focusMinutes: 25, breakMinutes: 5 }
  try {
    const parsed = JSON.parse(raw) as PomodoroSettings
    return {
      focusMinutes: Math.max(1, parsed.focusMinutes ?? 25),
      breakMinutes: Math.max(1, parsed.breakMinutes ?? 5),
    }
  } catch {
    return { focusMinutes: 25, breakMinutes: 5 }
  }
}

const loadPlannerRules = (): PlannerRules => {
  const raw = getStorageItem(PLANNER_RULES_STORAGE_KEY)
  if (!raw) return defaultPlannerRules()
  try {
    const parsed = JSON.parse(raw) as Partial<PlannerRules>
    const defaults = defaultPlannerRules()
    return {
      availableStartTime: parsed.availableStartTime ?? defaults.availableStartTime,
      availableEndTime: parsed.availableEndTime ?? defaults.availableEndTime,
      preferredRanges:
        parsed.preferredRanges?.map((range, index) => ({
          id: range.id ?? defaults.preferredRanges[index]?.id ?? `range-${index}`,
          label: range.label ?? defaults.preferredRanges[index]?.label ?? `优先区间 ${index + 1}`,
          startTime: range.startTime ?? defaults.preferredRanges[index]?.startTime ?? '08:00',
          endTime: range.endTime ?? defaults.preferredRanges[index]?.endTime ?? '09:00',
        })) ?? defaults.preferredRanges,
      courseBufferMinutes: Math.max(0, parsed.courseBufferMinutes ?? defaults.courseBufferMinutes),
    }
  } catch {
    return defaultPlannerRules()
  }
}

const loadExamTimer = (): ExamTimerState => {
  const raw = getStorageItem(EXAM_TIMER_STORAGE_KEY)
  if (!raw) return defaultExamTimerState()
  try {
    const parsed = JSON.parse(raw) as Partial<ExamTimerState>
    const defaults = defaultExamTimerState()
    return {
      title: parsed.title ?? defaults.title,
      subject: parsed.subject ?? defaults.subject,
      totalSeconds: Math.max(60, parsed.totalSeconds ?? defaults.totalSeconds),
      remainingSeconds: Math.max(0, parsed.remainingSeconds ?? defaults.remainingSeconds),
      status:
        parsed.status === 'running' ||
        parsed.status === 'paused' ||
        parsed.status === 'finished' ||
        parsed.status === 'not_started'
          ? parsed.status
          : defaults.status,
      endsAt: typeof parsed.endsAt === 'number' ? parsed.endsAt : defaults.endsAt,
      triggeredWarnings: Array.isArray(parsed.triggeredWarnings)
        ? parsed.triggeredWarnings.filter((item): item is number => typeof item === 'number')
        : defaults.triggeredWarnings,
      recordedAt: parsed.recordedAt ?? defaults.recordedAt,
    }
  } catch {
    return defaultExamTimerState()
  }
}

const loadExamHistory = () => {
  const raw = getStorageItem(EXAM_HISTORY_STORAGE_KEY)
  if (!raw) return [] as ExamRecord[]
  try {
    return JSON.parse(raw) as ExamRecord[]
  } catch {
    return []
  }
}

const loadCourses = () => {
  const raw = getStorageItem(COURSES_STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as CourseBlock[]
  } catch {
    return []
  }
}

const loadTheme = (): ThemeMode => {
  const raw = getStorageItem(THEME_STORAGE_KEY)
  if (raw === 'light' || raw === 'dark') return raw
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const readNotificationLog = (): Record<string, string> => {
  const raw = getStorageItem(NOTIFICATION_STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

const createPlannerSnapshot = (
  selectedDate: string,
  tasks: StudyTask[],
  courses: CourseBlock[],
  settings: PomodoroSettings,
  plannerRules: PlannerRules,
  examTimer: ExamTimerState,
  examHistory: ExamRecord[],
  theme: ThemeMode,
): PlannerSnapshot => ({
  version: SNAPSHOT_VERSION,
  selectedDate,
  tasks,
  courses,
  settings,
  plannerRules,
  examTimer,
  examHistory,
  theme,
})

const parsePlannerSnapshot = (payload: unknown): PlannerSnapshot | null => {
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload as Partial<PlannerSnapshot>
  const parsedTasks = Array.isArray(candidate.tasks) ? candidate.tasks.map(normalizeTask) : []
  const parsedCourses = Array.isArray(candidate.courses) ? (candidate.courses as CourseBlock[]) : []
  const parsedTheme = candidate.theme === 'dark' ? 'dark' : 'light'
  const selectedDate =
    typeof candidate.selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate.selectedDate)
      ? candidate.selectedDate
      : todayString()
  const settings = {
    focusMinutes: Math.max(1, candidate.settings?.focusMinutes ?? 25),
    breakMinutes: Math.max(1, candidate.settings?.breakMinutes ?? 5),
  }
  const plannerRules = (() => {
    const defaults = defaultPlannerRules()
    const parsed = candidate.plannerRules
    return {
      availableStartTime: parsed?.availableStartTime ?? defaults.availableStartTime,
      availableEndTime: parsed?.availableEndTime ?? defaults.availableEndTime,
      preferredRanges:
        parsed?.preferredRanges?.map((range, index) => ({
          id: range.id ?? defaults.preferredRanges[index]?.id ?? `range-${index}`,
          label: range.label ?? defaults.preferredRanges[index]?.label ?? `优先区间 ${index + 1}`,
          startTime: range.startTime ?? defaults.preferredRanges[index]?.startTime ?? '08:00',
          endTime: range.endTime ?? defaults.preferredRanges[index]?.endTime ?? '09:00',
        })) ?? defaults.preferredRanges,
      courseBufferMinutes: Math.max(0, parsed?.courseBufferMinutes ?? defaults.courseBufferMinutes),
    }
  })()
  const examTimer = (() => {
    const defaults = defaultExamTimerState()
    const parsed = candidate.examTimer
    return {
      title: parsed?.title ?? defaults.title,
      subject: parsed?.subject ?? defaults.subject,
      totalSeconds: Math.max(60, parsed?.totalSeconds ?? defaults.totalSeconds),
      remainingSeconds: Math.max(0, parsed?.remainingSeconds ?? defaults.remainingSeconds),
      status:
        parsed?.status === 'running' ||
        parsed?.status === 'paused' ||
        parsed?.status === 'finished' ||
        parsed?.status === 'not_started'
          ? parsed.status
          : defaults.status,
      endsAt: typeof parsed?.endsAt === 'number' ? parsed.endsAt : defaults.endsAt,
      triggeredWarnings: Array.isArray(parsed?.triggeredWarnings)
        ? parsed.triggeredWarnings.filter((item): item is number => typeof item === 'number')
        : defaults.triggeredWarnings,
      recordedAt: parsed?.recordedAt ?? defaults.recordedAt,
    }
  })()
  return {
    version: SNAPSHOT_VERSION,
    selectedDate,
    tasks: rollOverTasks(parsedTasks, todayString()),
    courses: parsedCourses,
    settings,
    plannerRules,
    examTimer,
    examHistory: Array.isArray(candidate.examHistory) ? (candidate.examHistory as ExamRecord[]) : [],
    theme: parsedTheme,
  }
}

const hasLocalContent = (
  tasks: StudyTask[],
  courses: CourseBlock[],
  settings: PomodoroSettings,
  theme: ThemeMode,
) => tasks.length > 0 || courses.length > 0 || settings.focusMinutes !== 25 || settings.breakMinutes !== 5 || theme === 'dark'

const createPlannerRulesSnapshot = (rules: PlannerRules): PlannerRules => ({
  availableStartTime: rules.availableStartTime,
  availableEndTime: rules.availableEndTime,
  preferredRanges: rules.preferredRanges.map((range) => ({ ...range })),
  courseBufferMinutes: rules.courseBufferMinutes,
})

const resolveExamTimerState = (state: ExamTimerState, now: number) => {
  if (state.status !== 'running' || !state.endsAt) {
    return {
      state,
      triggeredWarnings: [] as number[],
      didFinish: false,
    }
  }

  const remainingSeconds = Math.max(0, Math.ceil((state.endsAt - now) / 1000))
  const triggeredWarnings = EXAM_WARNING_SECONDS.filter(
    (mark) => remainingSeconds <= mark && !state.triggeredWarnings.includes(mark),
  )

  if (remainingSeconds <= 0) {
    return {
      state: {
        ...state,
        remainingSeconds: 0,
        status: 'finished' as const,
        endsAt: null,
        triggeredWarnings: [...state.triggeredWarnings, ...triggeredWarnings],
      },
      triggeredWarnings,
      didFinish: true,
    }
  }

  return {
    state: {
      ...state,
      remainingSeconds,
      triggeredWarnings: [...state.triggeredWarnings, ...triggeredWarnings],
    },
    triggeredWarnings,
    didFinish: false,
  }
}

function App() {
  const [view, setView] = useState<AppView>('planner')
  const [selectedDate, setSelectedDate] = useState(todayString)
  const [tasks, setTasks] = useState<StudyTask[]>(loadTasks)
  const [courses, setCourses] = useState<CourseBlock[]>(loadCourses)
  const [form, setForm] = useState<TaskFormState>(defaultFormState)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [courseForm, setCourseForm] = useState<CourseFormState>(defaultCourseFormState)
  const [settings, setSettings] = useState<PomodoroSettings>(loadSettings)
  const [plannerRules, setPlannerRules] = useState<PlannerRules>(loadPlannerRules)
  const [theme, setTheme] = useState<ThemeMode>(loadTheme)
  const [scheduleMessage, setScheduleMessage] = useState('等待生成建议排程')
  const [validationMessage, setValidationMessage] = useState('')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  )
  const [user, setUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('sign_in')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(isSupabaseEnabled ? 'loading' : 'local')
  const [pomodoro, setPomodoro] = useState<PomodoroState>(() =>
    defaultPomodoroState(loadSettings().focusMinutes),
  )
  const [examTimer, setExamTimer] = useState<ExamTimerState>(loadExamTimer)
  const [examHistory, setExamHistory] = useState<ExamRecord[]>(loadExamHistory)
  const [examHours, setExamHours] = useState(() => Math.floor(loadExamTimer().totalSeconds / 3600))
  const [examMinutes, setExamMinutes] = useState(() => Math.floor((loadExamTimer().totalSeconds % 3600) / 60))
  const [examFlash, setExamFlash] = useState(false)
  const [examAlert, setExamAlert] = useState('')
  const [isExamFullscreen, setIsExamFullscreen] = useState(false)
  const [todayPlanCollapsed, setTodayPlanCollapsed] = useState(false)
  const [rulesExpanded, setRulesExpanded] = useState(false)
  const notificationLogRef = useRef<Record<string, string>>(readNotificationLog())
  const cloudReadyRef = useRef(!isSupabaseEnabled)
  const skipNextCloudSyncRef = useRef(false)
  const syncTimerRef = useRef<number | null>(null)
  const examFlashTimerRef = useRef<number | null>(null)
  const examAudioContextRef = useRef<AudioContext | null>(null)
  const triggerExamAlertRef = useRef<(message: string, isFinal: boolean) => void>(() => {})
  const localSnapshotRef = useRef({
    tasks,
    courses,
    settings,
    plannerRules,
    examTimer,
    examHistory,
    theme,
  })

  const selectedDateCourses = useMemo(
    () =>
      courses
        .filter((course) => course.dayOfWeek === dateToWeekday(selectedDate))
        .sort((first, second) => first.startTime.localeCompare(second.startTime)),
    [courses, selectedDate],
  )

  const selectedDateTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.plannedDate === selectedDate)
        .sort((first, second) => first.startTime.localeCompare(second.startTime)),
    [selectedDate, tasks],
  )

  const selectedDateTopTask = useMemo(
    () => (selectedDateTasks.length > 0 ? sortByPriority(selectedDateTasks)[0] : null),
    [selectedDateTasks],
  )

  const todayTasks = useMemo(() => tasks.filter((task) => task.plannedDate === todayString()), [tasks])

  const todayCompletionRate = useMemo(() => {
    if (todayTasks.length === 0) return 0
    const completed = todayTasks.filter((task) => task.status === 'completed').length
    return Math.round((completed / todayTasks.length) * 100)
  }, [todayTasks])

  const weeklyMinutes = useMemo(() => {
    const weekStart = getWeekStart()
    const weekEnd = addDays(weekStart.toISOString().slice(0, 10), 7)
    const taskMinutes = tasks.reduce((total, task) => {
      if (task.plannedDate >= weekStart.toISOString().slice(0, 10) && task.plannedDate < weekEnd) {
        return total + getTaskEffectiveMinutes(task)
      }
      return total
    }, 0)
    const examMinutes = examHistory.reduce((total, record) => {
      if (record.date >= weekStart.toISOString().slice(0, 10) && record.date < weekEnd) {
        return total + record.minutes
      }
      return total
    }, 0)
    return taskMinutes + examMinutes
  }, [examHistory, tasks])

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === pomodoro.activeTaskId) ?? null,
    [pomodoro.activeTaskId, tasks],
  )

  const examElapsedSeconds = useMemo(
    () => Math.max(0, examTimer.totalSeconds - examTimer.remainingSeconds),
    [examTimer.remainingSeconds, examTimer.totalSeconds],
  )

  const examProgress = useMemo(() => {
    if (examTimer.totalSeconds <= 0) return 0
    return Math.min(100, Math.round((examElapsedSeconds / examTimer.totalSeconds) * 100))
  }, [examElapsedSeconds, examTimer.totalSeconds])

  const cloudExamTimerRemainingSeconds =
    examTimer.status === 'running' && examTimer.endsAt
      ? Math.max(0, Math.ceil((examTimer.endsAt - Date.now()) / 1000))
      : examTimer.remainingSeconds

  const cloudExamTimer = useMemo(
    () => ({
      title: examTimer.title,
      subject: examTimer.subject,
      totalSeconds: examTimer.totalSeconds,
      remainingSeconds: cloudExamTimerRemainingSeconds,
      status: examTimer.status,
      endsAt: examTimer.endsAt,
      triggeredWarnings: [...examTimer.triggeredWarnings],
      recordedAt: examTimer.recordedAt,
    }),
    [
      examTimer.endsAt,
      examTimer.recordedAt,
      examTimer.status,
      examTimer.subject,
      examTimer.title,
      examTimer.totalSeconds,
      examTimer.triggeredWarnings,
      cloudExamTimerRemainingSeconds,
    ],
  )

  const cloudSnapshot = useMemo(
    () =>
      createPlannerSnapshot(
        selectedDate,
        tasks,
        courses,
        settings,
        createPlannerRulesSnapshot(plannerRules),
        cloudExamTimer,
        examHistory,
        theme,
      ),
    [cloudExamTimer, courses, examHistory, plannerRules, selectedDate, settings, tasks, theme],
  )

  const showExamSetup = examTimer.status === 'not_started'
  const showExamExpandedInfo = !isExamFullscreen
  const examPanelTitle = examTimer.title.trim() || '未设置考试内容'
  const examPanelSubject = examTimer.subject.trim() || '未设置科目'

  const livePreviewSlot = useMemo(() => {
    if (!form.title.trim() || Number(form.estimatedMinutes) <= 0) return null
    if (form.scheduleMode !== 'flexible') return null
    const computedEndTime = calculateEndTime(form.startTime, Number(form.estimatedMinutes))
    if (timeToMinutes(computedEndTime) > 23 * 60) return null
    return findAutoSlotForTask(
      tasks,
      courses,
      plannerRules,
      selectedDate,
      Number(form.estimatedMinutes),
      form.startTime,
      plannerRules.availableEndTime,
      editingTaskId ?? undefined,
    )
  }, [
    courses,
    editingTaskId,
    plannerRules,
    form.estimatedMinutes,
    form.scheduleMode,
    form.startTime,
    form.title,
    selectedDate,
    tasks,
  ])

  const suggestedSlots = useMemo(
    () => findSuggestedSlots(tasks, courses, plannerRules, selectedDate),
    [courses, plannerRules, selectedDate, tasks],
  )

  const recentSevenDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(todayString(), index - 6)
      const taskMinutes = tasks
        .filter((task) => task.plannedDate === date)
        .reduce((total, task) => total + getTaskEffectiveMinutes(task), 0)
      const examMinutes = examHistory
        .filter((record) => record.date === date)
        .reduce((total, record) => total + record.minutes, 0)
      const dayCompletionTasks = tasks.filter((task) => task.plannedDate === date)
      const completionRate =
        dayCompletionTasks.length === 0
          ? 0
          : Math.round(
              (dayCompletionTasks.filter((task) => task.status === 'completed').length /
                dayCompletionTasks.length) *
                100,
            )
      return {
        date,
        label: new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(
          new Date(`${date}T00:00:00`),
        ),
        minutes: taskMinutes + examMinutes,
        completionRate,
      }
    })
  }, [examHistory, tasks])

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const taskItems = selectedDateTasks.map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      subtitle: `${task.subject} · ${statusLabelMap[task.status]}`,
      startTime: task.startTime,
      endTime: task.deadline,
      tone: 'task' as const,
    }))

    const courseItems = selectedDateCourses.map((course) => ({
      id: `course-${course.id}`,
      title: course.name,
      subtitle: course.location ? `课程 · ${course.location}` : '课程安排',
      startTime: course.startTime,
      endTime: course.endTime,
      tone: 'course' as const,
    }))

    return [...courseItems, ...taskItems].sort(
      (first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime),
    )
  }, [selectedDateCourses, selectedDateTasks])

  const subjectStats = useMemo(() => {
    const subjectMap = new Map<string, number>()
    tasks.forEach((task) => {
      const current = subjectMap.get(task.subject) ?? 0
      subjectMap.set(task.subject, current + getTaskEffectiveMinutes(task))
    })
    examHistory.forEach((record) => {
      const current = subjectMap.get(record.subject) ?? 0
      subjectMap.set(record.subject, current + record.minutes)
    })
    const total = [...subjectMap.values()].reduce((sum, value) => sum + value, 0)
    return [...subjectMap.entries()]
      .map(([subject, minutes]) => ({
        subject,
        minutes,
        share: total === 0 ? 0 : Math.round((minutes / total) * 100),
      }))
      .sort((first, second) => second.minutes - first.minutes)
  }, [examHistory, tasks])

  useEffect(() => {
    setStorageItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    setStorageItem(COURSES_STORAGE_KEY, JSON.stringify(courses))
  }, [courses])

  useEffect(() => {
    setStorageItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    setStorageItem(PLANNER_RULES_STORAGE_KEY, JSON.stringify(plannerRules))
  }, [plannerRules])

  useEffect(() => {
    setStorageItem(EXAM_TIMER_STORAGE_KEY, JSON.stringify(examTimer))
  }, [examTimer])

  useEffect(() => {
    setStorageItem(EXAM_HISTORY_STORAGE_KEY, JSON.stringify(examHistory))
  }, [examHistory])

  useEffect(() => {
    setStorageItem(THEME_STORAGE_KEY, theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    localSnapshotRef.current = {
      tasks,
      courses,
      settings,
      plannerRules,
      examTimer,
      examHistory,
      theme,
    }
  }, [courses, examHistory, examTimer, plannerRules, settings, tasks, theme])

  useEffect(() => {
    return () => {
      if (examFlashTimerRef.current) {
        window.clearTimeout(examFlashTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsExamFullscreen(Boolean(document.fullscreenElement))
    }

    syncFullscreenState()
    document.addEventListener('fullscreenchange', syncFullscreenState)

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
  }, [])

  useEffect(() => {
    if (examTimer.status !== 'finished' || !document.fullscreenElement) return
    void document.exitFullscreen?.()
  }, [examTimer.status])

  useEffect(() => {
    if (!supabase) {
      setCloudStatus('local')
      return
    }

    let active = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setCloudStatus('error')
        setAuthMessage(`读取登录状态失败：${error.message}`)
        return
      }
      setUser(data.session?.user ?? null)
      setCloudStatus(data.session?.user ? 'loading' : 'local')
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setUser(nextSession?.user ?? null)
      setCloudStatus(nextSession?.user ? 'loading' : 'local')
      if (!nextSession?.user) {
        cloudReadyRef.current = true
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !user) {
      if (!supabase) {
        cloudReadyRef.current = true
      }
      return
    }

    const supabaseClient = supabase
    let cancelled = false

    const loadCloudSnapshot = async () => {
      setCloudStatus('loading')
      cloudReadyRef.current = false

      const { data, error } = await supabaseClient
        .from('planner_snapshots')
        .select('payload')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setCloudStatus('error')
        setAuthMessage(`云端数据读取失败：${error.message}`)
        cloudReadyRef.current = true
        return
      }

      const snapshot = parsePlannerSnapshot(data?.payload)
      if (snapshot) {
        skipNextCloudSyncRef.current = true
        setTasks(snapshot.tasks)
        setCourses(snapshot.courses)
        setSettings(snapshot.settings)
        setPlannerRules(snapshot.plannerRules)
        setExamTimer(snapshot.examTimer)
        setExamHistory(snapshot.examHistory)
        setExamHours(Math.floor(snapshot.examTimer.totalSeconds / 3600))
        setExamMinutes(Math.floor((snapshot.examTimer.totalSeconds % 3600) / 60))
        setTheme(snapshot.theme)
        setSelectedDate(snapshot.selectedDate)
        setScheduleMessage('已从云端同步你的学习计划。')
      } else if (
        hasLocalContent(
          localSnapshotRef.current.tasks,
          localSnapshotRef.current.courses,
          localSnapshotRef.current.settings,
          localSnapshotRef.current.theme,
        )
      ) {
        setScheduleMessage('检测到本地已有数据，登录后会自动同步到云端。')
      } else if (
        localSnapshotRef.current.examHistory.length > 0 ||
        localSnapshotRef.current.examTimer.title.trim() ||
        localSnapshotRef.current.plannerRules.courseBufferMinutes !== defaultPlannerRules().courseBufferMinutes
      ) {
        setScheduleMessage('检测到本地已有考试或规则设置，登录后会自动同步到云端。')
      } else {
        setScheduleMessage('当前账号还没有云端数据，可以从这里开始创建学习计划。')
      }

      setCloudStatus('synced')
      cloudReadyRef.current = true
    }

    void loadCloudSnapshot()

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!supabase || !user || !cloudReadyRef.current) return
    const supabaseClient = supabase

    if (skipNextCloudSyncRef.current) {
      skipNextCloudSyncRef.current = false
      return
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current)
    }

    setCloudStatus('syncing')
    syncTimerRef.current = window.setTimeout(async () => {
      const { error } = await supabaseClient.from('planner_snapshots').upsert({
        user_id: user.id,
        payload: cloudSnapshot,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        setCloudStatus('error')
        setAuthMessage(`云端同步失败：${error.message}`)
        return
      }

      setCloudStatus('synced')
      setAuthMessage('已同步到云端，可在其他设备登录后继续使用。')
    }, 700)

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current)
      }
    }
  }, [cloudSnapshot, user])

  useEffect(() => {
    if (!pomodoro.isRunning) return
    const syncPomodoro = () => {
      const now = Date.now()
      let completedFocusSessions = 0
      let creditedTaskId: string | null = null
      let notifications: Array<{ title: string; body: string }> = []

      setPomodoro((current) => {
        const resolved = resolvePomodoroState(
          current,
          settings,
          now,
          activeTask?.title ?? '当前任务',
        )
        completedFocusSessions = resolved.completedFocusSessions
        creditedTaskId = resolved.creditedTaskId
        notifications = resolved.notifications
        return resolved.state
      })

      if (completedFocusSessions > 0 && creditedTaskId) {
        setTasks((currentTasks) =>
          currentTasks.map((task) =>
            task.id === creditedTaskId
              ? {
                  ...task,
                  actualMinutes: task.actualMinutes + settings.focusMinutes * completedFocusSessions,
                  updatedAt: new Date().toISOString(),
                }
              : task,
          ),
        )
      }

      const latestNotification = notifications[notifications.length - 1]
      if (latestNotification) {
        sendNotification(latestNotification.title, latestNotification.body, notificationPermission)
      }
    }

    syncPomodoro()
    const timer = window.setInterval(syncPomodoro, 1000)
    document.addEventListener('visibilitychange', syncPomodoro)
    window.addEventListener('focus', syncPomodoro)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', syncPomodoro)
      window.removeEventListener('focus', syncPomodoro)
    }
  }, [activeTask?.title, notificationPermission, pomodoro.isRunning, settings])

  useEffect(() => {
    const reminderTimer = window.setInterval(() => {
      const now = getBeijingNowParts()
      const dateKey = `${String(now.year).padStart(4, '0')}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`
      const currentTime = `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`

      tasks.forEach((task) => {
        const key = `start-${task.id}-${dateKey}`
        if (
          task.plannedDate === dateKey &&
          task.startTime === currentTime &&
          notificationLogRef.current[key] !== 'sent'
        ) {
          sendNotification('学习计划提醒', `${task.title} 该开始啦，保持专注。`, notificationPermission)
          notificationLogRef.current[key] = 'sent'
        }
      })

      const recapKey = `recap-${dateKey}`
      if (currentTime === '21:30' && notificationLogRef.current[recapKey] !== 'sent') {
        sendNotification('今晚复盘提醒', '21:30 了，花几分钟复盘今天的学习成果吧。', notificationPermission)
        notificationLogRef.current[recapKey] = 'sent'
      }

      setStorageItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notificationLogRef.current))
    }, 30000)

    return () => window.clearInterval(reminderTimer)
  }, [notificationPermission, tasks])

  useEffect(() => {
    if (examTimer.status !== 'running') return

    const syncExamTimer = () => {
      const now = Date.now()
      let warningMarks: number[] = []
      let completedExam: { title: string; subject: string; totalSeconds: number } | null = null
      let finishRecordedAt: string | null = null

      setExamTimer((current) => {
        const resolved = resolveExamTimerState(current, now)
        warningMarks = resolved.triggeredWarnings

        if (resolved.didFinish && !current.recordedAt) {
          finishRecordedAt = new Date().toISOString()
          completedExam = {
            title: resolved.state.title,
            subject: resolved.state.subject,
            totalSeconds: resolved.state.totalSeconds,
          }
          return {
            ...resolved.state,
            recordedAt: finishRecordedAt,
          }
        }

        return resolved.state
      })

      const latestWarning = warningMarks[warningMarks.length - 1]
      if (latestWarning) {
        const minutesLeft = Math.ceil(latestWarning / 60)
        const message = `距离考试结束还有 ${minutesLeft} 分钟`
        triggerExamAlertRef.current(message, false)
        sendNotification('考试时间提醒', message, notificationPermission)
      }

      const completedExamSnapshot = completedExam as { title: string; subject: string; totalSeconds: number } | null
      const recordedAt = finishRecordedAt

      if (completedExamSnapshot && recordedAt) {
        const completedMinutes = Math.round(completedExamSnapshot.totalSeconds / 60)
        setExamHistory((current) => [
          {
            id: createId(),
            title: completedExamSnapshot.title || '模拟考试',
            subject: completedExamSnapshot.subject || '未分类',
            date: todayString(),
            minutes: completedMinutes,
            completedAt: recordedAt,
          },
          ...current,
        ])
        triggerExamAlertRef.current('考试结束', true)
        sendNotification('考试结束', '本场考试计时已结束。', notificationPermission)
      }
    }

    syncExamTimer()
    const timer = window.setInterval(syncExamTimer, 1000)
    document.addEventListener('visibilitychange', syncExamTimer)
    window.addEventListener('focus', syncExamTimer)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', syncExamTimer)
      window.removeEventListener('focus', syncExamTimer)
    }
  }, [examTimer.status, notificationPermission])

  const saveTask = () => {
    if (!form.title.trim() || !form.subject.trim()) return
    const computedDeadline = calculateEndTime(form.startTime, Number(form.estimatedMinutes))
    if (timeToMinutes(computedDeadline) > 23 * 60) {
      setValidationMessage('按预计时长计算后，结束时间不能晚于 23:00。')
      return
    }

    let resolvedStartTime = form.startTime
    let resolvedDeadline = computedDeadline
    const minimumStartMinute = getMinimumStartMinute(selectedDate)
    const startTooSoon = timeToMinutes(form.startTime) < minimumStartMinute
    const outsideRuleWindow =
      timeToMinutes(form.startTime) < timeToMinutes(plannerRules.availableStartTime) ||
      timeToMinutes(computedDeadline) > timeToMinutes(plannerRules.availableEndTime)
    const conflictingWithCourses = isTaskConflictingWithCourses(
      form.startTime,
      computedDeadline,
      courses,
      selectedDate,
    )

    if ((conflictingWithCourses || startTooSoon || outsideRuleWindow) && form.scheduleMode === 'flexible') {
      const autoSlot = findAutoSlotForTask(
        tasks,
        courses,
        plannerRules,
        selectedDate,
        Number(form.estimatedMinutes),
        plannerRules.availableStartTime,
        plannerRules.availableEndTime,
        editingTaskId ?? undefined,
      )
      if (!autoSlot) {
        setValidationMessage('当前条件下无法自动安排时段，请确保开始时间至少晚于北京时间 3 分钟，且在设定时间窗口内仍有可用空档。')
        return
      }
      resolvedStartTime = autoSlot.startTime
      resolvedDeadline = autoSlot.deadline
      setScheduleMessage(`已自动安排到 ${resolvedStartTime} - ${resolvedDeadline}，并保证晚于当前北京时间 3 分钟、落在设定时间窗口内且与课程保留 15 分钟间隔。`)
    } else if (startTooSoon) {
      setValidationMessage('开始时间需要晚于当前北京时间 3 分钟。')
      return
    } else if (outsideRuleWindow) {
      setValidationMessage(`任务时间需落在规则时间区间 ${plannerRules.availableStartTime} - ${plannerRules.availableEndTime} 内。`)
      return
    } else if (conflictingWithCourses) {
      setValidationMessage('该任务与课程表冲突，请调整时间或使用建议排程。')
      return
    }

    setValidationMessage('')
    const now = new Date().toISOString()
    if (editingTaskId) {
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === editingTaskId
            ? {
                ...task,
                title: form.title.trim(),
                subject: form.subject.trim(),
                priority: form.priority,
                scheduleMode: form.scheduleMode,
                estimatedMinutes: Number(form.estimatedMinutes),
                deadline: resolvedDeadline,
                startTime: resolvedStartTime,
                plannedDate: selectedDate,
                updatedAt: now,
              }
            : task,
        ),
      )
      setScheduleMessage('任务已更新，现有统计和提醒逻辑保持同步。')
    } else {
      const task: StudyTask = {
        id: createId(),
        title: form.title.trim(),
        subject: form.subject.trim(),
        priority: form.priority,
        scheduleMode: form.scheduleMode,
        estimatedMinutes: Number(form.estimatedMinutes),
        deadline: resolvedDeadline,
        startTime: resolvedStartTime,
        plannedDate: selectedDate,
        status: 'not_started',
        actualMinutes: 0,
        createdAt: now,
        updatedAt: now,
      }
      setTasks((current) => [task, ...current])
    }
    setForm(defaultFormState())
    setEditingTaskId(null)
  }

  const startEditingTask = (task: StudyTask) => {
    setEditingTaskId(task.id)
    setForm({
      title: task.title,
      subject: task.subject,
      priority: task.priority,
      scheduleMode: task.scheduleMode,
      estimatedMinutes: task.estimatedMinutes,
      deadline: task.deadline,
      startTime: task.startTime,
    })
    setSelectedDate(task.plannedDate)
    setValidationMessage('')
  }

  const cancelEditingTask = () => {
    setEditingTaskId(null)
    setForm(defaultFormState())
    setValidationMessage('')
  }

  const deleteTask = (taskId: string) => {
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
    if (pomodoro.activeTaskId === taskId) {
      setPomodoro(defaultPomodoroState(settings.focusMinutes))
    }
    if (editingTaskId === taskId) {
      cancelEditingTask()
    }
    setScheduleMessage('任务已删除，其余任务与统计数据已自动更新。')
  }

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    if (status !== 'delayed') {
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === taskId
            ? (() => {
                const shouldRestoreOriginalDate =
                  status === 'not_started' && task.status === 'delayed' && Boolean(task.postponedFromDate)

                return {
                  ...task,
                  status,
                  plannedDate: shouldRestoreOriginalDate && task.postponedFromDate ? task.postponedFromDate : task.plannedDate,
                  postponedFromDate: shouldRestoreOriginalDate ? undefined : task.postponedFromDate,
                  updatedAt: new Date().toISOString(),
                }
              })()
            : task,
        ),
      )
      setScheduleMessage(
        status === 'not_started' && tasks.find((task) => task.id === taskId)?.status === 'delayed'
          ? '已取消延期，任务已从明天的列表中移除并回到原计划日期。'
          : '任务状态已更新。',
      )
      return
    }

    const targetTask = tasks.find((task) => task.id === taskId)
    if (!targetTask) return
    const tomorrow = addDays(targetTask.plannedDate, 1)
    const windowStartTime = targetTask.scheduleMode === 'fixed' ? targetTask.startTime : plannerRules.availableStartTime
    const windowEndTime = targetTask.scheduleMode === 'fixed' ? targetTask.deadline : plannerRules.availableEndTime
    const autoSlot =
      targetTask.scheduleMode === 'flexible'
        ? findAutoSlotForTask(
            tasks.filter((task) => task.id !== taskId),
            courses,
            plannerRules,
            tomorrow,
            targetTask.estimatedMinutes,
            windowStartTime,
            windowEndTime,
          )
        : null

    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) return task
        return {
          ...task,
          status: 'delayed',
          plannedDate: tomorrow,
          postponedFromDate: task.postponedFromDate ?? task.plannedDate,
          startTime: autoSlot?.startTime ?? task.startTime,
          deadline: autoSlot?.deadline ?? task.deadline,
          updatedAt: new Date().toISOString(),
        }
      }),
    )
    setScheduleMessage(
      autoSlot
        ? `任务已延期到明天，并自动安排在 ${autoSlot.startTime} - ${autoSlot.deadline}。`
        : '任务已延期到明天；未找到更合适的规则时段，保留原时间信息。',
    )
  }

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  const handleAuthSubmit = async () => {
    if (!supabase) {
      setAuthMessage('当前还没配置 Supabase 环境变量，暂时只能使用本地保存。')
      return
    }
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthMessage('请输入邮箱和密码。')
      return
    }

    setAuthLoading(true)
    setAuthMessage('')

    try {
      if (authMode === 'sign_up') {
        const { error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
        })
        if (error) throw error
        setAuthMessage('注册请求已提交。如果启用了邮箱确认，请先去邮箱完成验证，再回来登录。')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        })
        if (error) throw error
        setAuthMessage('登录成功，正在同步你的云端数据。')
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '登录失败，请稍后再试。')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthMessage(`退出登录失败：${error.message}`)
      return
    }
    setAuthMessage('已退出登录，当前仍会继续使用本地保存。')
    setCloudStatus('local')
  }

  const ensureExamAudioReady = async () => {
    if (typeof window === 'undefined') return null
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return null
    if (!examAudioContextRef.current) {
      examAudioContextRef.current = new AudioContextCtor()
    }
    if (examAudioContextRef.current.state === 'suspended') {
      await examAudioContextRef.current.resume()
    }
    return examAudioContextRef.current
  }

  const playExamTone = async (variant: 'warning' | 'end') => {
    try {
      const audioContext = await ensureExamAudioReady()
      if (!audioContext) return
      const pulses = variant === 'end' ? [0, 0.18, 0.36] : [0, 0.2]
      const baseFrequency = variant === 'end' ? 880 : 660
      pulses.forEach((offset, index) => {
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = baseFrequency + index * 80
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime + offset)
        gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + offset + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + offset + 0.18)
        oscillator.connect(gain)
        gain.connect(audioContext.destination)
        oscillator.start(audioContext.currentTime + offset)
        oscillator.stop(audioContext.currentTime + offset + 0.2)
      })
    } catch {
      // Keep visual alerts working even if autoplay is blocked.
    }
  }

  const triggerExamAlert = (message: string, isFinal: boolean) => {
    setExamAlert(message)
    setExamFlash(true)
    void playExamTone(isFinal ? 'end' : 'warning')
    if (examFlashTimerRef.current) {
      window.clearTimeout(examFlashTimerRef.current)
    }
    examFlashTimerRef.current = window.setTimeout(() => {
      setExamFlash(false)
    }, isFinal ? 5000 : 2500)
  }
  triggerExamAlertRef.current = triggerExamAlert

  const applyExamDuration = () => {
    const totalSeconds = Math.max(60, (Math.max(0, examHours) * 60 + Math.max(0, examMinutes)) * 60)
    setExamTimer((current) => ({
      ...current,
      totalSeconds,
      remainingSeconds: totalSeconds,
      status: 'not_started',
      endsAt: null,
      triggeredWarnings: [],
      recordedAt: null,
    }))
    setExamAlert('')
    setExamFlash(false)
  }

  const startExam = async () => {
    if (!examTimer.title.trim() || !examTimer.subject.trim()) {
      setExamAlert('请先填写考试内容和科目，再开始考试。')
      setExamFlash(true)
      return
    }
    const totalSeconds = Math.max(60, (Math.max(0, examHours) * 60 + Math.max(0, examMinutes)) * 60)
    await ensureExamAudioReady()
    setExamTimer((current) => ({
      ...current,
      totalSeconds,
      remainingSeconds: totalSeconds,
      status: 'running',
      endsAt: Date.now() + totalSeconds * 1000,
      triggeredWarnings: [],
      recordedAt: null,
    }))
    setExamAlert('')
    setExamFlash(false)
  }

  const pauseExam = () => {
    setExamTimer((current) => ({
      ...current,
      status: 'paused',
      remainingSeconds:
        current.endsAt && current.status === 'running'
          ? Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000))
          : current.remainingSeconds,
      endsAt: null,
    }))
  }

  const resumeExam = async () => {
    await ensureExamAudioReady()
    setExamTimer((current) => ({
      ...current,
      status: 'running',
      endsAt: Date.now() + current.remainingSeconds * 1000,
    }))
  }

  const resetExam = () => {
    const totalSeconds = Math.max(60, examTimer.totalSeconds)
    setExamTimer((current) => ({
      ...current,
      remainingSeconds: totalSeconds,
      status: 'not_started',
      endsAt: null,
      triggeredWarnings: [],
      recordedAt: null,
    }))
    setExamAlert('')
    setExamFlash(false)
  }

  const enterExamFullscreen = async () => {
    await ensureExamAudioReady()
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.()
    }
  }

  const exitExamFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.()
    }
  }

  const updatePreferredRange = (
    rangeId: string,
    field: 'startTime' | 'endTime',
    value: string,
  ) => {
    setPlannerRules((current) => ({
      ...current,
      preferredRanges: current.preferredRanges.map((range) =>
        range.id === rangeId ? { ...range, [field]: value } : range,
      ),
    }))
  }

  const startPomodoro = (taskId: string) => {
    updateTaskStatus(taskId, 'in_progress')
    setPomodoro((current) => {
      const secondsLeft =
        current.secondsLeft > 0
          ? current.secondsLeft
          : getPomodoroPhaseSeconds(current.phase, settings)

      return {
        ...current,
        activeTaskId: taskId,
        isRunning: true,
        phase: current.phase,
        secondsLeft,
        endsAt: Date.now() + secondsLeft * 1000,
      }
    })
  }

  const pausePomodoro = () => {
    setPomodoro((current) => {
      const secondsLeft =
        current.isRunning && current.endsAt
          ? Math.max(1, Math.ceil((current.endsAt - Date.now()) / 1000))
          : current.secondsLeft

      return {
        ...current,
        isRunning: false,
        secondsLeft,
        endsAt: null,
      }
    })
  }

  const resetPomodoro = () => {
    setPomodoro(defaultPomodoroState(settings.focusMinutes))
  }

  const togglePomodoroPhase = () => {
    setPomodoro((current) => {
      const nextPhase: PomodoroPhase = current.phase === 'focus' ? 'break' : 'focus'
      return {
        ...current,
        phase: nextPhase,
        secondsLeft: getPomodoroPhaseSeconds(nextPhase, settings),
        isRunning: false,
        endsAt: null,
      }
    })
  }

  const addCourse = () => {
    if (!courseForm.name.trim()) return
    if (timeToMinutes(courseForm.endTime) <= timeToMinutes(courseForm.startTime)) return
    const course: CourseBlock = {
      id: createId(),
      name: courseForm.name.trim(),
      dayOfWeek: courseForm.dayOfWeek,
      startTime: courseForm.startTime,
      endTime: courseForm.endTime,
      location: courseForm.location.trim(),
    }
    setCourses((current) => [...current, course].sort((first, second) => first.dayOfWeek - second.dayOfWeek || first.startTime.localeCompare(second.startTime)))
    setCourseForm(defaultCourseFormState())
  }

  const removeCourse = (courseId: string) => {
    setCourses((current) => current.filter((course) => course.id !== courseId))
  }

  const applySuggestedSchedule = () => {
    if (suggestedSlots.size === 0) {
      setScheduleMessage('当前日期的可用时间块不足，暂时无法生成更多建议。')
      return
    }
    let appliedCount = 0
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        const suggestion = suggestedSlots.get(task.id)
        if (!suggestion) return task
        appliedCount += 1
        return {
          ...task,
          startTime: suggestion.startTime,
          deadline: suggestion.deadline,
          updatedAt: new Date().toISOString(),
        }
      }),
    )
    setScheduleMessage(`已为 ${appliedCount} 个允许自动改期的任务重新安排时间，已自动避开课程和固定任务。`)
  }

  return (
    <div className="min-h-screen bg-grain px-3 py-4 text-ink transition-colors dark:bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] dark:text-slate-100 sm:px-5 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="mb-4 overflow-hidden rounded-[28px] bg-slate-900 px-4 py-5 text-white shadow-soft dark:bg-slate-950 sm:px-6 sm:py-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setView('planner')}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    view === 'planner' ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  计划页
                </button>
                <button
                  onClick={() => setView('exam')}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    view === 'exam' ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  考试页
                </button>
                <button
                  onClick={() => setView('stats')}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    view === 'stats' ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  统计页
                </button>
                <button
                  onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
                  className="rounded-full bg-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/20"
                >
                  {theme === 'light' ? '切换深色模式' : '切换浅色模式'}
                </button>
              </div>
              <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 sm:text-sm">
                学习计划助手增强版
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                兼顾课程表、自动排程、专注计时和学习数据复盘
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                面向大学生的学习助手，新增课程表模式、建议排程、统计页、深色模式和更好的移动端体验。
              </p>
            </div>
            <div className="grid gap-3 rounded-3xl bg-white/10 p-3 backdrop-blur sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="今日完成率" value={`${todayCompletionRate}%`} hint="按今日任务状态实时计算" />
              <MetricCard label="本周学习时长" value={formatMinutes(weeklyMinutes)} hint="优先统计实际专注时长" />
              <MetricCard label="今日课程数" value={`${selectedDateCourses.length}`} hint="课表时段自动避开额外排程" />
              <MetricCard
                label="云端状态"
                value={
                  cloudStatus === 'synced'
                    ? '已同步'
                    : cloudStatus === 'syncing'
                      ? '同步中'
                      : cloudStatus === 'loading'
                        ? '加载中'
                        : cloudStatus === 'error'
                          ? '异常'
                          : '本地模式'
                }
                hint={user ? '已登录，可跨设备同步' : '未登录时继续保存在本机'}
              />
            </div>
          </div>
        </section>

        {view === 'planner' ? (
          <section className="grid gap-4">
            <section className="rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 backdrop-blur dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">今日学习计划</p>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl">
                    {formatDateZh(selectedDate)}
                  </h2>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    onClick={applySuggestedSchedule}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                  >
                    建议排程
                  </button>
                  <button
                    onClick={() => setTodayPlanCollapsed((current) => !current)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {todayPlanCollapsed ? '展开计划' : '折叠计划'}
                  </button>
                </div>
              </div>

              {!todayPlanCollapsed && (
                <>
                  <div className="mb-4 rounded-3xl bg-sand px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <p className="font-medium">排程反馈</p>
                    <p className="mt-1">{scheduleMessage}</p>
                  </div>

                  <div className="grid gap-3">
                    {selectedDateTasks.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                        这一天还没有学习任务，先在下方新增任务或生成建议排程。
                      </div>
                    ) : (
                      selectedDateTasks.map((task) => {
                        return (
                          <article
                            key={task.id}
                            className="rounded-3xl border border-slate-100 bg-gradient-to-r from-white to-slate-50 p-4 transition hover:-translate-y-0.5 hover:shadow-soft dark:border-slate-800 dark:from-slate-900 dark:to-slate-800"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${priorityClasses[task.priority]}`}>
                                    {priorityLabelMap[task.priority]}
                                  </span>
                                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses[task.status]}`}>
                                    {statusLabelMap[task.status]}
                                  </span>
                                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                                    {scheduleModeLabelMap[task.scheduleMode]}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                    {task.subject}
                                  </span>
                                  {task.postponedFromDate && task.postponedFromDate !== task.plannedDate && (
                                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                      由 {formatDateZh(task.postponedFromDate)} 延期而来
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
                                    {task.title}
                                  </h3>
                                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    开始 {task.startTime} · 截止 {task.deadline} · 预计 {formatMinutes(task.estimatedMinutes)} · 已专注 {formatMinutes(task.actualMinutes)}
                                  </p>
                                </div>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2 lg:w-[320px]">
                                <StatusButton label="未开始" active={task.status === 'not_started'} onClick={() => updateTaskStatus(task.id, 'not_started')} />
                                <StatusButton label="进行中" active={task.status === 'in_progress'} onClick={() => updateTaskStatus(task.id, 'in_progress')} />
                                <StatusButton label="已完成" active={task.status === 'completed'} onClick={() => updateTaskStatus(task.id, 'completed')} />
                                <StatusButton label="延期" active={task.status === 'delayed'} onClick={() => updateTaskStatus(task.id, 'delayed')} />
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                onClick={() => startPomodoro(task.id)}
                                className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                              >
                                为此任务开始番茄钟
                              </button>
                              <button
                                onClick={() => startEditingTask(task)}
                                className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                              >
                                编辑任务
                              </button>
                              <button
                                onClick={() => deleteTask(task.id)}
                                className="rounded-2xl bg-rose-100 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-300"
                              >
                                删除任务
                              </button>
                              {task.status !== 'completed' && (
                                <button
                                  onClick={() => {
                                    updateTaskStatus(task.id, 'completed')
                                    if (pomodoro.activeTaskId === task.id) {
                                      pausePomodoro()
                                    }
                                  }}
                                  className="rounded-2xl bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300"
                                >
                                  标记完成
                                </button>
                              )}
                            </div>
                          </article>
                        )
                      })
                    )}
                  </div>
                </>
              )}

              {todayPlanCollapsed && (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
                  {selectedDateTopTask ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">当前最优先任务</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{selectedDateTopTask.title}</h3>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                          {selectedDateTopTask.subject} · {priorityLabelMap[selectedDateTopTask.priority]} · {selectedDateTopTask.startTime} - {selectedDateTopTask.deadline}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses[selectedDateTopTask.status]}`}>
                          {statusLabelMap[selectedDateTopTask.status]}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                          已安排 {selectedDateTasks.length} 项
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">当前没有任务，展开后可以继续新增或排程。</p>
                  )}
                </div>
              )}
            </section>

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <section className="rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">番茄钟</p>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      {pomodoro.phase === 'focus' ? '专注中' : '休息中'}
                    </h2>
                  </div>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                    {activeTask ? `当前任务：${activeTask.title}` : '尚未绑定任务'}
                  </span>
                </div>
                <div className="rounded-[28px] bg-slate-900 px-5 py-7 text-center text-white dark:bg-slate-950">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    {pomodoro.phase === 'focus' ? 'Focus Session' : 'Break Time'}
                  </p>
                  <div className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">
                    {formatTime(pomodoro.secondsLeft)}
                  </div>
                  <p className="mt-3 text-sm text-slate-300">已完成轮次：{pomodoro.cycleCount}</p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="专注时长（分钟）">
                    <input
                      type="number"
                      min="1"
                      value={settings.focusMinutes}
                      onChange={(event) => {
                        const value = Number(event.target.value) || 1
                        setSettings((current) => ({ ...current, focusMinutes: value }))
                        if (!pomodoro.isRunning && pomodoro.phase === 'focus') {
                          setPomodoro((current) => ({ ...current, secondsLeft: value * 60 }))
                        }
                      }}
                      className="input-base"
                    />
                  </Field>
                  <Field label="休息时长（分钟）">
                    <input
                      type="number"
                      min="1"
                      value={settings.breakMinutes}
                      onChange={(event) => {
                        const value = Number(event.target.value) || 1
                        setSettings((current) => ({ ...current, breakMinutes: value }))
                        if (!pomodoro.isRunning && pomodoro.phase === 'break') {
                          setPomodoro((current) => ({ ...current, secondsLeft: value * 60 }))
                        }
                      }}
                      className="input-base"
                    />
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => setPomodoro((current) => ({ ...current, isRunning: true }))}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                  >
                    继续计时
                  </button>
                  <button
                    onClick={pausePomodoro}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                  >
                    暂停
                  </button>
                  <button
                    onClick={togglePomodoroPhase}
                    className="rounded-2xl bg-sky-100 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-300"
                  >
                    切换专注 / 休息
                  </button>
                  <button
                    onClick={resetPomodoro}
                    className="rounded-2xl bg-rose-100 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-300"
                  >
                    重置
                  </button>
                </div>
              </section>

              <section className="rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{editingTaskId ? '编辑任务' : '新增任务'}</p>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                      {editingTaskId ? '调整任务信息' : '安排学习重点'}
                    </h2>
                  </div>
                  <span className="rounded-full bg-peach px-3 py-1 text-xs font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                    避开课程时段
                  </span>
                </div>
                <div className="grid gap-3">
                  <Field label="任务名">
                    <input
                      value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      className="input-base"
                      placeholder="例如：操作系统习题整理"
                    />
                  </Field>
                  <Field label="科目">
                    <input
                      value={form.subject}
                      onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                      className="input-base"
                      placeholder="例如：操作系统"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="优先级">
                      <select
                        value={form.priority}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, priority: event.target.value as Priority }))
                        }
                        className="input-base"
                      >
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                      </select>
                    </Field>
                    <Field label="预计时长（分钟）">
                      <input
                        type="number"
                        min="15"
                        step="5"
                        value={form.estimatedMinutes}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            estimatedMinutes: Number(event.target.value) || 15,
                          }))
                        }
                        className="input-base"
                      />
                    </Field>
                  </div>
                  <Field label="时间安排模式">
                    <select
                      value={form.scheduleMode}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          scheduleMode: event.target.value as ScheduleMode,
                        }))
                      }
                      className="input-base"
                    >
                      <option value="flexible">允许自动改期</option>
                      <option value="fixed">固定时间</option>
                    </select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="计划开始时间">
                      <input
                        type="time"
                        value={form.startTime}
                        onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                        className="input-base"
                      />
                    </Field>
                    <Field label="结束时间（自动计算）">
                      <input
                        type="time"
                        value={calculateEndTime(form.startTime, Number(form.estimatedMinutes))}
                        readOnly
                        className="input-base cursor-not-allowed opacity-70"
                      />
                    </Field>
                  </div>
                  {form.scheduleMode === 'flexible' && (
                    <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-slate-700 dark:bg-sky-500/10 dark:text-slate-200">
                      <p className="font-medium text-sky-700 dark:text-sky-300">实时可用时段预览</p>
                      {livePreviewSlot ? (
                        <p className="mt-1">
                          系统当前建议安排在 {livePreviewSlot.startTime} - {livePreviewSlot.deadline}。点击下方保存时，如果你选择的开始时间不满足规则，将自动采用该建议时段。
                        </p>
                      ) : (
                        <p className="mt-1">
                          当前输入下暂时没有可预览的可用时段，请调整开始时间、预计时长或课程安排。
                        </p>
                      )}
                    </div>
                  )}
                  {validationMessage && (
                    <div className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                      {validationMessage}
                    </div>
                  )}
                  <button
                    onClick={saveTask}
                    className="mt-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                  >
                    {editingTaskId
                      ? '保存任务修改'
                      : `添加到 ${selectedDate === todayString() ? '今日计划' : '所选日期'}`}
                  </button>
                  {editingTaskId && (
                    <button
                      onClick={cancelEditingTask}
                      className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      取消编辑
                    </button>
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">可视化时间轴</p>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">当天课程与任务分布</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  07:00 - 23:00
                </span>
              </div>
              {timelineItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  当前日期还没有课程或任务，时间轴会在这里展示当天安排。
                </div>
              ) : (
                <SingleAxisTimeline items={timelineItems} />
              )}
            </section>

            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">课程表模式</p>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">固定上课时间</h2>
                  </div>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                    {weekdayLabelMap[dateToWeekday(selectedDate)]}
                  </span>
                </div>
                <div className="mb-4 grid gap-3 md:grid-cols-5">
                  <Field label="课程名">
                    <input
                      value={courseForm.name}
                      onChange={(event) => setCourseForm((current) => ({ ...current, name: event.target.value }))}
                      className="input-base"
                      placeholder="例如：数据库原理"
                    />
                  </Field>
                  <Field label="星期">
                    <select
                      value={courseForm.dayOfWeek}
                      onChange={(event) =>
                        setCourseForm((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))
                      }
                      className="input-base"
                    >
                      {weekdayLabelMap.map((label, index) => (
                        <option key={label} value={index}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="开始">
                    <input
                      type="time"
                      value={courseForm.startTime}
                      onChange={(event) => setCourseForm((current) => ({ ...current, startTime: event.target.value }))}
                      className="input-base"
                    />
                  </Field>
                  <Field label="结束">
                    <input
                      type="time"
                      value={courseForm.endTime}
                      onChange={(event) => setCourseForm((current) => ({ ...current, endTime: event.target.value }))}
                      className="input-base"
                    />
                  </Field>
                  <Field label="地点">
                    <input
                      value={courseForm.location}
                      onChange={(event) => setCourseForm((current) => ({ ...current, location: event.target.value }))}
                      className="input-base"
                      placeholder="教学楼/教室"
                    />
                  </Field>
                </div>
                <button
                  onClick={addCourse}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                >
                  添加课程时段
                </button>

                <div className="mt-5 grid gap-3">
                  {selectedDateCourses.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      当前星期暂无课程时段，建议先录入固定课表。
                    </div>
                  ) : (
                    selectedDateCourses.map((course) => (
                      <div
                        key={course.id}
                        className="flex flex-col gap-3 rounded-3xl bg-slate-50 px-4 py-4 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{course.name}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {weekdayLabelMap[course.dayOfWeek]} {course.startTime} - {course.endTime}
                            {course.location ? ` · ${course.location}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => removeCourse(course.id)}
                          className="rounded-2xl bg-rose-100 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-300"
                        >
                          删除
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
                <button
                  onClick={() => setRulesExpanded((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">计划规则设置</p>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">调整自动排程与可选时间区间</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {rulesExpanded ? '折叠' : '展开'}
                  </span>
                </button>

                {rulesExpanded && (
                  <div className="mt-5 grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="任务可选开始时间">
                        <input
                          type="time"
                          value={plannerRules.availableStartTime}
                          onChange={(event) =>
                            setPlannerRules((current) => ({
                              ...current,
                              availableStartTime: event.target.value,
                            }))
                          }
                          className="input-base"
                        />
                      </Field>
                      <Field label="任务可选结束时间">
                        <input
                          type="time"
                          value={plannerRules.availableEndTime}
                          onChange={(event) =>
                            setPlannerRules((current) => ({
                              ...current,
                              availableEndTime: event.target.value,
                            }))
                          }
                          className="input-base"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      {plannerRules.preferredRanges.map((range) => (
                        <div key={range.id} className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{range.label}</p>
                          <div className="mt-3 grid gap-3">
                            <Field label="开始">
                              <input
                                type="time"
                                value={range.startTime}
                                onChange={(event) => updatePreferredRange(range.id, 'startTime', event.target.value)}
                                className="input-base"
                              />
                            </Field>
                            <Field label="结束">
                              <input
                                type="time"
                                value={range.endTime}
                                onChange={(event) => updatePreferredRange(range.id, 'endTime', event.target.value)}
                                className="input-base"
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Field label="临近课程时间间隔（分钟）">
                      <input
                        type="number"
                        min="0"
                        max="120"
                        step="5"
                        value={plannerRules.courseBufferMinutes}
                        onChange={(event) =>
                          setPlannerRules((current) => ({
                            ...current,
                            courseBufferMinutes: Math.max(0, Number(event.target.value) || 0),
                          }))
                        }
                        className="input-base"
                      />
                    </Field>
                  </div>
                )}
              </section>

              <section className="rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">账号与同步</p>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">登录后跨设备保存数据</h2>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      cloudStatus === 'synced'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : cloudStatus === 'syncing' || cloudStatus === 'loading'
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                          : cloudStatus === 'error'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {cloudStatus === 'synced'
                      ? '云端已同步'
                      : cloudStatus === 'syncing'
                        ? '正在同步'
                        : cloudStatus === 'loading'
                          ? '读取云端'
                          : cloudStatus === 'error'
                            ? '同步异常'
                            : '本地模式'}
                  </span>
                </div>

                {isSupabaseEnabled ? (
                  user ? (
                    <div className="grid gap-3">
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-slate-700 dark:bg-emerald-500/10 dark:text-slate-200">
                        <p className="font-medium text-emerald-700 dark:text-emerald-300">已登录</p>
                        <p className="mt-1">{user.email ?? '当前账号'} 已连接云端，任务、课表、统计和主题会自动同步。</p>
                      </div>
                      <button
                        onClick={() => void handleSignOut()}
                        className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                      >
                        退出登录
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setAuthMode('sign_in')}
                          className={`rounded-full px-4 py-2 text-sm transition ${
                            authMode === 'sign_in'
                              ? 'bg-slate-900 text-white dark:bg-sky-500'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          登录
                        </button>
                        <button
                          onClick={() => setAuthMode('sign_up')}
                          className={`rounded-full px-4 py-2 text-sm transition ${
                            authMode === 'sign_up'
                              ? 'bg-slate-900 text-white dark:bg-sky-500'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          注册
                        </button>
                      </div>
                      <Field label="邮箱">
                        <input
                          type="email"
                          value={authEmail}
                          onChange={(event) => setAuthEmail(event.target.value)}
                          className="input-base"
                          placeholder="you@example.com"
                        />
                      </Field>
                      <Field label="密码">
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(event) => setAuthPassword(event.target.value)}
                          className="input-base"
                          placeholder="至少 6 位"
                        />
                      </Field>
                      <button
                        onClick={() => void handleAuthSubmit()}
                        disabled={authLoading}
                        className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sky-500 dark:hover:bg-sky-400"
                      >
                        {authLoading ? '处理中…' : authMode === 'sign_in' ? '登录并同步' : '注册账号'}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-slate-700 dark:bg-amber-500/10 dark:text-slate-200">
                    <p className="font-medium text-amber-700 dark:text-amber-300">还未启用云同步</p>
                    <p className="mt-1">
                      请先在部署环境中配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，然后执行
                      `supabase/schema.sql` 里的建表脚本。
                    </p>
                  </div>
                )}

                {authMessage && (
                  <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {authMessage}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">提醒中心</p>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">浏览器通知</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    包含计划开始提醒、番茄钟结束提醒和每天 21:30 复盘提醒。
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    notificationPermission === 'granted'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                  }`}
                >
                  {notificationPermission === 'granted' ? '已授权' : '待授权'}
                </span>
              </div>
              <button
                onClick={() => void requestNotificationPermission()}
                className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-sky-500 dark:hover:bg-sky-400"
              >
                开启浏览器通知
              </button>
            </section>
          </section>
        ) : view === 'exam' ? (
          <section
            className={
              isExamFullscreen
                ? `fixed inset-0 z-50 flex min-h-screen bg-slate-950 p-4 sm:p-8 ${examFlash ? 'animate-pulse' : ''}`
                : `relative overflow-hidden rounded-[32px] bg-white/90 p-5 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/85 dark:ring-slate-800 sm:p-8 ${
                    examFlash ? 'animate-pulse ring-2 ring-rose-400 dark:ring-rose-500' : ''
                  }`
            }
          >
            {!isExamFullscreen && (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.07),_transparent_42%)] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_35%)]" />
            )}
            <div className={`relative ${isExamFullscreen ? 'flex w-full flex-1 items-stretch justify-center' : ''}`}>
              <div className={isExamFullscreen ? 'flex w-full max-w-7xl flex-1 flex-col justify-center' : ''}>
                {showExamExpandedInfo && (
                  <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Exam Timer</p>
                      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                        考试计时器
                      </h2>
                      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                        适合在电脑上全屏使用的简洁考试计时页面，切屏或熄屏后会按真实时间继续结算。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => void enterExamFullscreen()}
                        className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                      >
                        进入全屏
                      </button>
                      <span className="rounded-full bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                        当前状态：{examStatusLabelMap[examTimer.status]}
                      </span>
                    </div>
                  </div>
                )}

                {examAlert && (
                  <div className={`rounded-3xl border px-5 py-4 text-center text-base font-medium ${
                    isExamFullscreen
                      ? 'mb-4 border-rose-300 bg-rose-500/15 text-rose-100'
                      : 'mb-6 border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
                  }`}>
                    <div>{examAlert}</div>
                    <button
                      onClick={() => {
                        setExamAlert('')
                        setExamFlash(false)
                      }}
                      className={`mt-3 rounded-full px-4 py-2 text-sm shadow-sm ${
                        isExamFullscreen
                          ? 'bg-white/10 text-white'
                          : 'bg-white text-rose-700 dark:bg-slate-900 dark:text-rose-300'
                      }`}
                    >
                      关闭提示
                    </button>
                  </div>
                )}

                <div className={`rounded-[36px] bg-slate-950 text-center text-white shadow-soft ${
                  isExamFullscreen ? 'flex flex-1 flex-col justify-center px-5 py-8 sm:px-10' : 'px-4 py-10 sm:px-8 sm:py-14'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-left">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Exam Focus</p>
                      <p className="mt-2 text-base text-slate-300 sm:text-lg">
                        {examPanelSubject} · {examPanelTitle}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/10 px-4 py-2 text-sm text-slate-200">
                        当前状态：{examStatusLabelMap[examTimer.status]}
                      </span>
                      <button
                        onClick={() => {
                          if (isExamFullscreen) {
                            void exitExamFullscreen()
                          } else {
                            void enterExamFullscreen()
                          }
                        }}
                        className="rounded-full bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
                      >
                        {isExamFullscreen ? '退出全屏' : '进入全屏'}
                      </button>
                    </div>
                  </div>

                  <div className={`font-semibold tracking-[0.08em] ${isExamFullscreen ? 'mt-8 text-[4rem] sm:text-[7rem] lg:text-[9rem]' : 'mt-5 text-[3rem] sm:text-[5rem] lg:text-[6.5rem]'}`}>
                    {formatDurationClock(examTimer.remainingSeconds)}
                  </div>

                  <div className="mx-auto mt-6 h-3 w-full max-w-5xl overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-amber-300 transition-all"
                      style={{ width: `${Math.max(0, examProgress)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-slate-300">考试进度 {examProgress}%</p>

                  <div className={`mt-6 grid gap-3 ${isExamFullscreen ? 'sm:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
                    <MetricPanel label="总时长" value={formatDurationClock(examTimer.totalSeconds)} />
                    <MetricPanel label="已用时间" value={formatDurationClock(examElapsedSeconds)} />
                    <MetricPanel label="剩余时间" value={formatDurationClock(examTimer.remainingSeconds)} />
                    <MetricPanel label="当前状态" value={examStatusLabelMap[examTimer.status]} />
                  </div>

                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button
                      onClick={() => void startExam()}
                      disabled={examTimer.status === 'running'}
                      className="rounded-2xl bg-white px-5 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      开始考试
                    </button>
                    <button
                      onClick={pauseExam}
                      disabled={examTimer.status !== 'running'}
                      className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      暂停
                    </button>
                    <button
                      onClick={() => void resumeExam()}
                      disabled={examTimer.status !== 'paused'}
                      className="rounded-2xl bg-emerald-500/20 px-5 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      继续
                    </button>
                    <button
                      onClick={resetExam}
                      className="rounded-2xl bg-rose-500/20 px-5 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-500/30"
                    >
                      重置
                    </button>
                    <button
                      onClick={applyExamDuration}
                      disabled={examTimer.status === 'running'}
                      className="rounded-2xl bg-amber-500/20 px-5 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      重新设置考试时间
                    </button>
                  </div>

                  <p className="mt-5 text-sm text-slate-400">
                    剩余 30 / 15 / 5 / 1 分钟会明显提醒，考试结束后会自动计入对应科目的学习统计。
                  </p>
                </div>

                {showExamSetup && showExamExpandedInfo && (
                  <section className="mt-8 rounded-3xl bg-slate-50 p-5 dark:bg-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">考试设置</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Field label="考试内容">
                        <input
                          value={examTimer.title}
                          onChange={(event) =>
                            setExamTimer((current) => ({ ...current, title: event.target.value }))
                          }
                          className="input-base"
                          placeholder="例如：高数期中模拟"
                        />
                      </Field>
                      <Field label="科目">
                        <input
                          value={examTimer.subject}
                          onChange={(event) =>
                            setExamTimer((current) => ({ ...current, subject: event.target.value }))
                          }
                          className="input-base"
                          placeholder="例如：高等数学"
                        />
                      </Field>
                      <Field label="小时">
                        <input
                          type="number"
                          min="0"
                          max="12"
                          value={examHours}
                          onChange={(event) => setExamHours(Math.max(0, Number(event.target.value) || 0))}
                          className="input-base"
                        />
                      </Field>
                      <Field label="分钟">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={examMinutes}
                          onChange={(event) => setExamMinutes(Math.min(59, Math.max(0, Number(event.target.value) || 0)))}
                          className="input-base"
                        />
                      </Field>
                    </div>
                  </section>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-3">
            <StatsCard title="最近 7 天学习时长" subtitle="按每日已完成任务与番茄专注时长统计" className="lg:col-span-2">
              <div className="grid gap-3">
                {recentSevenDays.map((item) => (
                  <BarRow
                    key={item.date}
                    label={item.label}
                    value={formatMinutes(item.minutes)}
                    percent={Math.min(100, Math.round((item.minutes / Math.max(...recentSevenDays.map((day) => day.minutes), 1)) * 100))}
                    tone="sky"
                  />
                ))}
              </div>
            </StatsCard>

            <StatsCard title="各科目学习占比" subtitle="按累计学习时长估算">
              <div className="grid gap-3">
                {subjectStats.length === 0 ? (
                  <EmptyText text="暂无学科统计数据，先完成几个任务吧。" />
                ) : (
                  subjectStats.map((item) => (
                    <BarRow
                      key={item.subject}
                      label={item.subject}
                      value={`${item.share}% · ${formatMinutes(item.minutes)}`}
                      percent={item.share}
                      tone="emerald"
                    />
                  ))
                )}
              </div>
            </StatsCard>

            <StatsCard title="完成率趋势" subtitle="最近 7 天每日完成率" className="lg:col-span-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {recentSevenDays.map((item) => (
                  <TrendCard key={item.date} label={item.label} value={`${item.completionRate}%`} percent={item.completionRate} />
                ))}
              </div>
            </StatsCard>
          </section>
        )}
      </div>
    </div>
  )
}

function MetricCard(props: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl bg-white/10 p-3">
      <p className="text-xs text-slate-300 sm:text-sm">{props.label}</p>
      <p className="mt-2 text-lg font-semibold text-white sm:text-2xl">{props.value}</p>
      <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">{props.hint}</p>
    </div>
  )
}

function MetricPanel(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4 shadow-sm dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{props.label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{props.value}</p>
    </div>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{props.label}</span>
      {props.children}
    </label>
  )
}

function StatusButton(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
        props.active
          ? 'bg-slate-900 text-white dark:bg-sky-500'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
      }`}
    >
      {props.label}
    </button>
  )
}

function StatsCard(props: { title: string; subtitle: string; className?: string; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-[26px] bg-white/90 p-4 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/80 dark:ring-slate-800 sm:p-6 ${props.className ?? ''}`}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">{props.subtitle}</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{props.title}</h2>
      <div className="mt-5">{props.children}</div>
    </section>
  )
}

function BarRow(props: { label: string; value: string; percent: number; tone: 'sky' | 'emerald' }) {
  const toneClass =
    props.tone === 'sky' ? 'from-sky-400 to-sky-500 dark:from-sky-400 dark:to-sky-300' : 'from-emerald-400 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300'
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">{props.label}</span>
        <span className="text-slate-500 dark:text-slate-400">{props.value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${toneClass}`}
          style={{ width: `${Math.max(6, props.percent)}%` }}
        />
      </div>
    </div>
  )
}

function TrendCard(props: { label: string; value: string; percent: number }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
      <p className="text-sm text-slate-500 dark:text-slate-400">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{props.value}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${Math.max(4, props.percent)}%` }} />
      </div>
    </div>
  )
}

function EmptyText(props: { text: string }) {
  return <p className="text-sm text-slate-500 dark:text-slate-400">{props.text}</p>
}

function SingleAxisTimeline(props: { items: TimelineItem[] }) {
  const fullStart = 7 * 60
  const fullEnd = 23 * 60
  return (
    <div className="grid gap-4">
      <div className="relative h-24">
        <div className="absolute inset-x-0 top-10 h-8 rounded-3xl bg-slate-100 dark:bg-slate-800" />
        {props.items.map((item) => {
          const start = Math.max(fullStart, timeToMinutes(item.startTime))
          const end = Math.min(fullEnd, timeToMinutes(item.endTime))
          const left = ((start - fullStart) / (fullEnd - fullStart)) * 100
          const width = Math.max(((end - start) / (fullEnd - fullStart)) * 100, 4)
          const toneClass =
            item.tone === 'course'
              ? 'from-blue-500 to-blue-600 dark:from-blue-400 dark:to-blue-500'
              : 'from-amber-400 to-orange-500 dark:from-amber-400 dark:to-orange-300'

          return (
            <div
              key={item.id}
              className={`group absolute top-10 h-8 rounded-2xl bg-gradient-to-r px-2 py-1 text-[11px] font-medium text-white shadow-sm transition hover:z-20 ${toneClass}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${item.title} ${item.startTime}-${item.endTime}`}
            >
              <div className="truncate">{item.title}</div>
              <div className="pointer-events-none absolute left-1/2 top-0 z-30 w-44 -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-2xl bg-slate-950/95 px-3 py-2 text-left text-[11px] text-white opacity-0 shadow-xl transition group-hover:opacity-100 dark:bg-slate-700/95">
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-slate-300">
                  {item.tone === 'course' ? '课程安排' : '学习任务'} · {item.startTime} - {item.endTime}
                </p>
                <p className="mt-1 text-slate-300">{item.subtitle}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-5 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>07:00</span>
        <span className="text-center">11:00</span>
        <span className="text-center">15:00</span>
        <span className="text-center">19:00</span>
        <span className="text-right">23:00</span>
      </div>

      <div className="grid gap-2">
        {props.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${
                  item.tone === 'course' ? 'bg-blue-500 dark:bg-blue-400' : 'bg-amber-400 dark:bg-amber-300'
                }`}
              />
              <span className="font-medium text-slate-800 dark:text-slate-100">{item.title}</span>
              <span className="text-slate-500 dark:text-slate-400">{item.subtitle}</span>
            </div>
            <span className="text-slate-500 dark:text-slate-400">
              {item.startTime} - {item.endTime}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function sendNotification(title: string, body: string, permission: NotificationPermission) {
  if (typeof Notification === 'undefined' || permission !== 'granted') return
  new Notification(title, { body })
}

export default App
