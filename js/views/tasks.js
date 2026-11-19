import { getState, update } from '../core/store.js';
import { filterTasks, reorder, sortTasks } from '../core/tasks.js';
import { PRIORITIES, STATUS_LABEL } from '../core/model.js';
import { esc } from '../core/utils.js';
import { $, $$, icon, refreshIcons } from '../ui/dom.js';
import { emptyState, PRIORITY_META, taskRow } from '../ui/components.js';
import { archiveTasks, completeTasks, deleteTasks, quickAdd, toggleTask } from '../ui/actions.js';
import { openNewTask, openTaskPanel } from '../ui/taskEditor.js';
import { openCategoryManager } from './settings.js';

// View-local UI state (kept while navigating around the app).
const ui = {
  search: '',
  status: 'all',
  priority: 'all',
  category: 'all',
  date: 'all',
  label: 'all',
  sort: 'manual',
  archived: false,
  selected: new Set(),
};

const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;

function visible(s) {
  return sortTasks(filterTasks(s.tasks, ui, new Date(), s.settings.weekStart), ui.sort);
}

function listHTML(s) {
  const list = visible(s);
  // drop selections that are no longer visible
  const ids = new Set(list.map((t) => t.id));
  [...ui.selected].forEach((id) => !ids.has(id) && ui.selected.delete(id));
  const canDrag = ui.sort === 'manual' && !ui.archived;
  if (!list.length) {
    const filtered = ui.search || ['status', 'priority', 'category', 'date', 'label'].some((k) => ui[k] !== 'all');
    return ui.archived
      ? emptyState('archive', 'Archive is empty', 'Completed tasks you archive will appear here.')
      : filtered
        ? emptyState('search-x', 'No matching tasks', 'Try a different search or clear the filters.', '<button class="btn btn-soft small" data-action="clear-filters" type="button">Clear filters</button>')
        : emptyState('sparkles', 'Your list is empty', 'Add your first task above — try typing “Read 20 pages tomorrow at 8pm”.');
  }
  return `<ul class="task-list" data-list>${list.map((t) => taskRow(s, t, { selectable: true, selected: ui.selected.has(t.id), draggable: canDrag })).join('')}</ul>`;
}

function bulkHTML(s) {
  const n = ui.selected.size;
  const list = visible(s);
  const all = list.length && list.every((t) => ui.selected.has(t.id));
  return `<label class="select-all"><input type="checkbox" data-action="select-all" ${all ? 'checked' : ''} ${list.length ? '' : 'disabled'}> ${n ? `${n} selected` : 'Select all'}</label>
    ${n ? `<div class="bulk-actions">
      ${ui.archived ? `<button class="btn btn-soft small" data-action="bulk-unarchive" type="button">${icon('archive-restore')}Restore</button>`
        : `<button class="btn btn-soft small" data-action="bulk-complete" type="button">${icon('check-check')}Complete</button>
           <button class="btn btn-ghost small" data-action="bulk-archive" type="button">${icon('archive')}Archive</button>`}
      <button class="btn btn-ghost small danger-text" data-action="bulk-delete" type="button">${icon('trash-2')}Delete</button>
      <button class="btn btn-ghost small" data-action="bulk-clear" type="button">Clear</button></div>` : ''}
    <span class="grow"></span><span class="muted small">${list.length} task${list.length === 1 ? '' : 's'}</span>`;
}

