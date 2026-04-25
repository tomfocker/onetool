import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  MapPin,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DEFAULT_CALENDAR_GRID_CONFIG,
  calculateSelectionPosition,
  getCalendarGridHeight,
  minutesFromTime,
  resolveDraggedEventPreview,
  resolveSelectionRange,
  type CalendarTimeRange,
  type DraggedEventPreview
} from './calendarTime'
import { parseCalendarAssistantMessage } from './calendarAssistant'
import {
  CALENDAR_STORAGE_KEY,
  CALENDAR_TIME_RANGE_STORAGE_KEY,
  expandCalendarTimeRangeToEvent,
  getTodayDate,
  loadCalendarEvents,
  loadCalendarTimeRange,
  normalizeCalendarTimeRange,
  type CalendarDisplayTimeRange
} from './calendarStorage'
import {
  findCalendarEventConflicts,
  layoutCalendarEventsForDay,
  type CalendarEventLayoutItem
} from './calendarEventLayout'
import type { LlmCalendarAssistantResult } from '../../../shared/llm'

type CalendarName = '个人' | '工作' | '家庭' | '重要'
type CalendarView = 'day' | 'week' | 'month'

interface CalendarEvent {
  id: string
  title: string
  date: string
  start: string
  end: string
  calendar: CalendarName
  color: string
  location: string
  participants: string
  description: string
}

type EventDraft = Omit<CalendarEvent, 'id'>

interface AssistantChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const TODAY = getTodayDate()

type CalendarInteraction =
  | {
    type: 'select'
    date: string
    pointerId: number
    startY: number
    currentY: number
  }
  | {
    type: 'move'
    event: CalendarEvent
    pointerId: number
    durationMinutes: number
    grabOffsetY: number
    startClientX: number
    startClientY: number
    hasMoved: boolean
    preview: DraggedEventPreview
  }

const CALENDAR_COLORS: Record<CalendarName, string> = {
  个人: '#2f6df6',
  工作: '#38b887',
  家庭: '#7457d8',
  重要: '#ca8528'
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function addDays(value: string, days: number): string {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDate(date)
}

function startOfWeek(value: string): string {
  const date = parseDate(value)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return formatDate(date)
}

function monthTitle(value: string): string {
  const date = parseDate(value)
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`
}

function dayLabel(value: string): string {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const date = parseDate(value)
  return `${labels[date.getUTCDay()]} ${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createDefaultDraft(date: string, range?: Pick<CalendarTimeRange, 'start' | 'end'>): EventDraft {
  return {
    title: '',
    date,
    start: range?.start ?? '09:00',
    end: range?.end ?? '10:00',
    calendar: '工作',
    color: CALENDAR_COLORS.工作,
    location: '',
    participants: '',
    description: ''
  }
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date)
    if (byDate !== 0) return byDate
    return minutesFromTime(left.start) - minutesFromTime(right.start)
  })
}

function getGridPointerY(element: HTMLElement, clientY: number): number {
  return clientY - element.getBoundingClientRect().top
}

function findDateColumnAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const element = document.elementFromPoint(clientX, clientY)
  return element?.closest<HTMLElement>('[data-calendar-date]') ?? null
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export default function CalendarTool(): React.JSX.Element {
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadCalendarEvents(window.localStorage) as CalendarEvent[])
  const [displayTimeRange, setDisplayTimeRange] = useState<CalendarDisplayTimeRange>(() => loadCalendarTimeRange(window.localStorage))
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [view, setView] = useState<CalendarView>('week')
  const [search, setSearch] = useState('')
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EventDraft>(() => createDefaultDraft(TODAY))
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiThinking, setAiThinking] = useState(false)
  const [aiMessages, setAiMessages] = useState<AssistantChatMessage[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: '可以直接告诉我：明天下午3点安排设计评审，地点会议室A。我会创建到本地日历里。'
    }
  ])
  const [toast, setToast] = useState('')
  const [interaction, setInteraction] = useState<CalendarInteraction | null>(null)
  const interactionRef = useRef<CalendarInteraction | null>(null)
  const pendingInteractionRef = useRef<CalendarInteraction | null>(null)
  const interactionFrameRef = useRef<number | null>(null)
  const suppressNextEventClickRef = useRef(false)

  useEffect(() => {
    window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(events))
  }, [events])

  useEffect(() => {
    window.localStorage.setItem(CALENDAR_TIME_RANGE_STORAGE_KEY, JSON.stringify(displayTimeRange))
  }, [displayTimeRange])

  useEffect(() => {
    setDisplayTimeRange((current) => {
      const expanded = events.reduce<CalendarDisplayTimeRange>(expandCalendarTimeRangeToEvent, current)
      return expanded.startHour === current.startHour && expanded.endHour === current.endHour ? current : expanded
    })
  }, [events])

  useEffect(() => {
    const timer = window.setTimeout(() => setAiOpen(true), 3000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    return () => {
      if (interactionFrameRef.current !== null) window.cancelAnimationFrame(interactionFrameRef.current)
    }
  }, [])

  useEffect(() => {
    interactionRef.current = interaction
  }, [interaction])

  const weekDates = useMemo(() => {
    const start = startOfWeek(selectedDate)
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }, [selectedDate])

  const gridConfig = useMemo(() => ({
    ...DEFAULT_CALENDAR_GRID_CONFIG,
    startHour: displayTimeRange.startHour,
    endHour: displayTimeRange.endHour
  }), [displayTimeRange])

  const gridHeight = useMemo(() => getCalendarGridHeight(gridConfig), [gridConfig])
  const timeRangeOptions = useMemo(() => Array.from({ length: 25 }, (_, hour) => hour), [])

  const visibleEvents = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sortEvents(events)
    return sortEvents(events).filter((event) => {
      return `${event.title} ${event.date} ${event.start} ${event.end} ${event.calendar} ${event.location} ${event.participants} ${event.description}`
        .toLowerCase()
        .includes(term)
    })
  }, [events, search])

  const calendarCounts = useMemo(() => {
    return events.reduce<Record<CalendarName, number>>((accumulator, event) => {
      accumulator[event.calendar] += 1
      return accumulator
    }, { 个人: 0, 工作: 0, 家庭: 0, 重要: 0 })
  }, [events])

  const activeEvent = events.find((event) => event.id === activeEventId) ?? null

  const showToast = (message: string) => setToast(message)

  const describeConflictToast = (message: string, conflicts: CalendarEvent[]) => (
    conflicts.length > 0 ? `${message}，与 ${conflicts.length} 个日程重叠，已并排显示` : message
  )

  const updateDisplayStartHour = (value: string) => {
    const startHour = Number(value)
    setDisplayTimeRange((current) => normalizeCalendarTimeRange({
      startHour,
      endHour: Math.max(current.endHour, startHour + 1)
    }))
  }

  const updateDisplayEndHour = (value: string) => {
    const endHour = Number(value)
    setDisplayTimeRange((current) => normalizeCalendarTimeRange({
      startHour: Math.min(current.startHour, endHour - 1),
      endHour
    }))
  }

  const commitInteraction = (nextInteraction: CalendarInteraction | null) => {
    interactionRef.current = nextInteraction
    pendingInteractionRef.current = null
    if (interactionFrameRef.current !== null) {
      window.cancelAnimationFrame(interactionFrameRef.current)
      interactionFrameRef.current = null
    }
    setInteraction(nextInteraction)
  }

  const scheduleInteraction = (nextInteraction: CalendarInteraction) => {
    interactionRef.current = nextInteraction
    pendingInteractionRef.current = nextInteraction
    if (interactionFrameRef.current !== null) return
    interactionFrameRef.current = window.requestAnimationFrame(() => {
      interactionFrameRef.current = null
      if (!pendingInteractionRef.current) return
      setInteraction(pendingInteractionRef.current)
      pendingInteractionRef.current = null
    })
  }

  const openCreateForm = (date = selectedDate) => {
    setDraft(createDefaultDraft(date))
    setEditingEventId(null)
    setFormOpen(true)
  }

  const openEditForm = (event: CalendarEvent) => {
    const { id: _id, ...nextDraft } = event
    setDraft(nextDraft)
    setEditingEventId(event.id)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingEventId(null)
  }

  const saveDraft = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.title.trim()) {
      showToast('请先填写日程标题')
      return
    }
    if (minutesFromTime(draft.end) <= minutesFromTime(draft.start)) {
      showToast('结束时间必须晚于开始时间')
      return
    }

    const conflicts = findCalendarEventConflicts(events, draft, editingEventId ?? undefined)
    if (editingEventId) {
      setEvents((current) => sortEvents(current.map((item) => item.id === editingEventId ? { ...draft, id: item.id } : item)))
      showToast(describeConflictToast('日程已更新', conflicts))
    } else {
      setEvents((current) => sortEvents([...current, { ...draft, id: createId() }]))
      setSelectedDate(draft.date)
      showToast(describeConflictToast('日程已创建', conflicts))
    }
    setDisplayTimeRange((current) => expandCalendarTimeRangeToEvent(current, draft))
    closeForm()
  }

  const deleteActiveEvent = () => {
    if (!activeEvent) return
    deleteEvent(activeEvent)
  }

  const deleteEvent = (calendarEvent: CalendarEvent) => {
    if (!window.confirm(`删除「${calendarEvent.title}」？此操作会更新 OneTool 本地日历数据。`)) return
    setEvents((current) => current.filter((event) => event.id !== calendarEvent.id))
    if (activeEventId === calendarEvent.id) {
      setActiveEventId(null)
    }
    showToast('日程已删除')
  }

  const updateDraft = <Key extends keyof EventDraft>(key: Key, value: EventDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const addAssistantMessage = (role: AssistantChatMessage['role'], content: string) => {
    setAiMessages((current) => [
      ...current,
      {
        id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        content
      }
    ].slice(-8))
  }

  const buildAssistantContext = () => ({
    selectedDate,
    today: TODAY,
    events: sortEvents(events).map((event) => ({
      title: event.title,
      date: event.date,
      start: event.start,
      end: event.end,
      calendar: event.calendar,
      location: event.location,
      participants: event.participants,
      description: event.description
    }))
  })

  const parseWithLocalFallback = (message: string): LlmCalendarAssistantResult => (
    parseCalendarAssistantMessage(message, {
      selectedDate,
      today: TODAY
    }) as LlmCalendarAssistantResult
  )

  const resolveAssistantResult = async (message: string): Promise<LlmCalendarAssistantResult> => {
    const llmApi = window.electron?.llm
    if (!llmApi?.parseCalendarAssistant) {
      return parseWithLocalFallback(message)
    }

    setAiThinking(true)
    try {
      const response = await llmApi.parseCalendarAssistant({
        message,
        context: buildAssistantContext()
      })
      if (response.success && response.data) {
        return response.data
      }

      const fallback = parseWithLocalFallback(message)
      return {
        ...fallback,
        message: `本地 LLM 暂时不可用${response.error ? `（${response.error}）` : ''}，我先用本地规则处理：${fallback.message}`
      }
    } catch (error) {
      const fallback = parseWithLocalFallback(message)
      const reason = error instanceof Error ? error.message : String(error)
      return {
        ...fallback,
        message: `本地 LLM 暂时不可用（${reason}），我先用本地规则处理：${fallback.message}`
      }
    } finally {
      setAiThinking(false)
    }
  }

  const applyAssistantResult = (result: LlmCalendarAssistantResult) => {
    if (result.type === 'create') {
      const event: CalendarEvent = {
        ...result.event,
        calendar: result.event.calendar as CalendarName,
        id: createId()
      }
      const conflicts = findCalendarEventConflicts(events, event)
      setEvents((current) => sortEvents([...current, event]))
      setSelectedDate(event.date)
      setDisplayTimeRange((current) => expandCalendarTimeRangeToEvent(current, event))
      addAssistantMessage('assistant', result.message)
      showToast(describeConflictToast(`AI 已创建：${event.title}`, conflicts))
      return
    }

    if (result.type === 'filter') {
      setSearch(result.search)
      addAssistantMessage('assistant', result.message)
      showToast(result.message)
      return
    }

    addAssistantMessage('assistant', result.message)
  }

  const submitAssistantMessage = async (rawMessage = aiInput) => {
    const message = rawMessage.trim()
    if (!message || aiThinking) return
    addAssistantMessage('user', message)
    setAiInput('')

    const result = await resolveAssistantResult(message)
    applyAssistantResult(result)
  }

  const handleAssistantQuickAction = (label: string) => {
    if (label === '查看今天') {
      setSelectedDate(TODAY)
      setView('day')
      addAssistantMessage('user', label)
      addAssistantMessage('assistant', '已切换到今天的日视图。')
      return
    }
    if (label === '客户日程') {
      submitAssistantMessage('查看客户日程')
      return
    }
  }

  const beginTimeSelection = (date: string, pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (pointerEvent.button !== 0) return
    if ((pointerEvent.target as HTMLElement).closest('[data-calendar-event]')) return
    const currentY = getGridPointerY(pointerEvent.currentTarget, pointerEvent.clientY)
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId)
    pointerEvent.preventDefault()
    commitInteraction({
      type: 'select',
      date,
      pointerId: pointerEvent.pointerId,
      startY: currentY,
      currentY
    })
  }

  const updateTimeSelection = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const activeInteraction = interactionRef.current
    if (activeInteraction?.type !== 'select' || activeInteraction.pointerId !== pointerEvent.pointerId) return
    const currentY = getGridPointerY(pointerEvent.currentTarget, pointerEvent.clientY)
    if (Math.abs(currentY - activeInteraction.currentY) < 2) return
    scheduleInteraction({
      ...activeInteraction,
      currentY
    })
  }

  const finishTimeSelection = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const activeInteraction = interactionRef.current
    if (activeInteraction?.type !== 'select' || activeInteraction.pointerId !== pointerEvent.pointerId) return
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId)
    }
    const selection = {
      ...activeInteraction,
      currentY: getGridPointerY(pointerEvent.currentTarget, pointerEvent.clientY)
    }
    const range = resolveSelectionRange(selection.startY, selection.currentY, gridConfig)
    commitInteraction(null)
    setDraft(createDefaultDraft(selection.date, range))
    setEditingEventId(null)
    setSelectedDate(selection.date)
    setFormOpen(true)
    showToast(`已选中 ${range.start} - ${range.end}`)
  }

  const cancelTimeSelection = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const activeInteraction = interactionRef.current
    if (activeInteraction?.type !== 'select' || activeInteraction.pointerId !== pointerEvent.pointerId) return
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId)
    }
    commitInteraction(null)
  }

  const beginEventMove = (calendarEvent: CalendarEvent, pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (pointerEvent.button !== 0) return
    const column = pointerEvent.currentTarget.closest<HTMLElement>('[data-calendar-date]')
    if (!column) return
    const startMinutes = minutesFromTime(calendarEvent.start)
    const durationMinutes = minutesFromTime(calendarEvent.end) - startMinutes
    const pointerY = getGridPointerY(column, pointerEvent.clientY)
    const eventTop = ((startMinutes - gridConfig.startHour * 60) / 60) * gridConfig.hourHeight
    const grabOffsetY = pointerY - eventTop
    const preview = resolveDraggedEventPreview({
      date: calendarEvent.date,
      durationMinutes,
      grabOffsetY,
      pointerY
    }, gridConfig)

    pointerEvent.stopPropagation()
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId)
    commitInteraction({
      type: 'move',
      event: calendarEvent,
      pointerId: pointerEvent.pointerId,
      durationMinutes,
      grabOffsetY,
      startClientX: pointerEvent.clientX,
      startClientY: pointerEvent.clientY,
      hasMoved: false,
      preview
    })
  }

  const updateEventMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const activeInteraction = interactionRef.current
    if (activeInteraction?.type !== 'move' || activeInteraction.pointerId !== pointerEvent.pointerId) return
    const column = findDateColumnAtPoint(pointerEvent.clientX, pointerEvent.clientY)
      ?? pointerEvent.currentTarget.closest<HTMLElement>('[data-calendar-date]')
    if (!column?.dataset.calendarDate) return
    const preview = resolveDraggedEventPreview({
      date: column.dataset.calendarDate,
      durationMinutes: activeInteraction.durationMinutes,
      grabOffsetY: activeInteraction.grabOffsetY,
      pointerY: getGridPointerY(column, pointerEvent.clientY)
    }, gridConfig)
    const hasMoved = activeInteraction.hasMoved
      || Math.abs(pointerEvent.clientX - activeInteraction.startClientX) > 4
      || Math.abs(pointerEvent.clientY - activeInteraction.startClientY) > 4

    if (
      hasMoved === activeInteraction.hasMoved
      && preview.date === activeInteraction.preview.date
      && Math.abs(preview.top - activeInteraction.preview.top) < 0.5
      && preview.drop.start === activeInteraction.preview.drop.start
      && preview.drop.end === activeInteraction.preview.drop.end
    ) {
      return
    }

    scheduleInteraction({
      ...activeInteraction,
      hasMoved,
      preview
    })
  }

  const finishEventMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const activeInteraction = interactionRef.current
    if (activeInteraction?.type !== 'move' || activeInteraction.pointerId !== pointerEvent.pointerId) return
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId)
    }
    commitInteraction(null)

    if (!activeInteraction.hasMoved) return
    suppressNextEventClickRef.current = true
    const { drop } = activeInteraction.preview
    const conflicts = findCalendarEventConflicts(events, drop, activeInteraction.event.id)
    setEvents((current) => sortEvents(current.map((item) => (
      item.id === activeInteraction.event.id
        ? { ...item, date: drop.date, start: drop.start, end: drop.end }
        : item
    ))))
    setSelectedDate(drop.date)
    setDisplayTimeRange((current) => expandCalendarTimeRangeToEvent(current, drop))
    showToast(describeConflictToast(`已移动到 ${drop.date} ${drop.start} - ${drop.end}`, conflicts))
  }

  const cancelEventMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const activeInteraction = interactionRef.current
    if (activeInteraction?.type !== 'move' || activeInteraction.pointerId !== pointerEvent.pointerId) return
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId)
    }
    commitInteraction(null)
  }

  const moveDate = (direction: number) => {
    if (view === 'month') {
      const date = parseDate(selectedDate)
      date.setUTCMonth(date.getUTCMonth() + direction)
      setSelectedDate(formatDate(date))
      return
    }
    setSelectedDate(addDays(selectedDate, direction * (view === 'week' ? 7 : 1)))
  }

  const renderEventButton = (layout: CalendarEventLayoutItem<CalendarEvent>) => {
    const { event, top, height, leftPercent, widthPercent, overlapCount } = layout
    const match = visibleEvents.some((item) => item.id === event.id)
    const isMoving = interaction?.type === 'move' && interaction.event.id === event.id
    return (
      <div
        key={event.id}
        role="button"
        tabIndex={0}
        data-calendar-event
        onClick={() => {
          if (suppressNextEventClickRef.current) {
            suppressNextEventClickRef.current = false
            return
          }
          setActiveEventId(event.id)
        }}
        onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
            keyboardEvent.preventDefault()
            setActiveEventId(event.id)
          }
        }}
        onPointerDown={(pointerEvent) => beginEventMove(event, pointerEvent)}
        onPointerMove={updateEventMove}
        onPointerUp={finishEventMove}
        onPointerCancel={cancelEventMove}
        className={cn(
          'group absolute z-10 touch-none cursor-grab overflow-hidden rounded-2xl border border-white/20 px-3 py-2 text-left text-white shadow-xl outline-none will-change-transform active:cursor-grabbing',
          overlapCount === 1 ? 'pr-11' : 'pr-8',
          !isMoving && 'transition-all hover:-translate-y-1',
          search && !match && 'opacity-25 grayscale',
          search && match && 'ring-2 ring-white/80',
          isMoving && 'opacity-25 ring-2 ring-blue-200/80 transition-none',
          'focus-visible:ring-2 focus-visible:ring-white/90'
        )}
        style={{
          top,
          height,
          left: `calc(${leftPercent}% + 0.75rem)`,
          width: `calc(${widthPercent}% - 1.5rem)`,
          background: `linear-gradient(135deg, ${event.color}, color-mix(in srgb, ${event.color} 72%, #173040 28%))`
        }}
      >
        <button
          type="button"
          aria-label={`删除${event.title}`}
          title="删除日程"
          onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
          onClick={(clickEvent) => {
            clickEvent.stopPropagation()
            deleteEvent(event)
          }}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-xl bg-slate-950/25 text-white/75 opacity-100 backdrop-blur transition hover:bg-red-500/90 hover:text-white lg:opacity-0 lg:group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
        <span className="block truncate text-base font-black tracking-tight">{event.title}</span>
        <span className="mt-1 block truncate text-xs font-bold text-white/80">{event.start} - {event.end}</span>
      </div>
    )
  }

  const renderEventsForDate = (date: string) => (
    layoutCalendarEventsForDay(events.filter((event) => event.date === date), gridConfig).map(renderEventButton)
  )

  const renderInteractionPreview = (date: string) => {
    if (interaction?.type === 'select' && interaction.date === date) {
      const range = resolveSelectionRange(interaction.startY, interaction.currentY, gridConfig)
      const { top, height } = calculateSelectionPosition(range, gridConfig)

      return (
        <div
          className="pointer-events-none absolute left-3 right-3 z-20 rounded-2xl border border-blue-200/70 bg-blue-400/25 px-3 py-2 text-sm font-black text-white shadow-2xl shadow-blue-950/30 ring-1 ring-white/25 backdrop-blur-md"
          style={{ top, height: Math.max(height, 34) }}
        >
          <span className="block truncate">新日程</span>
          <span className="mt-1 block text-xs text-white/80">{range.start} - {range.end}</span>
        </div>
      )
    }

    if (interaction?.type === 'move' && interaction.preview.date === date) {
      const { preview } = interaction

      return (
        <div
          className="pointer-events-none absolute left-3 right-3 z-30 overflow-hidden rounded-2xl border border-white/60 px-3 py-2 text-left text-white shadow-2xl ring-2 ring-blue-200/80 backdrop-blur-md"
          style={{
            top: 0,
            height: preview.height,
            transform: `translate3d(0, ${preview.top}px, 0)`,
            background: `linear-gradient(135deg, ${interaction.event.color}, color-mix(in srgb, ${interaction.event.color} 68%, #dff3ff 32%))`
          }}
        >
          <span className="block truncate text-base font-black tracking-tight">{interaction.event.title}</span>
          <span className="mt-1 block truncate text-xs font-bold text-white/85">松手后 {preview.drop.start} - {preview.drop.end}</span>
        </div>
      )
    }

    return null
  }

  const renderTimeLabels = () => (
    <div className="relative bg-white/[0.03]" style={{ minHeight: gridHeight }}>
      {Array.from({ length: gridConfig.endHour - gridConfig.startHour }, (_, index) => (
        <span
          key={index}
          className="absolute right-3 text-xs font-bold tabular-nums text-white/60 2xl:right-4 2xl:text-sm"
          style={{ top: index * gridConfig.hourHeight }}
        >
          {gridConfig.startHour + index}:00
        </span>
      ))}
    </div>
  )

  const renderWeekView = () => (
    <div className="min-w-[860px] 2xl:min-w-[980px]">
      <div className="grid grid-cols-[72px_repeat(7,minmax(104px,1fr))] gap-0 2xl:grid-cols-[86px_repeat(7,minmax(126px,1fr))]">
        <div className="flex h-14 items-center justify-center text-sm font-black text-white/70">时间</div>
        {weekDates.map((date) => (
          <div key={date} className={cn('flex h-14 items-center justify-center rounded-2xl text-sm font-black text-white/80', date === selectedDate && 'bg-white/15 text-white')}>
            {dayLabel(date)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[72px_repeat(7,minmax(104px,1fr))] 2xl:grid-cols-[86px_repeat(7,minmax(126px,1fr))]">
        {renderTimeLabels()}
        {weekDates.map((date) => (
          <div
            key={date}
            data-calendar-date={date}
            onPointerDown={(pointerEvent) => beginTimeSelection(date, pointerEvent)}
            onPointerMove={updateTimeSelection}
            onPointerUp={finishTimeSelection}
            onPointerCancel={cancelTimeSelection}
            className={cn('relative select-none border-l border-white/10 bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.02)_0,rgba(255,255,255,0.02)_91px,rgba(255,255,255,0.08)_91px,rgba(255,255,255,0.08)_92px)]', date === selectedDate && 'bg-white/[0.05]')}
            style={{ minHeight: gridHeight }}
          >
            {renderEventsForDate(date)}
            {renderInteractionPreview(date)}
          </div>
        ))}
      </div>
    </div>
  )

  const renderDayView = () => (
    <div className="min-w-[620px] 2xl:min-w-[760px]">
      <div className="grid grid-cols-[72px_minmax(480px,1fr)] 2xl:grid-cols-[86px_minmax(520px,1fr)]">
        <div className="flex h-14 items-center justify-center text-sm font-black text-white/70">时间</div>
        <div className="flex h-14 items-center justify-center rounded-2xl bg-white/15 text-sm font-black text-white">{dayLabel(selectedDate)}</div>
      </div>
      <div className="grid grid-cols-[72px_minmax(480px,1fr)] 2xl:grid-cols-[86px_minmax(520px,1fr)]">
        {renderTimeLabels()}
        <div
          data-calendar-date={selectedDate}
          onPointerDown={(pointerEvent) => beginTimeSelection(selectedDate, pointerEvent)}
          onPointerMove={updateTimeSelection}
          onPointerUp={finishTimeSelection}
          onPointerCancel={cancelTimeSelection}
          className="relative select-none border-l border-white/10 bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.02)_0,rgba(255,255,255,0.02)_91px,rgba(255,255,255,0.08)_91px,rgba(255,255,255,0.08)_92px)]"
          style={{ minHeight: gridHeight }}
        >
          {renderEventsForDate(selectedDate)}
          {renderInteractionPreview(selectedDate)}
          {events.filter((event) => event.date === selectedDate).length === 0 && (
            <div className="pointer-events-none flex h-80 items-center justify-center text-sm font-bold text-white/70">这天还没有日程。拖拽空白区域创建一个。</div>
          )}
        </div>
      </div>
    </div>
  )

  const renderMonthView = () => {
    const date = parseDate(selectedDate)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const first = new Date(Date.UTC(year, month, 1))
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const cells = [
      ...Array.from({ length: first.getUTCDay() }, () => 0),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1)
    ]

    return (
      <div className="grid min-w-[980px] grid-cols-7 gap-3">
        {['日', '一', '二', '三', '四', '五', '六'].map((label) => (
          <div key={label} className="flex h-12 items-center justify-center rounded-2xl text-sm font-black text-white/70">{label}</div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="min-h-28 rounded-3xl border border-white/10 bg-white/[0.04] opacity-40" />
          const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = events.filter((event) => event.date === value)
          const displayEvents = search
            ? [...dayEvents].sort((a, b) => Number(!visibleEvents.some((event) => event.id === a.id)) - Number(!visibleEvents.some((event) => event.id === b.id)))
            : dayEvents

          return (
            <div key={value} className={cn('min-h-28 rounded-3xl border border-white/10 bg-white/[0.07] p-3', value === selectedDate && 'border-blue-300/70 bg-blue-400/15')}>
              <button type="button" onClick={() => { setSelectedDate(value); setView('day') }} className="flex w-full items-center justify-between text-left text-sm font-black text-white/80">
                <span>{day}</span>
                {dayEvents.length > 0 && <span>{dayEvents.length}</span>}
              </button>
              <div className="mt-2 space-y-2">
                {displayEvents.slice(0, 3).map((event) => {
                  const match = visibleEvents.some((item) => item.id === event.id)
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setActiveEventId(event.id)}
                      className={cn('block w-full truncate rounded-xl px-2 py-1.5 text-left text-xs font-bold text-white', search && !match && 'opacity-25 grayscale', search && match && 'ring-2 ring-white/80')}
                      style={{ backgroundColor: event.color }}
                    >
                      {event.start} {event.title}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderMiniCalendar = () => {
    const date = parseDate(selectedDate)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const first = new Date(Date.UTC(year, month, 1))
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const cells = [
      ...Array.from({ length: first.getUTCDay() }, () => 0),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1)
    ]

    return (
      <div className="grid grid-cols-7 gap-1.5 text-center 2xl:gap-2">
        {['日', '一', '二', '三', '四', '五', '六'].map((label) => (
          <span key={label} className="text-xs font-black text-white/50">{label}</span>
        ))}
        {cells.map((day, index) => {
          if (!day) return <span key={`mini-empty-${index}`} />
          const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          return (
            <button
              key={value}
              type="button"
              onClick={() => { setSelectedDate(value); setView('day') }}
              className={cn('mx-auto grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white/80 transition hover:bg-white/15 2xl:h-8 2xl:w-8 2xl:text-sm', value === selectedDate && 'bg-blue-500 text-white shadow-lg shadow-blue-500/30')}
            >
              {day}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="relative min-h-[calc(100dvh-7rem)] overflow-hidden rounded-[2rem] bg-slate-950 p-3 text-white shadow-2xl sm:p-4 2xl:rounded-[2.5rem] 2xl:p-5"
      style={{
        backgroundImage: 'linear-gradient(180deg, rgba(230,238,232,0.22), rgba(10,16,22,0.78)), url("https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=2400&q=85")',
        backgroundPosition: 'center',
        backgroundSize: 'cover'
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_10%,rgba(255,255,255,0.34),transparent_30%),linear-gradient(90deg,rgba(8,14,22,0.22),rgba(255,255,255,0.06),rgba(8,14,22,0.36))]" />
      <div className="relative z-10 space-y-4 2xl:space-y-5">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-2xl lg:flex-row lg:items-center lg:justify-between 2xl:rounded-[2rem] 2xl:p-5">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 2xl:h-14 2xl:w-14">
              <CalendarDays size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter 2xl:text-4xl">日历应用</h1>
              <p className="mt-1 text-xs font-black uppercase tracking-[0.24em] text-white/55">Mountain Focus Calendar</p>
            </div>
          </div>
          <label className="relative block w-full lg:max-w-xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/70" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索日程、地点或参与者..."
              className="h-12 w-full rounded-2xl border border-white/20 bg-white/10 pl-12 pr-4 text-sm font-bold text-white outline-none backdrop-blur-xl placeholder:text-white/45 focus:border-blue-300/80 2xl:h-14"
            />
          </label>
        </header>

        <div className="grid gap-4 lg:grid-cols-[236px_minmax(0,1fr)] 2xl:grid-cols-[264px_minmax(0,1fr)] 2xl:gap-5">
          <aside className="rounded-[1.75rem] border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-2xl 2xl:rounded-[2rem] 2xl:p-5">
            <button
              type="button"
              onClick={() => openCreateForm()}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-base font-black text-white shadow-xl shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-500 2xl:h-16 2xl:text-lg"
            >
              <Plus size={22} />
              创建日程
            </button>

            <section className="mt-6 2xl:mt-8">
              <div className="mb-4 flex items-center justify-between 2xl:mb-5">
                <h2 className="text-lg font-black 2xl:text-xl">{monthTitle(selectedDate)}</h2>
              </div>
              {renderMiniCalendar()}
            </section>

            <section className="mt-6 2xl:mt-8">
              <h3 className="mb-3 text-lg font-black 2xl:mb-4 2xl:text-xl">我的日历</h3>
              <div className="space-y-3 2xl:space-y-4">
                {(Object.keys(CALENDAR_COLORS) as CalendarName[]).map((name) => (
                  <div key={name} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm font-bold text-white/85">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CALENDAR_COLORS[name] }} />
                    <span>{name}</span>
                    <span className="text-white/55">{calendarCounts[name]}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-6 hidden rounded-3xl border border-white/15 bg-white/10 p-4 xl:block 2xl:mt-8">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/55">
                <span className="h-2 w-2 animate-pulse rounded-full bg-lime-300" />
                Local Storage
              </div>
              <p className="mt-2 text-sm font-medium leading-6 text-white/70">
                日程保存在 OneTool 本地存储中，适合轻量个人规划。Docker 版本也已保留，后续可以继续同步。
              </p>
            </section>
          </aside>

          <section className="min-w-0 rounded-[1.75rem] border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-2xl 2xl:rounded-[2rem] 2xl:p-5">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => { setSelectedDate(TODAY); setView('day') }} className="h-12 rounded-2xl bg-blue-600 px-5 font-black shadow-lg shadow-blue-600/25">今天</button>
                <button type="button" onClick={() => moveDate(-1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 transition hover:bg-white/20">
                  <ChevronLeft size={22} />
                </button>
                <h2 className="min-w-40 text-2xl font-black tracking-tight">{monthTitle(selectedDate)}</h2>
                <button type="button" onClick={() => moveDate(1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 transition hover:bg-white/20">
                  <ChevronRight size={22} />
                </button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 text-xs font-black text-white/75">
                  <span className="whitespace-nowrap">显示时间</span>
                  <select
                    aria-label="开始显示时间"
                    value={displayTimeRange.startHour}
                    onChange={(event) => updateDisplayStartHour(event.target.value)}
                    className="h-9 rounded-xl border border-white/10 bg-slate-900/60 px-2 text-xs font-black text-white outline-none focus:border-blue-200/70"
                  >
                    {timeRangeOptions.slice(0, 24).map((hour) => (
                      <option key={hour} value={hour}>{formatHourLabel(hour)}</option>
                    ))}
                  </select>
                  <span className="text-white/45">-</span>
                  <select
                    aria-label="结束显示时间"
                    value={displayTimeRange.endHour}
                    onChange={(event) => updateDisplayEndHour(event.target.value)}
                    className="h-9 rounded-xl border border-white/10 bg-slate-900/60 px-2 text-xs font-black text-white outline-none focus:border-blue-200/70"
                  >
                    {timeRangeOptions.slice(1).map((hour) => (
                      <option key={hour} value={hour}>{formatHourLabel(hour)}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2 lg:w-auto">
                  {(['day', 'week', 'month'] as CalendarView[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setView(item)}
                      className={cn('h-12 rounded-2xl px-5 font-black transition', view === item ? 'bg-blue-600 shadow-lg shadow-blue-600/25' : 'bg-white/15 text-white/70 hover:bg-white/20')}
                    >
                      {item === 'day' ? '日' : item === 'week' ? '周' : '月'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 text-sm font-bold text-white/70 lg:flex-row lg:items-center lg:justify-between">
              <span>
                {view === 'day' && `日视图：聚焦 ${selectedDate}`}
                {view === 'week' && `周视图：${weekDates[0]} 至 ${weekDates[6]}`}
                {view === 'month' && `月视图：快速浏览 ${monthTitle(selectedDate)}`}
              </span>
              <div className="flex flex-wrap gap-2">
                {view !== 'month' && (
                  <span className="w-max rounded-full border border-blue-200/20 bg-blue-400/15 px-3 py-2 text-blue-50">
                    拖拽空白创建，拖动日程改时间
                  </span>
                )}
                {view !== 'month' && (
                  <span className="w-max rounded-full border border-white/15 bg-white/10 px-3 py-2">
                    当前时间轴 {formatHourLabel(gridConfig.startHour)} - {formatHourLabel(gridConfig.endHour)}
                  </span>
                )}
                <span className="w-max rounded-full border border-white/15 bg-white/10 px-3 py-2">
                  {search ? `匹配 ${visibleEvents.length} / ${events.length} 个日程` : `全部 ${events.length} 个日程`}
                </span>
              </div>
            </div>

            <div className="overflow-auto pb-2">
              {view === 'week' && renderWeekView()}
              {view === 'day' && renderDayView()}
              {view === 'month' && renderMonthView()}
            </div>
          </section>
        </div>
      </div>

      {activeEvent && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/60 p-6 backdrop-blur-xl" onClick={() => setActiveEventId(null)}>
          <article className="w-full max-w-xl rounded-[2rem] border border-white/20 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between gap-5">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/50">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeEvent.color }} />
                  {activeEvent.calendar}
                </div>
                <h2 className="text-3xl font-black tracking-tight">{activeEvent.title}</h2>
              </div>
              <button type="button" onClick={() => setActiveEventId(null)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 hover:bg-white/20">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <Detail icon={<Clock size={18} />} label="时间" value={`${activeEvent.date} ${activeEvent.start} - ${activeEvent.end}`} />
              <Detail icon={<MapPin size={18} />} label="地点" value={activeEvent.location || '未设置地点'} />
              <Detail icon={<Users size={18} />} label="参与者" value={activeEvent.participants || '个人'} />
              <Detail icon={<Sparkles size={18} />} label="描述" value={activeEvent.description || '暂无描述。'} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => openEditForm(activeEvent)} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 font-black shadow-lg shadow-blue-600/20">
                <Edit3 size={18} />
                编辑
              </button>
              <button type="button" onClick={deleteActiveEvent} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-500/80 font-black">
                <Trash2 size={18} />
                删除
              </button>
            </div>
          </article>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-6 backdrop-blur-xl" onClick={closeForm}>
          <form className="w-full max-w-2xl rounded-[2rem] border border-white/20 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-2xl" onSubmit={saveDraft} onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-white/50">Event Editor</div>
                <h2 className="text-3xl font-black tracking-tight">{editingEventId ? '编辑日程' : '创建日程'}</h2>
              </div>
              <button type="button" onClick={closeForm} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 hover:bg-white/20">
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-4">
              <Field label="标题">
                <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} className="calendar-input" placeholder="例如：客户会议" />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="日期">
                  <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} className="calendar-input" />
                </Field>
                <Field label="日历">
                  <select
                    value={draft.calendar}
                    onChange={(event) => {
                      const calendar = event.target.value as CalendarName
                      setDraft((current) => ({ ...current, calendar, color: CALENDAR_COLORS[calendar] }))
                    }}
                    className="calendar-input"
                  >
                    {(Object.keys(CALENDAR_COLORS) as CalendarName[]).map((name) => <option key={name}>{name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="开始">
                  <input type="time" value={draft.start} onChange={(event) => updateDraft('start', event.target.value)} className="calendar-input" />
                </Field>
                <Field label="结束">
                  <input type="time" value={draft.end} onChange={(event) => updateDraft('end', event.target.value)} className="calendar-input" />
                </Field>
                <Field label="颜色">
                  <input type="color" value={draft.color} onChange={(event) => updateDraft('color', event.target.value)} className="h-12 w-full rounded-2xl border border-white/15 bg-white/10 px-2" />
                </Field>
              </div>
              <Field label="地点">
                <input value={draft.location} onChange={(event) => updateDraft('location', event.target.value)} className="calendar-input" placeholder="例如：会议室 A" />
              </Field>
              <Field label="参与者">
                <input value={draft.participants} onChange={(event) => updateDraft('participants', event.target.value)} className="calendar-input" placeholder="例如：林澈、沈以南" />
              </Field>
              <Field label="描述">
                <textarea value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} className="calendar-input min-h-24 resize-y" placeholder="补充会议目标、准备材料或提醒事项" />
              </Field>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={closeForm} className="h-12 rounded-2xl bg-white/10 font-black hover:bg-white/15">取消</button>
              <button type="submit" className="h-12 rounded-2xl bg-blue-600 font-black shadow-lg shadow-blue-600/25">保存日程</button>
            </div>
          </form>
        </div>
      )}

      <section className="pointer-events-none fixed bottom-10 right-10 z-30 grid justify-items-end gap-3">
        <aside className={cn('w-[380px] overflow-hidden rounded-[2rem] border border-white/20 bg-slate-900/70 shadow-2xl backdrop-blur-2xl transition-all', aiOpen ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-4 scale-95 opacity-0')}>
          <div className="flex items-center justify-between border-b border-white/10 bg-blue-600/40 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-400">
                <Sparkles size={20} />
              </div>
              <div>
                <strong className="block text-sm font-black">AI 日历助手</strong>
                <span className="text-xs font-bold text-white/65">本地规划建议</span>
              </div>
            </div>
            <button type="button" onClick={() => setAiOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-3 p-4">
            <div className="max-h-48 space-y-2 overflow-auto pr-1">
              {aiMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm font-semibold leading-6',
                    message.role === 'user'
                      ? 'ml-8 bg-blue-500/35 text-white'
                      : 'mr-8 border border-white/10 bg-white/10 text-white/80'
                  )}
                >
                  {message.content}
                </div>
              ))}
            </div>
            <form
              className="grid grid-cols-[1fr_auto] gap-2 rounded-3xl border border-white/10 bg-white/10 p-2"
              onSubmit={(event) => {
                event.preventDefault()
                submitAssistantMessage()
              }}
            >
              <input
                value={aiInput}
                onChange={(event) => setAiInput(event.target.value)}
                disabled={aiThinking}
                placeholder={aiThinking ? '正在调用本地 LLM 识别...' : '例如：明天下午3点安排设计评审'}
                className="h-11 min-w-0 rounded-2xl bg-white/10 px-4 text-sm font-bold text-white outline-none placeholder:text-white/40 focus:bg-white/15"
              />
              <button type="submit" disabled={aiThinking} className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/25 hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">
                <Send size={17} />
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {['查看今天', '客户日程'].map((label) => (
                <button key={label} type="button" onClick={() => handleAssistantQuickAction(label)} className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white/75 hover:bg-blue-500/20">
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>
        <button type="button" onClick={() => setAiOpen((current) => !current)} className="pointer-events-auto grid h-16 w-16 place-items-center rounded-full bg-blue-600 shadow-2xl shadow-blue-600/35 ring-4 ring-blue-300/30 transition hover:-translate-y-1" aria-label="打开 AI 日历助手">
          <Sparkles size={24} />
        </button>
      </section>

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-2xl border border-white/15 bg-slate-900/80 px-4 py-3 text-sm font-bold text-white/80 shadow-2xl backdrop-blur-xl">
          {toast}
        </div>
      )}

      <style>{`
        .calendar-input {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.1);
          padding: 0.75rem 0.875rem;
          color: white;
          outline: none;
        }
        .calendar-input:focus {
          border-color: rgba(147, 197, 253, 0.8);
          background: rgba(255, 255, 255, 0.15);
        }
        .calendar-input::placeholder {
          color: rgba(255, 255, 255, 0.42);
        }
      `}</style>
    </div>
  )
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white/80">{icon}</span>
      <div>
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label}</span>
        <p className="mt-1 font-semibold leading-6 text-white/85">{value}</p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">{label}</span>
      {children}
    </label>
  )
}
