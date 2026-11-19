import { getState, update } from '../core/store.js';
import { activeTasks, getTask, isOverdue, moveToDate, upcomingTasks } from '../core/tasks.js';
import { addDays, addMonths, esc, formatTime, fromDateKey, minToTime, relativeDay, startOfWeek, todayKey, weekDays } from '../core/utils.js';
import { $$, icon } from '../ui/dom.js';
import { category, emptyState } from '../ui/components.js';
import { quickAdd, toggleTask } from '../ui/actions.js';
import { openNewTask, openTaskPanel } from '../ui/taskEditor.js';

const ui = { mode: 'month', cursor: todayKey() };

function tasksByDate(s) {
  const map = {};
  for (const t of activeTasks(s)) {
    if (!t.dueDate) continue;
    (map[t.dueDate] ||= []).push(t);
  }
  for (const k in map) map[k].sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.dueTime || '99').localeCompare(b.dueTime || '99'));
  return map;
}

function chip(s, t, now) {
  const c = category(s, t.categoryId);
  const overdue = isOverdue(t, now);
  return `<button type="button" class="cal-chip chip-${c.color} ${t.status === 'done' ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}"
    draggable="true" data-task-id="${t.id}" data-open="${t.id}" title="${esc(t.title)}${overdue ? ' (overdue)' : ''}">
    ${overdue ? icon('alarm-clock') : ''}${t.dueTime ? `<span class="chip-time">${formatTime(t.dueTime, s.settings.timeFormat)}</span>` : ''}<span class="chip-text">${esc(t.title)}</span></button>`;
}

