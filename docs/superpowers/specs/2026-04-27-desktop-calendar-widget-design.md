# Desktop Calendar Widget And Windows Reminders Design

## Goal

Add a desktop-resident calendar widget to the current OneTool calendar and trigger Windows native notifications for upcoming schedule reminders.

The first version should feel like a true desktop companion: always available while OneTool is running, light enough to leave open, and directly connected to the existing local calendar data.

## Scope

In scope:

- A separate Electron desktop calendar window.
- A main calendar control to open and close the desktop calendar.
- Persistent desktop calendar visibility and position.
- A compact widget view showing today, a mini month calendar, today's events, and the next upcoming event.
- Calendar event synchronization from the renderer calendar to the main process.
- Windows native notifications for future events.
- Notification clicks restore the main window and open the calendar tool.

Out of scope for the first version:

- Editing events inside the desktop widget.
- Per-event custom reminder lead times.
- Reminders while OneTool is fully quit.
- Cross-device calendar sync.
- Importing external calendar accounts.

## User Experience

The desktop calendar is opened from the main calendar tool. Once enabled, it remains visible as a frameless floating desktop window and restores automatically while OneTool is running. The user can drag it to a comfortable location, and OneTool remembers that location.

The widget shows:

- Current date and weekday.
- A mini month calendar with days containing events marked subtly.
- Today's events in chronological order.
- The next upcoming event with its start time.

Clicking an event or the widget's open-calendar action brings the main OneTool window forward and switches to the calendar tool. Closing the widget hides it but does not delete calendar data.

Windows reminders fire by default 10 minutes before an event starts. If an event starts within the next 10 minutes after creation or synchronization, the reminder fires as soon as practical without duplicating an already fired reminder. Notifications include the event title, time, and location when available.

## Architecture

### Main Process

Add a calendar desktop window to `WindowManagerService`, similar to the existing float ball and overlay windows but with its own lifecycle:

- Create a frameless, transparent, resizable false or minimally resizable BrowserWindow.
- Load `#/calendar-widget`.
- Skip the taskbar.
- Keep it visible while enabled.
- Store and restore bounds through the existing settings/store path.
- Expose open, close, toggle, and state APIs through IPC.

Add a calendar reminder service in the main process:

- Accept normalized calendar events from IPC.
- Keep an in-memory schedule of pending reminders.
- Use Electron `Notification` for Windows native notifications.
- De-duplicate reminders by event id plus event date/start time.
- Reschedule whenever events change.
- Clear timers for removed or changed events.
- On notification click, show the main window and send `open-tool` with the calendar tool id.

The service will not persist a reminder queue independently from the calendar data. The renderer remains the source of truth for calendar events in this first version, and the main process only mirrors enough data to show the widget and trigger reminders.

### Preload Bridge

Expose a narrow `calendar` API:

- `syncEvents(events)`
- `openWidget()`
- `closeWidget()`
- `toggleWidget()`
- `getWidgetState()`
- `onWidgetStateChanged(callback)`
- `onEventsChanged(callback)`

This keeps direct IPC channel usage out of React components.

### Renderer

Reuse the existing calendar event shape and storage key. The main calendar tool will:

- Sync events to the main process after loading and whenever the event list changes.
- Add a desktop calendar toggle near the existing calendar toolbar.
- Keep existing localStorage behavior unchanged.

Add a `CalendarWidget` route rendered by `src/renderer/src/main.tsx` when the hash is `#/calendar-widget`. The widget will be small, dense, and readable, with no marketing copy. It should use existing `lucide-react` icons and Tailwind v3 styling.

The widget will subscribe to main-process calendar event updates and render from that mirrored state. Its event clicks ask the main process to open the full calendar.

## Data Model

Use a shared calendar event type with the current fields:

- `id`
- `title`
- `date`
- `start`
- `end`
- `calendar`
- `color`
- `location`
- `participants`
- `description`

Reminder scheduling computes local timestamps from `date` plus `start`. Invalid dates or invalid time ranges are ignored for reminders but can still be rendered if the existing UI already accepts them.

The default reminder lead time is 10 minutes. This can become a setting later without changing the event schema.

## Error Handling

If the desktop widget cannot be created, IPC returns a failed `IpcResponse` and the calendar page shows its existing toast.

If Windows notifications are unavailable or not supported, reminder scheduling remains active but the show call returns a failed response in tests or logs an error in runtime. Calendar editing should never be blocked by notification failure.

If malformed event data arrives from the renderer, the main process filters it out before scheduling reminders.

## Testing

Add tests before implementation:

- Bootstrap route resolves `#/calendar-widget`.
- Preload bridge maps calendar widget and sync APIs to the intended IPC channels.
- Calendar reminder service schedules only future reminder times.
- Calendar reminder service does not duplicate reminders for the same event occurrence.
- Removed or changed events clear stale timers.
- Widget window creation loads the calendar widget hash and uses isolated preload preferences.
- Calendar tool source syncs events after local changes and exposes the widget toggle.
- Calendar widget source renders today's events, next event, and open-calendar behavior.

Run:

- `npm test`
- `npm run typecheck:node`
- `npm run typecheck:web`

## Constraints And Tradeoffs

The first version depends on OneTool running. If the user fully quits the app, Windows will not deliver reminders because there is no background scheduler registered with Windows Task Scheduler or a packaged background service.

The renderer remains the source of truth for local calendar events to keep the first version close to existing architecture. A later version can move calendar persistence into the main process if reminders need to survive cold starts before the calendar page is opened.

The desktop widget does not edit events in place. This reduces duplication of form logic and keeps the widget focused on glanceable information.
