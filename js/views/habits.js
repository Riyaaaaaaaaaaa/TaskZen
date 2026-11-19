import { getState, undo, update } from '../core/store.js';
import { addHabit, deleteHabit, HABIT_ICONS, HABIT_TEMPLATES, habitDoneOn, habitStats, isScheduledOn, MAX_BACKFILL_DAYS, toggleHabit, updateHabit } from '../core/habits.js';
import { COLORS } from '../core/model.js';
import { addDays, diffDays, esc, fromDateKey, todayKey, toDateKey, WEEKDAY_NAMES } from '../core/utils.js';
import { confirmDialog, icon, openModal, toast } from '../ui/dom.js';
import { emptyState } from '../ui/components.js';

const ui = { category: 'all' };

function scheduleText(h) {
  if (h.schedule.type === 'daily') return 'Every day';
  if (h.schedule.type === 'weekly') return `${h.schedule.timesPerWeek}× per week`;
  const d = [...h.schedule.days].sort();
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '0,6') return 'Weekends';
  return d.map((x) => WEEKDAY_NAMES[x].slice(0, 3)).join(', ');
}

function heatmap(s, h, today) {
  // last 35 days, oldest first
  const cells = [];
  const created = toDateKey(new Date(h.createdAt));
  for (let i = 34; i >= 0; i--) {
    const d = addDays(today, -i);
    const done = habitDoneOn(s, h.id, d);
    const sched = isScheduledOn(h, d);
    const before = d < created;
    const editable = diffDays(d, today) <= MAX_BACKFILL_DAYS && !before;
    const label = `${fromDateKey(d).toDateString()}: ${done ? 'done' : before ? 'before habit started' : sched ? 'missed' : 'not scheduled'}`;
    cells.push(`<button type="button" class="hm ${done ? 'on' : ''} ${!sched || before ? 'off' : ''} ${d === today ? 'is-today' : ''} ${!done && sched && !before && d < today ? 'missed' : ''}"
      ${editable ? `data-log="${h.id}" data-date="${d}"` : 'disabled'} title="${label}" aria-label="${label}"></button>`);
  }
  return `<div class="heatmap c-${h.color}" aria-label="Completion calendar, last 5 weeks">${cells.join('')}</div>`;
}

function habitCard(s, h, today) {
  const st = habitStats(s, h, today, s.settings.weekStart);
  const done = habitDoneOn(s, h.id, today);
  const due = isScheduledOn(h, today);
  const cat = s.categories.find((c) => c.id === h.categoryId);
  return `<article class="habit-card card c-${h.color} ${done ? 'done' : ''}">
    <div class="habit-top">
      <button type="button" class="habit-toggle" data-log="${h.id}" data-date="${today}" aria-pressed="${done}" aria-label="${done ? 'Undo today’s check-in for' : 'Check in'} ${esc(h.name)}">
        ${icon(done ? 'check' : h.icon)}</button>
      <div class="grow"><h3>${esc(h.name)}</h3><p class="muted small">${scheduleText(h)}${cat ? ` · ${esc(cat.name)}` : ''}${!due ? ' · rest day' : ''}</p></div>
      <button class="icon-btn small" type="button" data-edit="${h.id}" aria-label="Edit ${esc(h.name)}">${icon('pencil')}</button>
      <button class="icon-btn small" type="button" data-del="${h.id}" aria-label="Delete ${esc(h.name)}">${icon('trash-2')}</button>
    </div>
    <div class="habit-stats">
      <div><span class="big-num">${icon('flame')}${st.current}</span><span class="muted small">current ${st.unit === 'weeks' ? 'week' : 'day'} streak</span></div>
      <div><span class="big-num">${st.best}</span><span class="muted small">best streak</span></div>
      <div><span class="big-num">${st.total}</span><span class="muted small">total check-ins</span></div>
    </div>
    ${st.unit === 'weeks' ? `<div class="mini-progress c-${h.color}" title="${st.thisWeek} of ${st.target} this week"><span style="width:${Math.min(100, (st.thisWeek / st.target) * 100)}%"></span></div><p class="muted small">${st.thisWeek}/${st.target} this week</p>` : ''}
    ${heatmap(s, h, today)}
    <div class="habit-rates">
      <span>Week <strong>${Math.round(st.weeklyRate * 100)}%</strong></span>
      <span>Month <strong>${Math.round(st.monthlyRate * 100)}%</strong></span>
      ${st.unit === 'days' ? `<span>Missed (30d) <strong>${st.missed}</strong></span>` : ''}
    </div>
  </article>`;
}