function title(s) {
  const d = fromDateKey(ui.cursor);
  if (ui.mode === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (ui.mode === 'day') return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const days = weekDays(ui.cursor, s.settings.weekStart);
  const a = fromDateKey(days[0]);
  const b = fromDateKey(days[6]);
  return `${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function monthHTML(s, map, now) {
  const today = todayKey();
  const first = `${ui.cursor.slice(0, 8)}01`;
  const start = startOfWeek(first, s.settings.weekStart);
  const month = ui.cursor.slice(0, 7);
  const heads = weekDays(start, s.settings.weekStart).map((d) => `<div class="cal-dow">${fromDateKey(d).toLocaleDateString(undefined, { weekday: 'short' })}</div>`).join('');
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i === 35 && d.slice(0, 7) !== month) break;
    const list = map[d] || [];
    const overdue = list.some((t) => isOverdue(t, now));
    cells.push(`<div class="cal-cell ${d.slice(0, 7) !== month ? 'other' : ''} ${d === today ? 'today' : ''}" data-date="${d}">
      <div class="cal-cell-head"><button type="button" class="cal-daynum" data-goto="${d}" aria-label="Open ${fromDateKey(d).toDateString()}">${Number(d.slice(8))}</button>
      ${overdue ? `<span class="overdue-dot" title="Overdue tasks"></span>` : ''}
      <button type="button" class="cal-add" data-add="${d}" aria-label="Add task on ${fromDateKey(d).toDateString()}">${icon('plus')}</button></div>
      <div class="cal-chips">${list.slice(0, 3).map((t) => chip(s, t, now)).join('')}
      ${list.length > 3 ? `<button type="button" class="cal-more" data-goto="${d}">+${list.length - 3} more</button>` : ''}</div></div>`);
  }
  return `<div class="cal-month">${heads}${cells.join('')}</div>`;
}

function weekHTML(s, map, now) {
  const today = todayKey();
  return `<div class="cal-week">${weekDays(ui.cursor, s.settings.weekStart).map((d) => {
    const list = map[d] || [];
    return `<div class="cal-col ${d === today ? 'today' : ''}" data-date="${d}">
      <header><button type="button" class="link" data-goto="${d}"><span>${fromDateKey(d).toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>${Number(d.slice(8))}</strong></button>
      <button type="button" class="icon-btn small" data-add="${d}" aria-label="Add task">${icon('plus')}</button></header>
      <div class="cal-chips">${list.map((t) => chip(s, t, now)).join('') || '<p class="muted small center">Free</p>'}</div></div>`;
  }).join('')}</div>`;
}

function dayHTML(s, map, now) {
  const list = map[ui.cursor] || [];
  const untimed = list.filter((t) => !t.dueTime);
  const hours = [];
  for (let h = 6; h <= 23; h++) {
    const hh = String(h).padStart(2, '0');
    const at = list.filter((t) => t.dueTime && t.dueTime.slice(0, 2) === hh);
    hours.push(`<div class="hour-row" data-date="${ui.cursor}" data-hour="${hh}"><span class="hour-label">${formatTime(minToTime(h * 60), s.settings.timeFormat)}</span>
      <div class="hour-slot">${at.map((t) => chip(s, t, now)).join('')}</div></div>`);
  }
  return `<div class="cal-day">
    <form class="quick-add" id="cal-day-add" autocomplete="off">${icon('plus')}<input id="cal-day-input" aria-label="Add a task on this day" placeholder="Add a task on ${esc(relativeDay(ui.cursor))} — e.g. “Dentist at 3pm”"><button class="btn btn-primary small">Add</button></form>
    <div class="anytime" data-date="${ui.cursor}"><h3>${icon('sun')}Any time</h3><div class="cal-chips">${untimed.map((t) => chip(s, t, now)).join('') || '<p class="muted small">Drop tasks here to schedule without a time.</p>'}</div></div>
    <div class="hours">${hours.join('')}</div></div>`;
}

export default {
  id: 'calendar',
  title: 'Calendar',
  subtitle: 'Plan your schedule',
  icon: 'calendar-days',
  color: 'sky',

  render(root, ctx) {
    const s = getState();
    const now = new Date();
    const map = tasksByDate(s);
    const unscheduled = activeTasks(s).filter((t) => !t.dueDate && t.status !== 'done');
    const upcoming = upcomingTasks(s, 6, now);
    const body = ui.mode === 'month' ? monthHTML(s, map, now) : ui.mode === 'week' ? weekHTML(s, map, now) : dayHTML(s, map, now);

    root.innerHTML = `
      <header class="page-head">
        <div><h1>Calendar</h1><p class="muted">Drag tasks between days. Click a day’s <strong>+</strong> to add a task there.</p></div>
        <div class="page-actions">
          <div class="tabs" role="tablist" aria-label="Calendar view">
            ${['day', 'week', 'month'].map((m) => `<button role="tab" type="button" class="tab ${ui.mode === m ? 'active' : ''}" aria-selected="${ui.mode === m}" data-mode="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
          </div>
        </div>
      </header>
      <div class="cal-layout">
        <section class="card cal-main">
          <div class="cal-nav">
            <button class="icon-btn" type="button" data-nav="-1" aria-label="Previous">${icon('chevron-left')}</button>
            <h2>${title(s)}</h2>
            <button class="icon-btn" type="button" data-nav="1" aria-label="Next">${icon('chevron-right')}</button>
            <button class="btn btn-ghost small" type="button" data-nav="0">Today</button>
          </div>
          ${body}
          <div class="legend">${s.categories.map((c) => `<span class="legend-item"><span class="swatch sw-${c.color}"></span>${esc(c.name)}</span>`).join('')}
            <span class="legend-item"><span class="overdue-dot"></span>Overdue</span></div>
        </section>
        <aside class="cal-side">
          <section class="card"><h2 class="card-title">${icon('bell')}Upcoming deadlines</h2>
            ${upcoming.length ? `<ul class="mini-list">${upcoming.map((t) => `<li><button type="button" class="mini-item" data-open="${t.id}"><span class="dot dot-${t.priority}"></span><span class="grow">${esc(t.title)}</span><span class="muted small">${relativeDay(t.dueDate)}</span></button></li>`).join('')}</ul>` : '<p class="muted small">No upcoming deadlines.</p>'}
          </section>
          <section class="card unscheduled" data-date=""><h2 class="card-title">${icon('inbox')}Unscheduled</h2>
            <p class="muted small">Drag onto a day to schedule.</p>
            <div class="cal-chips">${unscheduled.map((t) => chip(s, t, now)).join('') || emptyState('check', 'All tasks have dates')}</div>
          </section>
        </aside>
      </div>`;

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-mode], [data-nav], [data-goto], [data-add], [data-open]');
      if (!el) return;
      if (el.dataset.mode) {
        ui.mode = el.dataset.mode;
        ctx.rerender();
      } else if (el.dataset.nav !== undefined) {
        const n = Number(el.dataset.nav);
        if (n === 0) ui.cursor = todayKey();
        else if (ui.mode === 'month') ui.cursor = addMonths(ui.cursor, n);
        else ui.cursor = addDays(ui.cursor, n * (ui.mode === 'week' ? 7 : 1));
        ctx.rerender();
      } else if (el.dataset.goto) {
        ui.cursor = el.dataset.goto;
        ui.mode = 'day';
        ctx.rerender();
      } else if (el.dataset.add) openNewTask({ dueDate: el.dataset.add });
      else if (el.dataset.open) openTaskPanel(el.dataset.open);
    });

    root.addEventListener('dblclick', (e) => {
      const cell = e.target.closest('.cal-chip');
      if (cell) toggleTask(cell.dataset.taskId);
    });

    root.querySelector('#cal-day-add')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = root.querySelector('#cal-day-input');
      if (quickAdd(input.value, { dueDate: ui.cursor })) input.value = '';
    });

    // drag & drop between dates (and onto hours in day view)
    let dragId = null;
    root.addEventListener('dragstart', (e) => {
      const c = e.target.closest('.cal-chip');
      if (!c) return;
      dragId = c.dataset.taskId;
      e.dataTransfer.setData('text/plain', dragId);
      e.dataTransfer.effectAllowed = 'move';
      c.classList.add('dragging');
    });
    root.addEventListener('dragend', () => {
      dragId = null;
      $$('.drop-target, .dragging', root).forEach((x) => x.classList.remove('drop-target', 'dragging'));
    });
    root.addEventListener('dragover', (e) => {
      const zone = e.target.closest('[data-date]');
      if (!dragId || !zone) return;
      e.preventDefault();
      $$('.drop-target', root).forEach((x) => x !== zone && x.classList.remove('drop-target'));
      zone.classList.add('drop-target');
    });
    root.addEventListener('drop', (e) => {
      const zone = e.target.closest('[data-date]');
      if (!dragId || !zone) return;
      e.preventDefault();
      const id = dragId;
      const date = zone.dataset.date || null;
      const hour = zone.dataset.hour;
      update(
        (st) => {
          moveToDate(st, id, date);
          const t = getTask(st, id);
          if (hour) t.dueTime = `${hour}:${t.dueTime?.slice(3) || '00'}`;
          else if (zone.classList.contains('anytime') || !date) t.dueTime = null;
        },
        { undo: 'Moved task' },
      );
    });
  },
};
