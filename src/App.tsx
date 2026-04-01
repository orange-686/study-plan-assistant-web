import { useEffect, useMemo, useRef, useState } from 'react'

type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed'
type Priority = 'high' | 'medium' | 'low'
type PomodoroPhase = 'focus' | 'break'
type AppView = 'planner' | 'stats'
type ThemeMode = 'light' | 'dark'
type ScheduleMode = 'fixed' | 'flexible'

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

const TASKS_STORAGE_KEY = 'study-planner-tasks'
const SETTINGS_STORAGE_KEY = 'study-planner-settings'
const NOTIFICATION_STORAGE_KEY = 'study-planner-notification-log'
const COURSES_STORAGE_KEY = 'study-planner-courses'
const THEME_STORAGE_KEY = 'study-planner-theme'

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

const defaultPomodoroState = (focusMinutes: number): PomodoroState => ({
  activeTaskId: null,
  phase: 'focus',
  isRunning: false,
  secondsLeft: focusMinutes * 60,
  cycleCount: 0,
})

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
    const last = merged.at(-1)
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
  dateString: string,
  duration: number,
  windowStartTime: string,
  windowEndTime: string,
  excludeTaskId?: string,
) => {
  const courseRanges = getCourseRanges(courses, dateString)
  const bufferedCourseRanges = courseRanges.map((range) => ({
    start: Math.max(7 * 60, range.start - 15),
    end: Math.min(23 * 60, range.end + 15),
  }))
  const minimumStartMinute = getMinimumStartMinute(dateString)
  const dayStart = Math.max(7 * 60, timeToMinutes(windowStartTime), minimumStartMinute)
  const dayEnd = Math.min(23 * 60, timeToMinutes(windowEndTime))
  if (dayStart >= dayEnd || dayEnd - dayStart < duration) {
    return null
  }
  const blockedRanges = mergeRanges([
    ...getTaskRanges(tasks, dateString, excludeTaskId),
    ...bufferedCourseRanges,
  ])
  const availableRanges = getAvailableRanges(blockedRanges, dayStart, dayEnd)
  const preferredRanges: TimeRange[] = [
    { start: 8 * 60, end: 12 * 60 },
    { start: 13 * 60 + 30, end: 17 * 60 + 30 },
    { start: 19 * 60, end: 21 * 60 + 30 },
  ]

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

const findSuggestedSlots = (tasks: StudyTask[], courses: CourseBlock[], dateString: string) => {
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
      dateString,
      task.estimatedMinutes,
      '07:00',
      '23:00',
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
          status: task.status === 'in_progress' ? 'delayed' : task.status,
          updatedAt: new Date().toISOString(),
        }
      : task
  })

const loadTasks = () => {
  const raw = localStorage.getItem(TASKS_STORAGE_KEY)
  if (!raw) return []
  try {
    return rollOverTasks((JSON.parse(raw) as StudyTask[]).map(normalizeTask), todayString())
  } catch {
    return []
  }
}

