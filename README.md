# TaskZen ✿

**Make productivity feel good.** Your tasks. Your habits. Your little victories.

TaskZen 2.0 is a playful productivity app that runs entirely in the browser. It has no build step and no backend, and it deploys to GitHub Pages as-is.

## Features

| Section | What it does |
| --- | --- |
| **Dashboard** | Time-of-day greeting, a daily message, energy check-in, quick add, six stat cards, today's agenda, a daily progress ring, upcoming deadlines, weekly activity chart, habits, a focus tracker, daily challenges, suggested next tasks and quick notes. Confetti when you finish everything due today. |
| **My Tasks** | Name, description, category, priority (Low → Urgent), status, due date and time, subtasks, recurrence (daily / weekly / monthly / every N days), labels, estimate and links. Search; filter by status, priority, category, date and label; sort by your own order, newest, oldest, priority or deadline. Drag to reorder, bulk complete / archive / delete, archive, duplicate, Undo, and a detail side panel. |
| **Calendar** | Day, week and month views. Drag tasks between days (or onto an hour in day view), click **+** to add a task on a date, overdue markers, category colours, an upcoming list and an unscheduled tray. |
| **Kanban** | To Do / In Progress / Done columns with drag and drop and a "Move…" menu for keyboard and touch. Uses the same data as every other view. |
| **Habit Tracker** | Daily, specific-day or N-times-per-week habits with icons, colours and categories. Shows current and best streaks, a 5-week completion calendar (tick off the last 7 days), weekly and monthly success rates and missed days. Missing a day never erases history. |
| **Focus Mode** | Pomodoro timer (25/5 with a long break every 4 sessions, all adjustable). Pick a task, pause / resume / reset / skip, full-screen Zen mode, generated ambient sounds, a completion chime and notifications, session history and totals. The timer survives refreshes and navigation. |
| **Achievements** | XP, 5 levels (Beginner → Zen Master), 10 badges, 3 daily challenges and streak rewards. |
| **Zen Garden** | Spend garden energy (half the XP of each activity) on 12 plants and decorations. Unlock seasons by level, expand the garden, and move or remove items. The lawn grows lusher as you earn more. |
| **Insights** | Weekly and monthly summaries, completions per day, category breakdown, weekday rhythm, average completion time (from real timing data only), a 12-week history, a weekly review and daily reflections. |
| **Settings** | Name and avatar (emoji or photo), light / dark / system theme, week start, time format, default category, daily goal, working hours, categories, per-type reminders, and backup export / import / restore / reset. |

**Smart features** use deterministic rules, with no AI service and nothing to pay for:
- **Natural-language quick add**: "Remind me to call John tomorrow at 10 #work !high" becomes the task *Call John*, due tomorrow at 10:00, Work, High priority. It understands today, tomorrow, weekdays, "in 3 days", "dec 24", times, `!priority`, `#category` / `#label` and "for 30 min".
- **Plan My Day**: orders open tasks by deadline, priority, estimate and your energy level, adds breaks, and can write the schedule onto your tasks.
- **Smart rescheduling**: spreads overdue tasks across the next days that still have room.

## Rewards are hard to game

- XP is stored as a ledger keyed by the activity that earned it, e.g. `task:<id>` or `habit:<id>:<date>`. A key can be rewarded only once.
- Un-completing a task takes its XP back. Deleting a task also takes its XP back, so create → complete → delete earns nothing. Archiving keeps the XP.
- Daily limits apply: 30 rewarded tasks and 12 rewarded focus sessions per day. The all-tasks-done bonus and each daily challenge pay out at most once per day.
- Migrated TaskZen 1.x tasks don't earn retroactive XP.

## Architecture

```
index.html            App shell (sidebar, top bar, drawer, toasts)
css/styles.css        Design system: tokens for light and dark, components, responsive rules
js/app.js             Hash router, theme, celebrations, reminders loop
js/core/              Business logic: no DOM, unit-tested
  model.js            Data model, normalisers, TaskZen 1.x migration
  store.js            Single source of truth: persistence, undo, export/import, middleware
  tasks.js            Task operations and queries (status, recurrence, filters, sorting)
  habits.js           Habit check-ins, streaks, success rates
  gamification.js     XP ledger, levels, streaks, challenges, achievements
  garden.js           Garden economy
  planner.js          Plan My Day and smart rescheduling
  nlp.js              Natural-language parsing
  insights.js         Analytics
  reminders.js        Which reminders are due
  focus.js / sound.js Pomodoro engine and Web Audio ambient sounds
js/ui/                Shared UI: DOM helpers, components, task editor, actions with Undo
js/views/             One module per section
tests/core.test.js    Logic tests
```

All data lives in `localStorage` under `taskzen:v2`. On first load, TaskZen 1.x data (the `tasks` and `categories` keys) is migrated automatically. The original keys are left untouched as a safety net. Imports and resets save the previous data first, so **Settings → Undo last import/reset** can always switch back.

## Run locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. ES modules need a server; opening the file directly won't work.

## Tests

```bash
bun test
```

The tests cover migration, XP integrity, recurrence, filters and sorting, habit streaks, natural-language parsing, the planner, garden economy, undo, export/import and reminders.

## Deliberately not included (yet)

- **Cloud accounts and sync (Supabase):** needs a Supabase project and keys, so it isn't wired up. The store is one module behind a small API, which is where a sync adapter would go. Never put a service-role key in frontend code.
- **Background reminders:** GitHub Pages is static hosting, so reminders and browser notifications fire only while TaskZen is open in a tab.
- **File attachments:** tasks support links instead, because browser storage is too small for files.
