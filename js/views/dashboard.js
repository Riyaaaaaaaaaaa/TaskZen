import { getState, undo, update } from '../core/store.js';
import { activeTasks, getTask, isOverdue, moveToDate, upcomingTasks } from '../core/tasks.js';
import { dailyChallenges, levelInfo, productivityStreak, totalXP, xpOnDay } from '../core/gamification.js';
import { habitDoneOn, habitsDueToday, toggleHabit } from '../core/habits.js';
import { completedBetween, completionsPerDay, focusMinutesBetween, overviewCounts } from '../core/insights.js';
import { applyPlan, planDay, suggestReschedule } from '../core/planner.js';
import { addDays, esc, formatDate, formatMinutes, formatTime, fromDateKey, hashString, relativeDay, todayKey, toDateKey, weekDays } from '../core/utils.js';
import { $, icon, openModal, refreshIcons, toast } from '../ui/dom.js';
import { avatarHTML, barChart, emptyState, progressRing, statCard, taskRow } from '../ui/components.js';
import { quickAdd, toggleTask } from '../ui/actions.js';
import { openNewTask, openTaskPanel } from '../ui/taskEditor.js';
import { getTimer } from '../core/focus.js';

const MESSAGES = [
  'Small steps still move you forward.',
  'Do the next right thing — just one.',
  'Progress over perfection, always.',
  'Your future self is cheering you on.',
  'Start where you are. Use what you have.',
  'A calm mind gets more done.',
  'One task at a time is the fastest way through.',
  'Tiny wins add up to big change.',
  'Rest is part of the work, too.',
  'Momentum loves a quick first win.',
  'You don’t need more time, just a clear next step.',
  'Celebrate the little victories today.',
];

