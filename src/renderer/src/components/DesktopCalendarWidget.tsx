import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Monitor,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '../../../shared/calendar'
import { CALENDAR_STORAGE_KEY, loadCalendarEvents } from '../tools/calendarStorage'
import { buildDesktopCalendarWidgetModel } from '../tools/desktopCalendarWidgetModel'
import { syncCalendarEventsToNativeBridge } from '../tools/calendarNativeSync'

const dragRegionStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export function DesktopCalendarWidget(): React.JSX.Element {
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadCalendarEvents(window.localStorage) as CalendarEvent[])
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()))
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    void window.electron?.calendar?.showWidget()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(events))
    void syncCalendarEventsToNativeBridge(events)
  }, [events])

  useEffect(() => {
    return window.electron?.calendar?.onEventsUpdated((events) => {
      setEvents(events)
    })
  }, [])

  const model = useMemo(() => buildDesktopCalendarWidgetModel({
    events,
    selectedDate,
    now
  }), [events, now, selectedDate])

  const selectedEvents = useMemo(() => (
    events
      .filter((event) => event.date === selectedDate)
      .sort((left, right) => left.start.localeCompare(right.start))
  ), [events, selectedDate])

  const moveMonth = (direction: number) => {
    const next = parseDateKey(selectedDate) ?? new Date()
    next.setMonth(next.getMonth() + direction)
    setSelectedDate(formatLocalDate(next))
  }

  const hideWidget = () => {
    void window.electron?.calendar?.hideWidget()
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-transparent p-2 text-slate-950">
      <section className="calendar-widget-shell h-full w-full overflow-hidden rounded-lg border border-white/70 bg-white/88 shadow-2xl shadow-slate-950/20 backdrop-blur-2xl">
        <header
          className="calendar-widget-drag-region grid grid-cols-[1fr_auto] items-center gap-2 border-b border-slate-200/80 bg-white/72 px-3 py-2"
          style={dragRegionStyle}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays size={17} className="text-emerald-700" />
              <h1 className="truncate text-sm font-black leading-5 text-slate-950">{model.monthLabel}</h1>
            </div>
            <p className="truncate text-[11px] font-bold leading-4 text-slate-500">{model.dayLabel}</p>
          </div>
          <div className="flex items-center gap-1" style={noDragStyle}>
            <button
              type="button"
              aria-label="上个月"
              title="上个月"
              onClick={() => moveMonth(-1)}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              aria-label="下个月"
              title="下个月"
              onClick={() => moveMonth(1)}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              aria-label="隐藏"
              title="隐藏"
              onClick={hideWidget}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-red-50 hover:text-red-600"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="grid h-[calc(100%-49px)] grid-rows-[auto_1fr] gap-2 p-3">
          <section className="rounded-lg bg-slate-50/86 p-2 ring-1 ring-slate-200/80">
            <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10px] font-black text-slate-400">
              {['日', '一', '二', '三', '四', '五', '六'].map((label) => <span key={label}>{label}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {model.cells.map((cell) => (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setSelectedDate(cell.date)}
                  className={cn(
                    'relative grid h-8 min-w-0 place-items-center rounded-md text-xs font-black transition',
                    cell.isCurrentMonth ? 'text-slate-700 hover:bg-white' : 'text-slate-300 hover:bg-white/70',
                    cell.isToday && 'text-emerald-700 ring-1 ring-emerald-300',
                    cell.isSelected && 'bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:bg-slate-900'
                  )}
                  aria-label={`${cell.date} ${cell.eventCount} 个日程`}
                >
                  {cell.day}
                  {cell.eventCount > 0 && (
                    <span className="absolute bottom-1 flex gap-0.5">
                      {cell.eventColors.map((color) => (
                        <span key={`${cell.date}-${color}`} className="h-1 w-1 rounded-full" style={{ backgroundColor: color }} />
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="min-h-0 overflow-hidden rounded-lg bg-white/76 ring-1 ring-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                <Bell size={14} className="text-amber-600" />
                {selectedDate === model.todayDate ? '今日' : selectedDate}
              </div>
              <span className="text-[11px] font-black text-slate-400">{selectedEvents.length}</span>
            </div>

            <div className="max-h-[42%] space-y-1 overflow-auto p-2">
              {selectedEvents.length > 0 ? selectedEvents.map((event) => (
                <EventRow key={event.id} event={event} compact />
              )) : (
                <p className="px-1 py-4 text-center text-xs font-bold text-slate-400">暂无日程</p>
              )}
            </div>

            <div className="border-t border-slate-100 px-3 py-2 text-xs font-black text-slate-700">接下来</div>
            <div className="max-h-[42%] space-y-1 overflow-auto px-2 pb-2">
              {model.upcomingEvents.length > 0 ? model.upcomingEvents.map((event) => (
                <EventRow key={event.id} event={event} />
              )) : (
                <p className="px-1 py-4 text-center text-xs font-bold text-slate-400">没有待提醒日程</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

function EventRow({ event, compact = false }: { event: CalendarEvent; compact?: boolean }): React.JSX.Element {
  return (
    <article className="grid grid-cols-[auto_1fr] gap-2 rounded-md px-2 py-2 text-left transition hover:bg-slate-50">
      <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: event.color }} />
      <div className="min-w-0">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <strong className="truncate text-xs font-black text-slate-900">{event.title}</strong>
          <span className="text-[10px] font-black text-slate-400">{event.start}</span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] font-bold text-slate-500">
          <Clock size={12} />
          <span className="truncate">{compact ? `${event.start}-${event.end}` : `${event.date} ${event.start}-${event.end}`}</span>
        </div>
        {event.location && (
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] font-bold text-slate-500">
            <MapPin size={12} />
            <span className="truncate">{event.location}</span>
          </div>
        )}
      </div>
    </article>
  )
}

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}
