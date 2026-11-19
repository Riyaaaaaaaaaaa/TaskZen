// Reusable HTML fragments. All user text goes through esc().
import { esc, formatMinutes, formatTime, relativeDay } from '../core/utils.js';
import { STATUS_LABEL } from '../core/model.js';
import { isOverdue, RECURRENCE_LABEL } from '../core/tasks.js';
import { icon } from './dom.js';

export const PRIORITY_META = {
  low: { label: 'Low', color: 'mint', icon: 'arrow-down' },
  medium: { label: 'Medium', color: 'sky', icon: 'equal' },
  high: { label: 'High', color: 'peach', icon: 'arrow-up' },
  urgent: { label: 'Urgent', color: 'pink', icon: 'flame' },
};

export const category = (state, id) =>
  state.categories.find((c) => c.id === id) || { id, name: id || 'Uncategorised', color: 'violet', icon: 'tag' };

export function priorityBadge(p) {
  const m = PRIORITY_META[p] || PRIORITY_META.medium;
  return `<span class="badge badge-${m.color}" title="${m.label} priority">${icon(m.icon)}${m.label}</span>`;
}

export function categoryChip(state, id) {
  const c = category(state, id);
  return `<span class="chip chip-${c.color}">${icon(c.icon)}${esc(c.name)}</span>`;
}

export function dueLabel(state, t, now = new Date()) {
  if (!t.dueDate) return '';
  const overdue = isOverdue(t, now);
  const time = t.dueTime ? ` · ${formatTime(t.dueTime, state.settings.timeFormat)}` : '';
  return `<span class="due ${overdue ? 'due-overdue' : ''}">${icon(overdue ? 'alarm-clock' : 'calendar')}${relativeDay(t.dueDate)}${time}</span>`;
}

/** A task row used by the dashboard, My Tasks and the calendar day view. */
export function taskRow(state, t, { selectable = false, selected = false, draggable = false, compact = false } = {}) {
  const done = t.status === 'done';
  const subDone = t.subtasks.filter((s) => s.done).length;
  return `<li class="task-row ${done ? 'is-done' : ''} ${selected ? 'is-selected' : ''} ${compact ? 'compact' : ''}"
      data-task-id="${t.id}" ${draggable ? 'draggable="true"' : ''}>
    ${draggable ? `<span class="drag-handle" title="Drag to reorder" aria-hidden="true">${icon('grip-vertical')}</span>` : ''}
    ${selectable ? `<input type="checkbox" class="select-box" data-action="select" aria-label="Select ${esc(t.title)}" ${selected ? 'checked' : ''}>` : ''}
    <button class="check ${done ? 'checked' : ''} prio-${t.priority}" data-action="toggle" type="button"
      aria-label="${done ? 'Mark as not done' : 'Mark as done'}: ${esc(t.title)}" aria-pressed="${done}">${icon('check')}</button>
    <button class="task-main" data-action="open" type="button">
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-meta">
        ${categoryChip(state, t.categoryId)}
        ${compact ? '' : priorityBadge(t.priority)}
        ${t.status === 'in_progress' ? `<span class="badge badge-violet">${icon('loader')}In progress</span>` : ''}
        ${dueLabel(state, t)}
        ${t.subtasks.length ? `<span class="meta-item">${icon('list-checks')}${subDone}/${t.subtasks.length}</span>` : ''}
        ${t.recurrence ? `<span class="meta-item" title="Repeats">${icon('repeat')}${RECURRENCE_LABEL[t.recurrence.type]}</span>` : ''}
        ${t.estimate && !compact ? `<span class="meta-item">${icon('hourglass')}${formatMinutes(t.estimate)}</span>` : ''}
        ${compact ? '' : t.labels.map((l) => `<span class="label-tag">#${esc(l)}</span>`).join('')}
      </span>
    </button>
  </li>`;
}

export function emptyState(iconName, title, text = '', action = '') {
  return `<div class="empty">${icon(iconName, 'empty-ic')}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

export function progressRing(pct, { size = 120, stroke = 12, label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${Math.round(pct * 100)}% complete">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-value" stroke-width="${stroke}" fill="none"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-label"><strong>${label}</strong>${sub ? `<span>${sub}</span>` : ''}</div>
  </div>`;
}

/** Simple accessible bar chart. data: [{ label, value, title? }] */
export function barChart(data, { height = 140, color = 'violet', unit = '', highlightLast = false } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return `<div class="bars" style="--h:${height}px" role="img" aria-label="${esc(data.map((d) => `${d.label}: ${d.value}${unit}`).join(', '))}">
    ${data
      .map(
        (d, i) => `<div class="bar-col" title="${esc(d.title || `${d.label}: ${d.value}${unit}`)}">
        <span class="bar-val">${d.value ? d.value + unit : ''}</span>
        <div class="bar bar-${color} ${highlightLast && i === data.length - 1 ? 'bar-now' : ''}" style="height:${(d.value / max) * 100}%"></div>
        <span class="bar-label">${esc(d.label)}</span></div>`,
      )
      .join('')}
  </div>`;
}

export function statCard({ iconName, label, value, color = 'violet', hint = '' }) {
  return `<div class="stat-card stat-${color}">
    <span class="stat-icon">${icon(iconName)}</span>
    <div><span class="stat-value">${value}</span><span class="stat-label">${esc(label)}</span>${hint ? `<span class="stat-hint">${esc(hint)}</span>` : ''}</div>
  </div>`;
}

export const statusLabel = (s) => STATUS_LABEL[s];

export function avatarHTML(profile, size = 40) {
  if (profile.avatarImage) return `<img class="avatar" src="${esc(profile.avatarImage)}" alt="" width="${size}" height="${size}">`;
  return `<span class="avatar avatar-emoji" style="width:${size}px;height:${size}px;font-size:${size * 0.55}px" aria-hidden="true">${esc(profile.avatar || '🌸')}</span>`;
}