function greeting(h) {
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

const ENERGY = [
  { id: 'low', label: 'Low', icon: 'battery-low' },
  { id: 'medium', label: 'Okay', icon: 'battery-medium' },
  { id: 'high', label: 'Energised', icon: 'battery-full' },
];

export default {
  id: 'dashboard',
  title: 'Dashboard',
  subtitle: 'Your daily overview',
  icon: 'layout-dashboard',
  color: 'violet',

  render(root) {
    const s = getState();
    const now = new Date();
    const today = todayKey();
    const name = s.profile.name?.trim();
    const counts = overviewCounts(s, now);
    const streak = productivityStreak(s).length;
    const week = weekDays(today, s.settings.weekStart);
    const focusWeek = focusMinutesBetween(s, week[0], week[6]);
    const agenda = activeTasks(s)
      .filter((t) => t.dueDate === today)
      .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.dueTime || '99').localeCompare(b.dueTime || '99'));
    const overdue = activeTasks(s).filter((t) => isOverdue(t, now) && t.dueDate < today);
    const doneToday = completedBetween(s, today, today).length;
    const goal = Math.max(s.settings.dailyGoal, agenda.length) || 1;
    const habitsToday = habitsDueToday(s, today);
    const habitsDone = habitsToday.filter((h) => habitDoneOn(s, h.id, today)).length;
    const lvl = levelInfo(totalXP(s));
    const energy = s.checkins[today];
    const sessionsToday = s.focusSessions.filter((f) => f.mode === 'work' && f.completed && toDateKey(new Date(f.endedAt)) === today);
    const timer = getTimer();
    const suggestions = activeTasks(s)
      .filter((t) => t.status !== 'done' && (isOverdue(t, now) || t.priority === 'urgent' || (t.priority === 'high' && t.dueDate && t.dueDate <= addDays(today, 2))))
      .slice(0, 4);
    const plan = s.plans[today];

    root.innerHTML = `
    <section class="hero card">
      <div class="hero-main">
        ${avatarHTML(s.profile, 56)}
        <div>
          <p class="eyebrow">${fromDateKey(today).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1>${greeting(now.getHours())}${name ? `, ${esc(name)}` : ''} <span class="wave" aria-hidden="true">✿</span></h1>
          <p class="hero-quote">${esc(MESSAGES[hashString(today) % MESSAGES.length])}</p>
        </div>
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary" data-action="plan" type="button">${icon('wand-sparkles')}Plan my day</button>
        <button class="btn btn-soft" data-action="new" type="button">${icon('plus')}New task</button>
      </div>
      <form class="hero-add" id="dash-add-form" autocomplete="off">
        ${icon('sparkles')}<input id="dash-add" aria-label="Quick add a task for today" placeholder="Add something for today… try “Gym at 6pm #health”">
        <button class="btn btn-primary small" type="submit">Add</button>
      </form>
      <div class="energy" role="group" aria-label="Energy check-in">
        <span class="muted small">How’s your energy?</span>
        ${ENERGY.map((e) => `<button type="button" class="pill ${energy === e.id ? 'active' : ''}" data-energy="${e.id}" aria-pressed="${energy === e.id}">${icon(e.icon)}${e.label}</button>`).join('')}
      </div>
    </section>

    <section class="stats-grid" aria-label="Statistics">
      ${statCard({ iconName: 'list-todo', label: 'Total tasks', value: counts.total, color: 'violet' })}
      ${statCard({ iconName: 'circle-check-big', label: 'Completed', value: counts.completed, color: 'mint' })}
      ${statCard({ iconName: 'clock', label: 'Pending', value: counts.pending, color: 'sky' })}
      ${statCard({ iconName: 'alarm-clock', label: 'Overdue', value: counts.overdue, color: counts.overdue ? 'pink' : 'peach' })}
      ${statCard({ iconName: 'flame', label: 'Day streak', value: streak, color: 'peach', hint: streak ? 'Keep it going!' : 'Complete something today' })}
      ${statCard({ iconName: 'timer', label: 'Focus this week', value: formatMinutes(focusWeek), color: 'yellow' })}
    </section>

    <div class="dash-grid">
      <section class="card span-2" aria-labelledby="agenda-h">
        <header class="card-head"><h2 id="agenda-h">${icon('sun')}Today’s agenda</h2>
          <span class="muted small">${agenda.filter((t) => t.status === 'done').length}/${agenda.length} done</span></header>
        ${overdue.length ? `<div class="overdue-strip">${icon('alarm-clock')}<span>${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}</span>
          <button class="btn btn-soft small" data-action="reschedule" type="button">${icon('calendar-range')}Smart reschedule</button></div>` : ''}
        ${agenda.length ? `<ul class="task-list" data-list>${agenda.map((t) => taskRow(s, t, { compact: true })).join('')}</ul>`
          : emptyState('coffee', 'Nothing scheduled today', 'Add a task above or let Plan My Day pick some for you.')}
        ${plan ? `<p class="muted small plan-note">${icon('wand-sparkles')}Planned with ${plan.items.length} task${plan.items.length === 1 ? '' : 's'} · ${formatMinutes(plan.scheduledMinutes)} scheduled</p>` : ''}
      </section>

      <section class="card center" aria-labelledby="progress-h">
        <header class="card-head"><h2 id="progress-h">${icon('target')}Daily progress</h2></header>
        ${progressRing(doneToday / goal, { size: 150, label: `${Math.min(100, Math.round((doneToday / goal) * 100))}%`, sub: `${doneToday} of ${goal} today` })}
        <p class="muted small">Overall: ${counts.total ? Math.round((counts.completed / counts.total) * 100) : 0}% of all tasks completed</p>
        <div class="level-inline"><span class="level-badge">Lv ${lvl.level}</span><span>${lvl.name}</span><span class="muted">+${xpOnDay(s, today)} XP today</span></div>
      </section>

      <section class="card" aria-labelledby="upcoming-h">
        <header class="card-head"><h2 id="upcoming-h">${icon('calendar-clock')}Upcoming deadlines</h2><a href="#/calendar" class="link small">Calendar</a></header>
        ${(() => {
          const up = upcomingTasks(s, 5, now);
          return up.length
            ? `<ul class="mini-list">${up.map((t) => `<li><button type="button" class="mini-item" data-open="${t.id}"><span class="dot dot-${t.priority}"></span><span class="grow">${esc(t.title)}</span><span class="muted small">${relativeDay(t.dueDate)}${t.dueTime ? ` ${formatTime(t.dueTime, s.settings.timeFormat)}` : ''}</span></button></li>`).join('')}</ul>`
            : emptyState('calendar-check', 'No upcoming deadlines', 'You’re all clear.');
        })()}
      </section>

      <section class="card" aria-labelledby="weekly-h">
        <header class="card-head"><h2 id="weekly-h">${icon('chart-column')}Weekly activity</h2><a href="#/insights" class="link small">Insights</a></header>
        ${barChart(completionsPerDay(s, week).map((d) => ({ label: fromDateKey(d.date).toLocaleDateString(undefined, { weekday: 'narrow' }), value: d.count, title: `${formatDate(d.date)}: ${d.count} completed` })), { height: 120 })}
      </section>

      <section class="card" aria-labelledby="habits-h">
        <header class="card-head"><h2 id="habits-h">${icon('repeat')}Habits today</h2><span class="muted small">${habitsDone}/${habitsToday.length}</span></header>
        ${habitsToday.length ? `<ul class="habit-mini">${habitsToday.map((h) => {
          const done = habitDoneOn(s, h.id, today);
          return `<li><button type="button" class="habit-check c-${h.color} ${done ? 'done' : ''}" data-habit="${h.id}" aria-pressed="${done}">
            <span class="habit-ic">${icon(done ? 'check' : h.icon)}</span><span>${esc(h.name)}</span></button></li>`;
        }).join('')}</ul>` : emptyState('sprout', 'No habits yet', '', '<a class="btn btn-soft small" href="#/habits">Create a habit</a>')}
      </section>

      <section class="card" aria-labelledby="focus-h">
        <header class="card-head"><h2 id="focus-h">${icon('timer')}Focus tracker</h2><a href="#/focus" class="link small">Open</a></header>
        <div class="focus-mini">
          <div><span class="big-num">${sessionsToday.length}</span><span class="muted small">sessions today</span></div>
          <div><span class="big-num">${formatMinutes(focusWeek)}</span><span class="muted small">this week</span></div>
        </div>
        <a class="btn btn-primary block" href="#/focus">${icon(timer.running ? 'timer' : 'play')}${timer.running ? 'Session in progress' : 'Start a focus session'}</a>
      </section>

      <section class="card" aria-labelledby="chal-h">
        <header class="card-head"><h2 id="chal-h">${icon('medal')}Daily challenges</h2><span class="muted small">+20 XP each</span></header>
        <ul class="challenges">${dailyChallenges(s, today).map((c) => `<li class="${c.done ? 'done' : ''}">
          <span class="chal-ic">${icon(c.done ? 'check' : c.icon)}</span><span class="grow">${esc(c.label)}</span>
          <span class="muted small">${c.progress}/${c.target}</span></li>`).join('')}</ul>
      </section>

      <section class="card" aria-labelledby="sugg-h">
        <header class="card-head"><h2 id="sugg-h">${icon('lightbulb')}Suggested next</h2></header>
        ${suggestions.length ? `<ul class="mini-list">${suggestions.map((t) => `<li><button type="button" class="mini-item" data-open="${t.id}">
          <span class="dot dot-${t.priority}"></span><span class="grow">${esc(t.title)}</span>
          <span class="badge ${isOverdue(t, now) ? 'badge-pink' : 'badge-peach'}">${isOverdue(t, now) ? 'Overdue' : t.priority === 'urgent' ? 'Urgent' : 'High'}</span></button></li>`).join('')}</ul>`
          : emptyState('smile', 'Nothing pressing', 'No overdue or high-priority tasks.')}
      </section>

      <section class="card span-2" aria-labelledby="notes-h">
        <header class="card-head"><h2 id="notes-h">${icon('notebook-pen')}Quick notes</h2><span class="muted small" id="notes-status">Saved automatically</span></header>
        <textarea id="quick-notes" class="notes" rows="5" placeholder="Jot down anything — ideas, reminders, a brain dump…">${esc(s.notes)}</textarea>
      </section>
    </div>`;

    root.addEventListener('submit', (e) => {
      if (e.target.id !== 'dash-add-form') return;
      e.preventDefault();
      const input = $('#dash-add', root);
      if (quickAdd(input.value, { dueDate: today })) input.value = '';
    });

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action], [data-open], [data-habit], [data-energy]');
      if (!el) return;
      const row = el.closest('[data-task-id]');
      if (el.dataset.action === 'toggle') toggleTask(row.dataset.taskId);
      else if (el.dataset.action === 'open') openTaskPanel(row.dataset.taskId);
      else if (el.dataset.open) openTaskPanel(el.dataset.open);
      else if (el.dataset.action === 'new') openNewTask({ dueDate: today });
      else if (el.dataset.action === 'plan') openPlanner();
      else if (el.dataset.action === 'reschedule') openReschedule();
      else if (el.dataset.habit) update((st) => toggleHabit(st, el.dataset.habit, today));
      else if (el.dataset.energy) {
        update((st) => (st.checkins[today] = st.checkins[today] === el.dataset.energy ? undefined : el.dataset.energy));
      }
    });

    let t;
    $('#quick-notes', root).addEventListener('input', (e) => {
      $('#notes-status', root).textContent = 'Saving…';
      clearTimeout(t);
      t = setTimeout(() => {
        update((st) => (st.notes = e.target.value), { silent: true });
        const el = document.getElementById('notes-status');
        if (el) el.textContent = 'Saved';
      }, 400);
    });
  },
};