export function openHabitModal(habit = null) {
  const s = getState();
  const h = habit || { name: '', icon: 'sparkles', color: 'violet', categoryId: 'health', schedule: { type: 'daily', days: [1, 2, 3, 4, 5], timesPerWeek: 3 } };
  openModal({
    title: habit ? 'Edit habit' : 'New habit',
    wide: true,
    body: `<form class="habit-form" novalidate>
      ${habit ? '' : `<div class="templates"><span class="muted small">Quick start:</span>${HABIT_TEMPLATES.map((t, i) => `<button type="button" class="pill" data-tpl="${i}">${icon(t.icon)}${esc(t.name)}</button>`).join('')}</div>`}
      <div class="form-grid">
        <label class="field span-2"><span>Habit name <em>*</em></span><input name="name" required value="${esc(h.name)}" placeholder="e.g. Drink 8 glasses of water" autocomplete="off"></label>
        <label class="field"><span>Category</span><select name="categoryId">${s.categories.map((c) => `<option value="${c.id}" ${c.id === h.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Schedule</span><select name="type">
          <option value="daily" ${h.schedule.type === 'daily' ? 'selected' : ''}>Every day</option>
          <option value="days" ${h.schedule.type === 'days' ? 'selected' : ''}>Specific days</option>
          <option value="weekly" ${h.schedule.type === 'weekly' ? 'selected' : ''}>Times per week</option></select></label>
        <fieldset class="field span-2 ${h.schedule.type === 'days' ? '' : 'is-hidden'}" data-days><legend>On these days</legend><div class="seg">
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" name="days" value="${d}" ${h.schedule.days.includes(d) ? 'checked' : ''}><span>${WEEKDAY_NAMES[d].slice(0, 3)}</span></label>`).join('')}</div></fieldset>
        <label class="field ${h.schedule.type === 'weekly' ? '' : 'is-hidden'}" data-times><span>Times per week</span><input type="number" name="timesPerWeek" min="1" max="7" value="${h.schedule.timesPerWeek}"></label>
        <fieldset class="field span-2"><legend>Icon</legend><div class="icon-grid">
          ${HABIT_ICONS.map((ic) => `<label><input type="radio" name="icon" value="${ic}" ${ic === h.icon ? 'checked' : ''}><span title="${ic}">${icon(ic)}</span></label>`).join('')}</div></fieldset>
        <fieldset class="field span-2"><legend>Colour</legend><div class="color-grid">
          ${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === h.color ? 'checked' : ''}><span class="swatch sw-${c}" title="${c}"></span></label>`).join('')}</div></fieldset>
      </div>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">${habit ? 'Save changes' : `${icon('plus')}Create habit`}</button></div>
    </form>`,
    onMount: (el, close) => {
      const form = el.querySelector('form');
      const type = form.querySelector('[name="type"]');
      type.addEventListener('change', () => {
        form.querySelector('[data-days]').classList.toggle('is-hidden', type.value !== 'days');
        form.querySelector('[data-times]').classList.toggle('is-hidden', type.value !== 'weekly');
      });
      el.querySelectorAll('[data-tpl]').forEach((b) =>
        b.addEventListener('click', () => {
          const t = HABIT_TEMPLATES[b.dataset.tpl];
          form.name.value = t.name;
          form.querySelector(`[name="icon"][value="${t.icon}"]`).checked = true;
          form.querySelector(`[name="color"][value="${t.color}"]`).checked = true;
          const cat = form.querySelector(`[name="categoryId"] option[value="${t.categoryId}"]`);
          if (cat) cat.selected = true;
        }),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const name = String(f.get('name') || '').trim();
        const days = f.getAll('days').map(Number);
        const err = form.querySelector('.form-error');
        if (!name) {
          err.textContent = 'Please name your habit.';
          err.hidden = false;
          return;
        }
        if (f.get('type') === 'days' && !days.length) {
          err.textContent = 'Pick at least one day.';
          err.hidden = false;
          return;
        }
        const data = {
          name, icon: f.get('icon'), color: f.get('color'), categoryId: f.get('categoryId'),
          schedule: { type: f.get('type'), days, timesPerWeek: Number(f.get('timesPerWeek')) || 3 },
        };
        if (habit) update((st) => updateHabit(st, habit.id, data));
        else update((st) => addHabit(st, data));
        toast(habit ? 'Habit updated' : `New habit: ${name}`, { iconName: 'sprout', tone: 'success' });
        close();
      });
    },
  });
}