const loadSettings = (): PomodoroSettings => {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
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

const loadCourses = () => {
  const raw = localStorage.getItem(COURSES_STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as CourseBlock[]
  } catch {
    return []
  }
}

const loadTheme = (): ThemeMode => {
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  if (raw === 'light' || raw === 'dark') return raw
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const readNotificationLog = (): Record<string, string> => {
  const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
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
  const [theme, setTheme] = useState<ThemeMode>(loadTheme)
  const [scheduleMessage, setScheduleMessage] = useState('等待生成建议排程')
  const [validationMessage, setValidationMessage] = useState('')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  )
  const [pomodoro, setPomodoro] = useState<PomodoroState>(() =>
    defaultPomodoroState(loadSettings().focusMinutes),
  )
  const notificationLogRef = useRef<Record<string, string>>(readNotificationLog())

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

  const todayTasks = useMemo(() => tasks.filter((task) => task.plannedDate === todayString()), [tasks])

  const todayCompletionRate = useMemo(() => {
    if (todayTasks.length === 0) return 0
    const completed = todayTasks.filter((task) => task.status === 'completed').length
    return Math.round((completed / todayTasks.length) * 100)
  }, [todayTasks])

  const weeklyMinutes = useMemo(() => {
    const weekStart = getWeekStart()
    const weekEnd = addDays(weekStart.toISOString().slice(0, 10), 7)
    return tasks.reduce((total, task) => {
      if (task.plannedDate >= weekStart.toISOString().slice(0, 10) && task.plannedDate < weekEnd) {
        return total + getTaskEffectiveMinutes(task)
      }
      return total
    }, 0)
  }, [tasks])

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === pomodoro.activeTaskId) ?? null,
    [pomodoro.activeTaskId, tasks],
  )

  const livePreviewSlot = useMemo(() => {
    if (!form.title.trim() || Number(form.estimatedMinutes) <= 0) return null
    if (form.scheduleMode !== 'flexible') return null
    const computedEndTime = calculateEndTime(form.startTime, Number(form.estimatedMinutes))
    if (timeToMinutes(computedEndTime) > 23 * 60) return null
    return findAutoSlotForTask(
      tasks,
      courses,
      selectedDate,
      Number(form.estimatedMinutes),
      form.startTime,
      '23:00',
      editingTaskId ?? undefined,
    )
  }, [
    courses,
    editingTaskId,
    form.estimatedMinutes,
    form.scheduleMode,
    form.startTime,
    form.title,
    selectedDate,
    tasks,
  ])

  const suggestedSlots = useMemo(
    () => findSuggestedSlots(tasks, courses, selectedDate),
    [courses, selectedDate, tasks],
  )

  const recentSevenDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(todayString(), index - 6)
      const minutes = tasks
        .filter((task) => task.plannedDate === date)
        .reduce((total, task) => total + getTaskEffectiveMinutes(task), 0)
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
        minutes,
        completionRate,
      }
    })
  }, [tasks])

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
    const total = [...subjectMap.values()].reduce((sum, value) => sum + value, 0)
    return [...subjectMap.entries()]
      .map(([subject, minutes]) => ({
        subject,
        minutes,
        share: total === 0 ? 0 : Math.round((minutes / total) * 100),
      }))
      .sort((first, second) => second.minutes - first.minutes)
  }, [tasks])

  useEffect(() => {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(courses))
  }, [courses])

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (!pomodoro.isRunning) return
    const timer = window.setInterval(() => {
      setPomodoro((current) => {
        if (!current.isRunning) return current
        if (current.secondsLeft > 1) {
          return { ...current, secondsLeft: current.secondsLeft - 1 }
        }

        const finishedPhase = current.phase
        const nextPhase: PomodoroPhase = finishedPhase === 'focus' ? 'break' : 'focus'
        const nextSeconds =
          nextPhase === 'focus' ? settings.focusMinutes * 60 : settings.breakMinutes * 60

        if (finishedPhase === 'focus' && current.activeTaskId) {
          setTasks((currentTasks) =>
            currentTasks.map((task) =>
              task.id === current.activeTaskId
                ? {
                    ...task,
                    actualMinutes: task.actualMinutes + settings.focusMinutes,
                    updatedAt: new Date().toISOString(),
                  }
                : task,
            ),
          )
        }

        sendNotification(
          finishedPhase === 'focus' ? '专注结束，休息一下' : '休息结束，准备下一轮专注',
          finishedPhase === 'focus'
            ? `${activeTask?.title ?? '当前任务'} 的番茄钟已完成。`
            : '新的专注周期已经准备好了。',
          notificationPermission,
        )

        return {
          ...current,
          phase: nextPhase,
          secondsLeft: nextSeconds,
          cycleCount: finishedPhase === 'break' ? current.cycleCount + 1 : current.cycleCount,
        }
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [activeTask?.title, notificationPermission, pomodoro.isRunning, settings.breakMinutes, settings.focusMinutes])

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

      localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notificationLogRef.current))
    }, 30000)

    return () => window.clearInterval(reminderTimer)
  }, [notificationPermission, tasks])

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
    const conflictingWithCourses = isTaskConflictingWithCourses(
      form.startTime,
      computedDeadline,
      courses,
      selectedDate,
    )

    if ((conflictingWithCourses || startTooSoon) && form.scheduleMode === 'flexible') {
      const autoSlot = findAutoSlotForTask(
        tasks,
        courses,
        selectedDate,
        Number(form.estimatedMinutes),
        form.startTime,
        '23:00',
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
        id: crypto.randomUUID(),
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
            ? {
                ...task,
                status,
                plannedDate: task.status === 'delayed' && task.postponedFromDate ? task.postponedFromDate : task.plannedDate,
                postponedFromDate: task.status === 'delayed' ? undefined : task.postponedFromDate,
                updatedAt: new Date().toISOString(),
              }
            : task,
        ),
      )
      setScheduleMessage(
        status === 'not_started'
          ? '已取消延期，任务已从明天的列表中移除并回到原计划日期。'
          : '任务状态已更新。',
      )
      return
    }

    const targetTask = tasks.find((task) => task.id === taskId)
    if (!targetTask) return
    const tomorrow = addDays(targetTask.plannedDate, 1)
    const windowStartTime = targetTask.scheduleMode === 'fixed' ? targetTask.startTime : '07:00'
    const windowEndTime = targetTask.scheduleMode === 'fixed' ? targetTask.deadline : '23:00'
    const autoSlot =
      targetTask.scheduleMode === 'flexible'
        ? findAutoSlotForTask(
            tasks.filter((task) => task.id !== taskId),
            courses,
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

  const startPomodoro = (taskId: string) => {
    updateTaskStatus(taskId, 'in_progress')
    setPomodoro((current) => ({
      ...current,
      activeTaskId: taskId,
      isRunning: true,
      phase: current.phase,
      secondsLeft:
        current.secondsLeft > 0
          ? current.secondsLeft
          : (current.phase === 'focus' ? settings.focusMinutes : settings.breakMinutes) * 60,
    }))
  }

  const pausePomodoro = () => {
    setPomodoro((current) => ({ ...current, isRunning: false }))
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
        secondsLeft: (nextPhase === 'focus' ? settings.focusMinutes : settings.breakMinutes) * 60,
        isRunning: false,
      }
    })
  }

  const addCourse = () => {
    if (!courseForm.name.trim()) return
    if (timeToMinutes(courseForm.endTime) <= timeToMinutes(courseForm.startTime)) return
    const course: CourseBlock = {
      id: crypto.randomUUID(),
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
            <div className="grid gap-3 rounded-3xl bg-white/10 p-3 backdrop-blur sm:grid-cols-3">
              <MetricCard label="今日完成率" value={`${todayCompletionRate}%`} hint="按今日任务状态实时计算" />
              <MetricCard label="本周学习时长" value={formatMinutes(weeklyMinutes)} hint="优先统计实际专注时长" />
              <MetricCard label="今日课程数" value={`${selectedDateCourses.length}`} hint="课表时段自动避开额外排程" />
            </div>
          </div>
        </section>

        {view === 'planner' ? (
          <section className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="grid gap-4">
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
                  </div>
                </div>

                <div className="mb-4 rounded-3xl bg-sand px-4 py-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <p className="font-medium">排程反馈</p>
                  <p className="mt-1">{scheduleMessage}</p>
                </div>

                <div className="grid gap-3">
                  {selectedDateTasks.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      这一天还没有学习任务，先在右侧添加任务或生成建议排程。
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
              </section>

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
            </div>

            <div className="grid gap-4">
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
                        <>
                          <p className="mt-1">
                            系统当前建议安排在 {livePreviewSlot.startTime} - {livePreviewSlot.deadline}。点击下方保存时，如果你选择的开始时间不满足规则，将自动采用该建议时段。
                          </p>
                        </>
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