// ---------- Plan My Day ----------

function openPlanner() {
  const s = getState();
  const today = todayKey();
  const energy = s.checkins[today] || 'medium';
  const body = `<form class="planner-form" id="planner-form">
    <p class="muted">TaskZen looks at deadlines, priority, estimated time and your energy to suggest an order for today. Tasks without an estimate count as 30 minutes.</p>
    <div class="form-grid">
      <label class="field"><span>Start</span><input type="time" name="start" value="${s.settings.workdayStart}"></label>
      <label class="field"><span>Finish</span><input type="time" name="end" value="${s.settings.workdayEnd}"></label>
      <fieldset class="field span-2"><legend>Energy level</legend><div class="seg">
        ${ENERGY.map((e) => `<label><input type="radio" name="energy" value="${e.id}" ${e.id === energy ? 'checked' : ''}><span>${icon(e.icon)}${e.label}</span></label>`).join('')}
      </div></fieldset>
    </div>
    <div class="modal-actions"><button class="btn btn-primary" type="submit">${icon('wand-sparkles')}Suggest a schedule</button></div>
  </form><div id="plan-result"></div>`;

  openModal({
    title: 'Plan my day',
    wide: true,
    body,
    onMount: (el, close) => {
      let plan = null;
      const form = el.querySelector('form');
      const show = () => {
        const f = new FormData(form);
        const start = f.get('start');
        const end = f.get('end');
        if (!start || !end || start >= end) {
          el.querySelector('#plan-result').innerHTML = '<p class="form-error">The finish time needs to be after the start time.</p>';
          return;
        }
        update((st) => (st.checkins[today] = f.get('energy')), { silent: true });
        plan = planDay(getState(), { date: today, start, end, energy: f.get('energy') });
        const st = getState();
        const fmt = (x) => formatTime(x, st.settings.timeFormat);
        const rows = [
          ...plan.items.map((i) => ({ at: i.start, html: `<li class="slot"><span class="slot-time">${fmt(i.start)}–${fmt(i.end)}</span>
            <span class="slot-body"><strong>${esc(getTask(st, i.taskId).title)}</strong><span class="muted small">${formatMinutes(i.minutes)}${i.reasons.length ? ` · ${esc(i.reasons.join(' · '))}` : ''}</span></span></li>` })),
          ...plan.breaks.map((b) => ({ at: b.start, html: `<li class="slot slot-break"><span class="slot-time">${fmt(b.start)}–${fmt(b.end)}</span><span class="slot-body">${icon('coffee')} Break</span></li>` })),
        ].sort((a, b) => a.at.localeCompare(b.at));
        el.querySelector('#plan-result').innerHTML = plan.items.length
          ? `<h3 class="section-title">Suggested schedule <span class="muted small">${formatMinutes(plan.scheduledMinutes)} of ${formatMinutes(plan.availableMinutes)} available</span></h3>
            <ol class="timeline">${rows.map((r) => r.html).join('')}</ol>
            ${plan.overflow.length ? `<p class="muted small">${icon('info')}Didn’t fit today: ${plan.overflow.map((id) => esc(getTask(st, id).title)).join(', ')}</p>` : ''}
            <div class="modal-actions"><button class="btn btn-ghost" type="button" data-close>Close</button>
            <button class="btn btn-primary" type="button" data-apply>${icon('calendar-check')}Apply to my tasks</button></div>`
          : emptyState('party-popper', 'Nothing to plan', 'No open tasks are due in the next few days. Add some tasks or enjoy the free time!');
        refreshIcons();
        el.querySelector('[data-close]')?.addEventListener('click', close);
        el.querySelector('[data-apply]')?.addEventListener('click', () => {
          update((x) => applyPlan(x, plan), { undo: 'Applied plan' });
          toast(`Plan applied: ${plan.items.length} tasks scheduled for today`, { iconName: 'calendar-check', tone: 'success', actionLabel: 'Undo', onAction: undo });
          close();
        });
      };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        show();
      });
    },
  });
}