export default {
  id: 'habits',
  title: 'Habit Tracker',
  subtitle: 'Build better routines',
  icon: 'repeat',
  color: 'yellow',

  render(root, ctx) {
    const s = getState();
    const today = todayKey();
    const habits = s.habits.filter((h) => !h.archived && (ui.category === 'all' || h.categoryId === ui.category));
    const due = habits.filter((h) => isScheduledOn(h, today));
    const doneCount = due.filter((h) => habitDoneOn(s, h.id, today)).length;
    const cats = [...new Set(s.habits.map((h) => h.categoryId))].map((id) => s.categories.find((c) => c.id === id)).filter(Boolean);

    root.innerHTML = `
      <header class="page-head">
        <div><h1>Habit Tracker</h1><p class="muted">Habits are tracked separately from tasks. Missing a day pauses your streak — your history always stays.</p></div>
        <div class="page-actions">
          ${cats.length > 1 ? `<select id="h-cat" aria-label="Filter habits by category"><option value="all">All categories</option>${cats.map((c) => `<option value="${c.id}" ${ui.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
          <button class="btn btn-primary" type="button" data-new>${icon('plus')}New habit</button>
        </div>
      </header>
      ${s.habits.length ? `
      <section class="card habit-summary">
        <div><span class="big-num">${doneCount}/${due.length}</span><span class="muted small">done today</span></div>
        <div class="mini-progress grow"><span style="width:${due.length ? (doneCount / due.length) * 100 : 0}%"></span></div>
        <span class="muted small">${icon('info')}You can tick off the last ${MAX_BACKFILL_DAYS} days in each calendar.</span>
      </section>
      <div class="habit-grid">${habits.map((h) => habitCard(s, h, today)).join('')}</div>`
      : `<section class="card">${emptyState('sprout', 'Start your first habit', 'Small daily routines build big results. Pick one to begin:')}
          <div class="templates center">${HABIT_TEMPLATES.map((t, i) => `<button type="button" class="pill" data-quick="${i}">${icon(t.icon)}${esc(t.name)}</button>`).join('')}</div></section>`}`;

    root.querySelector('#h-cat')?.addEventListener('change', (e) => {
      ui.category = e.target.value;
      ctx.rerender();
    });

    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-new], [data-log], [data-edit], [data-del], [data-quick]');
      if (!el) return;
      if (el.dataset.new !== undefined) openHabitModal();
      if (el.dataset.log) {
        const before = getState().xp.length;
        const nowDone = update((st) => toggleHabit(st, el.dataset.log, el.dataset.date));
        if (nowDone && getState().xp.length > before) toast('Habit checked in · +5 XP', { iconName: 'sparkles', tone: 'success', timeout: 2500 });
      }
      if (el.dataset.edit) openHabitModal(getState().habits.find((h) => h.id === el.dataset.edit));
      if (el.dataset.del) {
        const h = getState().habits.find((x) => x.id === el.dataset.del);
        const ok = await confirmDialog({ title: `Delete “${h.name}”?`, message: 'This removes the habit and its check-in history. XP you already earned is kept.', confirmText: 'Delete habit', danger: true });
        if (ok) {
          update((st) => deleteHabit(st, h.id), { undo: 'Deleted habit' });
          toast('Habit deleted', { iconName: 'trash-2', actionLabel: 'Undo', onAction: undo });
        }
      }
      if (el.dataset.quick) {
        const t = HABIT_TEMPLATES[el.dataset.quick];
        update((st) => addHabit(st, t));
        toast(`New habit: ${t.name}`, { iconName: 'sprout', tone: 'success' });
      }
    });
  },
};
