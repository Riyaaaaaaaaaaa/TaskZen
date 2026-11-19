import { getState, update } from '../core/store.js';
import { averageCompletion, completionsPerDay, mostProductiveWeekday, periodSummary, weeklyHistory } from '../core/insights.js';
import { addDays, addMonths, daysInMonthKeys, esc, formatDate, formatMinutes, fromDateKey, todayKey, weekDays, WEEKDAY_NAMES } from '../core/utils.js';
import { icon, toast } from '../ui/dom.js';
import { barChart, statCard } from '../ui/components.js';
import { openTaskPanel } from '../ui/taskEditor.js';

const ui = { period: 'week', anchor: todayKey() };
const MOODS = [
  { id: 'great', label: 'Great', emoji: '😄' },
  { id: 'good', label: 'Good', emoji: '🙂' },
  { id: 'okay', label: 'Okay', emoji: '😐' },
  { id: 'tough', label: 'Tough', emoji: '😮‍💨' },
];

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default {
  id: 'insights',
  title: 'Insights',
  subtitle: 'Understand your progress',
  icon: 'chart-column',
  color: 'sky',

  render(root, ctx) {
    const s = getState();
    const today = todayKey();
    const sum = periodSummary(s, ui.period, ui.anchor, s.settings.weekStart);
    const days = ui.period === 'week' ? weekDays(ui.anchor, s.settings.weekStart) : daysInMonthKeys(ui.anchor);
    const perDay = completionsPerDay(s, days);
    const best = mostProductiveWeekday(s);
    const avg = averageCompletion(s);
    const hist = weeklyHistory(s, 12, today, s.settings.weekStart);
    const delta = sum.completed - sum.previousCompleted;
    const isCurrent = ui.period === 'week' ? days.includes(today) : ui.anchor.slice(0, 7) === today.slice(0, 7);
    const periodName = ui.period === 'week'
      ? `${formatDate(sum.from)} – ${formatDate(sum.to)}`
      : fromDateKey(sum.from).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const refl = s.reflections[today] || {};
    const recentRefl = Object.entries(s.reflections).filter(([d]) => d !== today).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5);
    const maxCat = Math.max(1, ...sum.categories.map((c) => c.completed));

    root.innerHTML = `
      <header class="page-head">
        <div><h1>Insights</h1><p class="muted">Based only on what you’ve actually recorded in TaskZen.</p></div>
        <div class="page-actions">
          <div class="tabs" role="tablist">${['week', 'month'].map((p) => `<button role="tab" type="button" class="tab ${ui.period === p ? 'active' : ''}" aria-selected="${ui.period === p}" data-period="${p}">${p === 'week' ? 'Weekly' : 'Monthly'}</button>`).join('')}</div>
        </div>
      </header>
      <div class="cal-nav">
        <button class="icon-btn" type="button" data-shift="-1" aria-label="Previous period">${icon('chevron-left')}</button>
        <h2>${periodName}</h2>
        <button class="icon-btn" type="button" data-shift="1" aria-label="Next period" ${isCurrent ? 'disabled' : ''}>${icon('chevron-right')}</button>
        ${isCurrent ? '' : '<button class="btn btn-ghost small" type="button" data-shift="0">Current</button>'}
      </div>
      <section class="stats-grid">
        ${statCard({ iconName: 'circle-check-big', label: 'Tasks completed', value: sum.completed, color: 'mint', hint: delta === 0 ? 'Same as before' : `${delta > 0 ? '+' : ''}${delta} vs previous ${ui.period}` })}
        ${statCard({ iconName: 'percent', label: 'On-schedule completion', value: pct(sum.completionRate), color: 'violet', hint: `${sum.dueCount} tasks were due` })}
        ${statCard({ iconName: 'timer', label: 'Focus time', value: formatMinutes(sum.focusMinutes), color: 'yellow', hint: `${sum.focusSessions} full sessions` })}
        ${statCard({ iconName: 'repeat', label: 'Habit consistency', value: pct(sum.habits.rate), color: 'peach', hint: `${sum.habits.done}/${sum.habits.due} check-ins` })}
        ${statCard({ iconName: 'sparkles', label: 'XP earned', value: sum.xp, color: 'sky' })}
        ${statCard({ iconName: 'calendar-heart', label: 'Most productive day', value: best ? best.day.slice(0, 3) : '—', color: 'pink', hint: best ? `${best.count} tasks all-time` : 'Not enough data yet' })}
      </section>

      <div class="dash-grid">
        <section class="card span-2"><h2 class="card-title">${icon('chart-column')}Completed per day</h2>
          ${barChart(perDay.map((d) => ({ label: ui.period === 'week' ? fromDateKey(d.date).toLocaleDateString(undefined, { weekday: 'short' }) : String(Number(d.date.slice(8))), value: d.count, title: `${formatDate(d.date)}: ${d.count}` })), { height: 160, color: 'violet' })}
        </section>
        <section class="card"><h2 class="card-title">${icon('shapes')}By category</h2>
          ${sum.categories.length ? `<ul class="hbars">${sum.categories.map((c) => `<li><span class="hbar-label">${esc(c.category.name)}</span>
            <span class="hbar"><span class="sw-${c.category.color}" style="width:${(c.completed / maxCat) * 100}%"></span></span><span class="muted small">${c.completed}</span></li>`).join('')}</ul>
            <p class="muted small">Tasks completed this ${ui.period} by category.</p>` : '<p class="muted">No tasks yet.</p>'}
        </section>
        <section class="card"><h2 class="card-title">${icon('calendar-range')}Weekday rhythm</h2>
          ${best ? barChart(best.counts.map((n, i) => ({ label: WEEKDAY_NAMES[i].slice(0, 2), value: n })), { height: 110, color: 'peach' }) : '<p class="muted">Complete a few tasks to see which days suit you best.</p>'}
        </section>
        <section class="card"><h2 class="card-title">${icon('hourglass')}Time to complete</h2>
          ${avg ? `<div class="focus-mini">
              <div><span class="big-num">${formatMinutes(avg.createdToDoneMin)}</span><span class="muted small">added → done (avg)</span></div>
              ${avg.startedToDoneMin != null ? `<div><span class="big-num">${formatMinutes(avg.startedToDoneMin)}</span><span class="muted small">started → done</span></div>` : ''}
            </div><p class="muted small">From ${avg.sample} task${avg.sample === 1 ? '' : 's'} with timing data. Move tasks to “In Progress” to measure working time.</p>`
            : '<p class="muted">Shown once you complete tasks created in TaskZen 2.0.</p>'}
        </section>
        <section class="card span-2"><h2 class="card-title">${icon('trending-up')}Last 12 weeks</h2>
          ${barChart(hist.map((w, i) => ({ label: i % 2 ? '' : w.label, value: w.completed, title: `Week of ${w.label}: ${w.completed} tasks, ${formatMinutes(w.focus)} focus` })), { height: 140, color: 'mint', highlightLast: true })}
        </section>

        <section class="card span-2"><h2 class="card-title">${icon('clipboard-list')}${ui.period === 'week' ? 'Weekly' : 'Monthly'} review</h2>
          <p>You completed <strong>${sum.completed}</strong> task${sum.completed === 1 ? '' : 's'}, focused for <strong>${formatMinutes(sum.focusMinutes)}</strong> and kept <strong>${pct(sum.habits.rate)}</strong> of your habits.</p>
          ${sum.highlights.length ? `<h3 class="small-title">${icon('star')}Big wins</h3><ul class="chips-list">${sum.highlights.map((t) => `<li class="chip chip-mint">${esc(t.title)}</li>`).join('')}</ul>` : ''}
          <h3 class="small-title">${icon('circle-dashed')}Still open (${sum.unfinished.length})</h3>
          ${sum.unfinished.length ? `<ul class="mini-list">${sum.unfinished.slice(0, 8).map((t) => `<li><button type="button" class="mini-item" data-open="${t.id}"><span class="dot dot-${t.priority}"></span><span class="grow">${esc(t.title)}</span><span class="muted small">due ${formatDate(t.dueDate)}</span></button></li>`).join('')}</ul>
            <a class="btn btn-soft small" href="#/dashboard">${icon('calendar-range')}Reschedule from the dashboard</a>` : '<p class="muted small">Nothing left hanging — lovely.</p>'}
        </section>

        <section class="card span-all"><h2 class="card-title">${icon('notebook-pen')}Daily reflection</h2>
          <form id="reflection" class="form-grid">
            <fieldset class="field span-2"><legend>How did today feel?</legend><div class="seg">
              ${MOODS.map((m) => `<label><input type="radio" name="mood" value="${m.id}" ${refl.mood === m.id ? 'checked' : ''}><span>${m.emoji} ${m.label}</span></label>`).join('')}</div></fieldset>
            <label class="field"><span>What went well?</span><textarea name="well" rows="3" placeholder="A win, big or small…">${esc(refl.well || '')}</textarea></label>
            <label class="field"><span>What could be better tomorrow?</span><textarea name="improve" rows="3" placeholder="One thing to adjust…">${esc(refl.improve || '')}</textarea></label>
            <div class="span-2 row"><button class="btn btn-primary" type="submit">${icon('save')}Save reflection</button>${s.reflections[today] ? '<span class="muted small">Saved for today — you can update it any time.</span>' : ''}</div>
          </form>
          ${recentRefl.length ? `<h3 class="small-title">Recent reflections</h3><ul class="reflections">${recentRefl.map(([d, r]) => `<li><strong>${formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}</strong> ${MOODS.find((m) => m.id === r.mood)?.emoji || ''}
            ${r.well ? `<p><span class="muted">Went well:</span> ${esc(r.well)}</p>` : ''}${r.improve ? `<p><span class="muted">Improve:</span> ${esc(r.improve)}</p>` : ''}</li>`).join('')}</ul>` : ''}
        </section>
      </div>`;

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-period], [data-shift], [data-open]');
      if (!el) return;
      if (el.dataset.period) {
        ui.period = el.dataset.period;
        ui.anchor = today;
      }
      if (el.dataset.shift !== undefined) {
        const n = Number(el.dataset.shift);
        ui.anchor = n === 0 ? today : ui.period === 'week' ? addDays(ui.anchor, 7 * n) : addMonths(ui.anchor, n);
        if (ui.anchor > today) ui.anchor = today;
      }
      if (el.dataset.open) return openTaskPanel(el.dataset.open);
      ctx.rerender();
    });

    root.querySelector('#reflection').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const r = { mood: f.get('mood') || null, well: String(f.get('well') || '').trim(), improve: String(f.get('improve') || '').trim(), savedAt: Date.now() };
      if (!r.mood && !r.well && !r.improve) return toast('Write a little something first', { iconName: 'pen-line' });
      update((st) => (st.reflections[today] = r));
      toast('Reflection saved', { iconName: 'notebook-pen', tone: 'success' });
    });
  },
};