// ---------- Smart rescheduling ----------

function openReschedule() {
  const s = getState();
  const capacity = Math.max(60, (toMin(s.settings.workdayEnd) - toMin(s.settings.workdayStart)) * 0.75);
  const sugg = suggestReschedule(s, { capacity });
  if (!sugg.length) return toast('No overdue tasks to reschedule', { iconName: 'smile' });
  openModal({
    title: 'Smart rescheduling',
    wide: true,
    body: `<p class="muted">Suggested new dates for overdue tasks, spreading them over days that still have room (based on estimates and a ${formatMinutes(capacity)} daily capacity).</p>
      <ul class="resched">${sugg.map((x) => `<li><span class="grow"><strong>${esc(getTask(s, x.taskId).title)}</strong><span class="muted small">was ${relativeDay(x.from)}</span></span>
        <input type="date" value="${x.to}" data-id="${x.taskId}" aria-label="New date"></li>`).join('')}</ul>
      <div class="modal-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-apply>${icon('calendar-range')}Reschedule all</button></div>`,
    onMount: (el, close) => {
      el.querySelector('[data-apply]').onclick = () => {
        const moves = [...el.querySelectorAll('input[type="date"]')].filter((i) => i.value).map((i) => [i.dataset.id, i.value]);
        update((st) => moves.forEach(([id, d]) => moveToDate(st, id, d)), { undo: 'Rescheduled' });
        toast(`${moves.length} task${moves.length > 1 ? 's' : ''} rescheduled`, { iconName: 'calendar-range', tone: 'success' });
        close();
      };
    },
  });
}

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