export default {
  id: 'tasks',
  title: 'My Tasks',
  subtitle: 'Organise everything',
  icon: 'list-todo',
  color: 'peach',

  render(root, ctx) {
    const s = getState();
    const doneCount = s.tasks.filter((t) => !t.archived && t.status === 'done').length;
    root.innerHTML = `
      <header class="page-head">
        <div><h1>My Tasks</h1><p class="muted">Everything in one place. Click a task to see its details.</p></div>
        <div class="page-actions">
          <button class="btn btn-ghost" data-action="categories" type="button">${icon('tags')}Categories</button>
          <button class="btn btn-primary" data-action="new" type="button">${icon('plus')}New task</button>
        </div>
      </header>
      <form class="quick-add card" id="tasks-add-form" autocomplete="off">
        ${icon('sparkles')}<input id="tasks-add" aria-label="Quick add a task" placeholder="Type a task in plain English — “Pay rent friday #personal !high”">
        <button class="btn btn-primary small" type="submit">Add</button>
      </form>
      <section class="card toolbar" aria-label="Search and filters">
        <div class="search">${icon('search')}<input id="tasks-search" type="search" placeholder="Search tasks, notes, labels…" value="${esc(ui.search)}" aria-label="Search tasks"></div>
        <div class="filters">
          <select data-filter="status" aria-label="Filter by status">${opt('all', 'All statuses', ui.status)}${Object.entries(STATUS_LABEL).map(([k, v]) => opt(k, v, ui.status)).join('')}</select>
          <select data-filter="priority" aria-label="Filter by priority">${opt('all', 'All priorities', ui.priority)}${PRIORITIES.map((p) => opt(p, PRIORITY_META[p].label, ui.priority)).join('')}</select>
          <select data-filter="category" aria-label="Filter by category">${opt('all', 'All categories', ui.category)}${s.categories.map((c) => opt(c.id, c.name, ui.category)).join('')}</select>
          <select data-filter="date" aria-label="Filter by date">${opt('all', 'Any date', ui.date)}${opt('today', 'Due today', ui.date)}${opt('week', 'This week', ui.date)}${opt('overdue', 'Overdue', ui.date)}${opt('none', 'No date', ui.date)}</select>
          ${s.labels.length ? `<select data-filter="label" aria-label="Filter by label">${opt('all', 'All labels', ui.label)}${s.labels.map((l) => opt(l, `#${l}`, ui.label)).join('')}</select>` : ''}
          <select data-filter="sort" aria-label="Sort tasks">${opt('manual', 'Sort: My order', ui.sort)}${opt('newest', 'Sort: Newest', ui.sort)}${opt('oldest', 'Sort: Oldest', ui.sort)}${opt('priority', 'Sort: Priority', ui.sort)}${opt('deadline', 'Sort: Deadline', ui.sort)}</select>
        </div>
        <div class="tabs" role="tablist">
          <button role="tab" class="tab ${!ui.archived ? 'active' : ''}" aria-selected="${!ui.archived}" data-action="tab-active" type="button">Tasks</button>
          <button role="tab" class="tab ${ui.archived ? 'active' : ''}" aria-selected="${ui.archived}" data-action="tab-archived" type="button">${icon('archive')}Archive</button>
          ${!ui.archived && doneCount ? `<button class="btn btn-ghost small" data-action="archive-done" type="button">${icon('archive')}Archive ${doneCount} completed</button>` : ''}
        </div>
      </section>
      <section class="card list-card">
        <div class="bulk-bar" id="bulk-bar">${bulkHTML(s)}</div>
        <div id="task-list-wrap">${listHTML(s)}</div>
        ${ui.sort === 'manual' && !ui.archived ? `<p class="muted small hint">${icon('grip-vertical')}Drag tasks to reorder them.</p>` : ''}
      </section>`;

    const refreshList = () => {
      const st = getState();
      $('#task-list-wrap', root).innerHTML = listHTML(st);
      $('#bulk-bar', root).innerHTML = bulkHTML(st);
      refreshIcons();
    };

    $('#tasks-add-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#tasks-add', root);
      const overrides = ui.category !== 'all' ? { categoryId: ui.category } : {};
      if (quickAdd(input.value, overrides)) input.value = '';
    });

    $('#tasks-search', root).addEventListener('input', (e) => {
      ui.search = e.target.value;
      refreshList();
    });

    root.addEventListener('change', (e) => {
      const f = e.target.dataset.filter;
      if (f) {
        ui[f] = e.target.value;
        ui.selected.clear();
        ctx.rerender();
        return;
      }
      if (e.target.dataset.action === 'select') {
        const id = e.target.closest('[data-task-id]').dataset.taskId;
        e.target.checked ? ui.selected.add(id) : ui.selected.delete(id);
        e.target.closest('.task-row').classList.toggle('is-selected', e.target.checked);
        $('#bulk-bar', root).innerHTML = bulkHTML(getState());
        refreshIcons();
      }
      if (e.target.dataset.action === 'select-all') {
        const list = visible(getState());
        if (e.target.checked) list.forEach((t) => ui.selected.add(t.id));
        else ui.selected.clear();
        refreshList();
      }
    });

    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const a = el.dataset.action;
      const row = el.closest('[data-task-id]');
      const ids = [...ui.selected];
      if (a === 'toggle') toggleTask(row.dataset.taskId);
      if (a === 'open') openTaskPanel(row.dataset.taskId);
      if (a === 'new') openNewTask(ui.category !== 'all' ? { categoryId: ui.category } : {});
      if (a === 'categories') openCategoryManager();
      if (a === 'tab-active' || a === 'tab-archived') {
        ui.archived = a === 'tab-archived';
        ui.selected.clear();
        ctx.rerender();
      }
      if (a === 'clear-filters') {
        Object.assign(ui, { search: '', status: 'all', priority: 'all', category: 'all', date: 'all', label: 'all' });
        ctx.rerender();
      }
      if (a === 'archive-done') archiveTasks(getState().tasks.filter((t) => !t.archived && t.status === 'done').map((t) => t.id));
      if (a === 'bulk-complete') {
        const open = ids.filter((id) => getState().tasks.find((t) => t.id === id)?.status !== 'done');
        if (open.length) completeTasks(open);
        ui.selected.clear();
      }
      if (a === 'bulk-archive' || a === 'bulk-unarchive') {
        archiveTasks(ids, a === 'bulk-archive');
        ui.selected.clear();
      }
      if (a === 'bulk-delete') {
        if (await deleteTasks(ids)) ui.selected.clear();
      }
      if (a === 'bulk-clear') {
        ui.selected.clear();
        refreshList();
      }
    });

    // Drag to reorder (manual sort only).
    let dragId = null;
    root.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.task-row');
      if (!row) return;
      dragId = row.dataset.taskId;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    root.addEventListener('dragend', () => {
      $$('.dragging, .drop-before, .drop-after', root).forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
      dragId = null;
    });
    root.addEventListener('dragover', (e) => {
      const row = e.target.closest('.task-row');
      if (!dragId || !row || row.dataset.taskId === dragId) return;
      e.preventDefault();
      const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
      $$('.drop-before, .drop-after', root).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      row.classList.add(after ? 'drop-after' : 'drop-before');
    });
    root.addEventListener('drop', (e) => {
      const row = e.target.closest('.task-row');
      if (!dragId || !row) return;
      e.preventDefault();
      const after = row.classList.contains('drop-after');
      const targetId = row.dataset.taskId;
      const st = getState();
      const order = sortTasks(st.tasks.filter((t) => !t.archived), 'manual').map((t) => t.id).filter((id) => id !== dragId);
      let idx = order.indexOf(targetId);
      if (after) idx++;
      order.splice(idx, 0, dragId);
      update((x) => reorder(x, order));
    });
  },
};
