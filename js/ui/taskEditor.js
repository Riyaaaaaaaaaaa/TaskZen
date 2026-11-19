// New-task modal and the task detail side panel.
import { getState, subscribe, update } from '../core/store.js';
import * as T from '../core/tasks.js';
import { PRIORITIES, STATUS_LABEL } from '../core/model.js';
import { esc, formatDate, toDateKey, uid } from '../core/utils.js';
import { $, icon, openModal, refreshIcons, toast } from './dom.js';
import { archiveTasks, deleteTasks, duplicateTask, setTaskStatus, toggleTask } from './actions.js';
import { PRIORITY_META } from './components.js';

const opt = (value, label, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;

function fieldsHTML(state, t) {
  const rec = t.recurrence?.type || 'none';
  return `
  <div class="form-grid">
    <label class="field span-2"><span>Task name <em>*</em></span>
      <input name="title" required maxlength="300" value="${esc(t.title)}" placeholder="What needs doing?" autocomplete="off"></label>
    <label class="field span-2"><span>Description</span>
      <textarea name="description" rows="3" placeholder="Add details, context or notes">${esc(t.description)}</textarea></label>
    <label class="field"><span>Category</span><select name="categoryId">
      ${state.categories.map((c) => opt(c.id, c.name, c.id === t.categoryId)).join('')}</select></label>
    <label class="field"><span>Priority</span><select name="priority">
      ${PRIORITIES.map((p) => opt(p, PRIORITY_META[p].label, p === t.priority)).join('')}</select></label>
    <label class="field"><span>Status</span><select name="status">
      ${Object.entries(STATUS_LABEL).map(([k, v]) => opt(k, v, k === t.status)).join('')}</select></label>
    <label class="field"><span>Estimated time (minutes)</span>
      <input name="estimate" type="number" min="1" max="1440" step="5" value="${t.estimate ?? ''}" placeholder="e.g. 30"></label>
    <label class="field"><span>Due date</span><input name="dueDate" type="date" value="${t.dueDate ?? ''}"></label>
    <label class="field"><span>Due time</span><input name="dueTime" type="time" value="${t.dueTime ?? ''}"></label>
    <label class="field"><span>Repeats</span><select name="recurrence">
      ${opt('none', 'Does not repeat', rec === 'none')}${opt('daily', 'Daily', rec === 'daily')}
      ${opt('weekly', 'Weekly', rec === 'weekly')}${opt('monthly', 'Monthly', rec === 'monthly')}
      ${opt('custom', 'Custom (every N days)', rec === 'custom')}</select></label>
    <label class="field ${rec === 'none' ? 'is-hidden' : ''}" data-interval><span>Every</span>
      <div class="input-suffix"><input name="interval" type="number" min="1" max="365" value="${t.recurrence?.interval ?? 1}">
      <span data-interval-unit>${{ daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', custom: 'day(s)' }[rec] || ''}</span></div></label>
    <label class="field span-2"><span>Labels <small>comma separated</small></span>
      <input name="labels" value="${esc(t.labels.join(', '))}" placeholder="e.g. deep-work, errands" list="label-suggestions" autocomplete="off">
      <datalist id="label-suggestions">${state.labels.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></label>
    <label class="field span-2"><span>Links / attachments <small>one URL per line</small></span>
      <textarea name="links" rows="2" placeholder="https://…">${esc(t.links.join('\n'))}</textarea></label>
  </div>`;
}

function readFields(form) {
  const f = new FormData(form);
  const rec = f.get('recurrence');
  const links = String(f.get('links') || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
  return {
    title: String(f.get('title') || '').trim(),
    description: String(f.get('description') || ''),
    categoryId: f.get('categoryId'),
    priority: f.get('priority'),
    status: f.get('status'),
    estimate: f.get('estimate') ? Number(f.get('estimate')) : null,
    dueDate: f.get('dueDate') || null,
    dueTime: f.get('dueTime') || null,
    recurrence: rec === 'none' ? null : { type: rec, interval: Number(f.get('interval')) || 1 },
    labels: String(f.get('labels') || '')
      .split(',')
      .map((s) => s.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean),
    links,
  };
}

function wireRecurrence(form) {
  const sel = form.querySelector('[name="recurrence"]');
  const wrap = form.querySelector('[data-interval]');
  const unit = form.querySelector('[data-interval-unit]');
  sel.addEventListener('change', () => {
    wrap.classList.toggle('is-hidden', sel.value === 'none');
    unit.textContent = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', custom: 'day(s)' }[sel.value] || '';
  });
}

/** Open the "New task" dialog. defaults can preset a date, status, category… */
export function openNewTask(defaults = {}) {
  const state = getState();
  const draft = { title: '', description: '', categoryId: state.settings.defaultCategory, priority: 'medium', status: 'todo', estimate: null, dueDate: null, dueTime: null, recurrence: null, labels: [], links: [], subtasks: [], ...defaults };
  openModal({
    title: 'New task',
    wide: true,
    body: `<form class="task-form" novalidate>${fieldsHTML(state, draft)}
      <label class="field"><span>Subtasks <small>one per line</small></span>
        <textarea name="subtasks" rows="3" placeholder="Draft outline&#10;Review with team"></textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="submit">${icon('plus')}Create task</button></div></form>`,
    onMount: (el, close) => {
      const form = el.querySelector('form');
      wireRecurrence(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = readFields(form);
        if (!data.title) {
          const err = form.querySelector('.form-error');
          err.textContent = 'Please give the task a name.';
          err.hidden = false;
          form.querySelector('[name="title"]').focus();
          return;
        }
        data.subtasks = String(new FormData(form).get('subtasks') || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((title) => ({ id: uid('sub'), title, done: false }));
        update((s) => T.createTask(s, data), { undo: 'Added task' });
        toast(`Added “${data.title}”`, { iconName: 'plus', tone: 'success' });
        close();
      });
    },
  });
}

// ---------- detail panel ----------

let panelTaskId = null;
let unsubscribe = null;

export function closeTaskPanel() {
  const drawer = $('#drawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  $('#drawer-backdrop').classList.remove('open');
  panelTaskId = null;
  unsubscribe?.();
  unsubscribe = null;
}

export function openTaskPanel(id) {
  panelTaskId = id;
  const drawer = $('#drawer');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  $('#drawer-backdrop').classList.add('open');
  renderPanel();
  unsubscribe?.();
  unsubscribe = subscribe(() => renderPanel());
  setTimeout(() => drawer.querySelector('[name="title"]')?.focus(), 50);
}

function renderPanel() {
  const drawer = $('#drawer');
  const state = getState();
  const t = T.getTask(state, panelTaskId);
  if (!t) return closeTaskPanel();
  const active = document.activeElement;
  const focusKey = drawer.contains(active) ? active.name || active.dataset.subId : null;
  const scrollTop = drawer.querySelector('.drawer-body')?.scrollTop || 0;
  const done = t.status === 'done';
  const subDone = t.subtasks.filter((s) => s.done).length;
  drawer.innerHTML = `
    <header class="drawer-head">
      <button class="check big ${done ? 'checked' : ''} prio-${t.priority}" data-p="toggle" type="button" aria-label="${done ? 'Mark as not done' : 'Mark as done'}">${icon('check')}</button>
      <div class="drawer-title"><span class="eyebrow">Task details</span>
        <span class="muted small">Created ${t.migrated ? 'in TaskZen 1.0' : formatDate(toKey(t.createdAt))}${t.completedAt ? ` · Completed ${formatDate(toKey(t.completedAt))}` : ''}</span></div>
      <button class="icon-btn" data-p="close" type="button" aria-label="Close panel">${icon('x')}</button>
    </header>
    <form class="drawer-body task-form" novalidate>
      ${fieldsHTML(state, t)}
      <section class="subtasks">
        <h3>${icon('list-checks')}Subtasks <span class="muted">${subDone}/${t.subtasks.length}</span></h3>
        ${t.subtasks.length ? `<div class="mini-progress"><span style="width:${(subDone / t.subtasks.length) * 100}%"></span></div>` : ''}
        <ul>${t.subtasks
          .map(
            (s) => `<li class="${s.done ? 'is-done' : ''}">
            <button type="button" class="check small ${s.done ? 'checked' : ''}" data-p="sub-toggle" data-sub="${s.id}" aria-label="Toggle subtask">${icon('check')}</button>
            <input class="sub-input" data-sub-id="${s.id}" value="${esc(s.title)}" aria-label="Subtask">
            <button type="button" class="icon-btn small" data-p="sub-del" data-sub="${s.id}" aria-label="Remove subtask">${icon('x')}</button></li>`,
          )
          .join('')}</ul>
        <div class="add-sub"><input name="newSub" placeholder="Add a subtask and press Enter" autocomplete="off">
          <button type="button" class="btn btn-soft small" data-p="sub-add">${icon('plus')}Add</button></div>
      </section>
      ${t.links.length ? `<section class="links"><h3>${icon('paperclip')}Links</h3>${t.links.map((l) => `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>`).join('')}</section>` : ''}
    </form>
    <footer class="drawer-foot">
      <button class="btn btn-soft" type="button" data-p="focus">${icon('timer')}Focus on this</button>
      <button class="btn btn-ghost" type="button" data-p="duplicate">${icon('copy')}Duplicate</button>
      <button class="btn btn-ghost" type="button" data-p="archive">${icon('archive')}${t.archived ? 'Unarchive' : 'Archive'}</button>
      <button class="btn btn-ghost danger-text" type="button" data-p="delete">${icon('trash-2')}Delete</button>
    </footer>`;
  refreshIcons();
  const form = drawer.querySelector('form');
  form.scrollTop = scrollTop;
  wireRecurrence(form);

  // Save main fields when a control changes.
  form.addEventListener('change', (e) => {
    if (e.target.name === 'newSub') return;
    if (e.target.classList.contains('sub-input')) {
      const subId = e.target.dataset.subId;
      const title = e.target.value.trim();
      update((s) => {
        const sub = T.getTask(s, t.id)?.subtasks.find((x) => x.id === subId);
        if (sub && title) sub.title = title;
      });
      return;
    }
    const data = readFields(form);
    if (!data.title) {
      toast('A task needs a name', { tone: 'warn', iconName: 'alert-circle' });
      return;
    }
    const { status, ...rest } = data;
    update((s) => T.updateTask(s, t.id, rest));
    if (status !== t.status) setTaskStatus(t.id, status);
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  const addSub = () => {
    const input = form.querySelector('[name="newSub"]');
    const title = input.value.trim();
    if (!title) return;
    update((s) => {
      const task = T.getTask(s, t.id);
      task.subtasks.push({ id: uid('sub'), title, done: false });
      task.updatedAt = Date.now();
    });
    setTimeout(() => $('#drawer [name="newSub"]')?.focus(), 0);
  };
  form.querySelector('[name="newSub"]').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSub();
    }
  });

  drawer.onclick = async (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const a = b.dataset.p;
    if (a === 'close') closeTaskPanel();
    if (a === 'toggle') toggleTask(t.id);
    if (a === 'sub-add') addSub();
    if (a === 'sub-toggle') update((s) => T.toggleSubtask(s, t.id, b.dataset.sub));
    if (a === 'sub-del')
      update((s) => {
        const task = T.getTask(s, t.id);
        task.subtasks = task.subtasks.filter((x) => x.id !== b.dataset.sub);
      });
    if (a === 'duplicate') {
      const copy = duplicateTask(t.id);
      openTaskPanel(copy.id);
    }
    if (a === 'archive') archiveTasks([t.id], !t.archived);
    if (a === 'delete') {
      if (await deleteTasks([t.id])) closeTaskPanel();
    }
    if (a === 'focus') {
      closeTaskPanel();
      location.hash = `#/focus?task=${t.id}`;
    }
  };

  if (focusKey) {
    const el = drawer.querySelector(`[name="${focusKey}"], [data-sub-id="${focusKey}"]`);
    el?.focus({ preventScroll: true });
  }
}

const toKey = (ts) => toDateKey(new Date(ts));

export const isPanelOpen = () => !!panelTaskId;
