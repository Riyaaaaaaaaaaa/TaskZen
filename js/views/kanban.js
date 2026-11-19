import { getState, update } from '../core/store.js';
import { activeTasks, reorder, sortTasks } from '../core/tasks.js';
import { STATUS_LABEL, STATUSES } from '../core/model.js';
import { esc } from '../core/utils.js';
import { $$, icon } from '../ui/dom.js';
import { categoryChip, dueLabel, priorityBadge } from '../ui/components.js';
import { quickAdd, setTaskStatus } from '../ui/actions.js';
import { openTaskPanel } from '../ui/taskEditor.js';

const COLUMN_META = {
  todo: { color: 'sky', icon: 'circle-dashed' },
  in_progress: { color: 'peach', icon: 'loader' },
  done: { color: 'mint', icon: 'circle-check-big' },
};

const ui = { category: 'all', adding: null };

function card(s, t) {
  const subDone = t.subtasks.filter((x) => x.done).length;
  const others = STATUSES.filter((x) => x !== t.status);
  return `<article class="k-card prio-edge-${t.priority}" draggable="true" data-task-id="${t.id}">
    <button type="button" class="k-open" data-open="${t.id}"><h3>${esc(t.title)}</h3>
      ${t.description ? `<p class="muted small clamp-2">${esc(t.description)}</p>` : ''}</button>
    <div class="k-meta">${priorityBadge(t.priority)}${categoryChip(s, t.categoryId)}</div>
    <div class="k-foot">${dueLabel(s, t)}${t.subtasks.length ? `<span class="meta-item">${icon('list-checks')}${subDone}/${t.subtasks.length}</span>` : ''}
      <span class="grow"></span>
      <label class="k-move"><span class="sr-only">Move to</span><select data-move="${t.id}" aria-label="Move “${esc(t.title)}” to another column">
        <option value="">Move…</option>${others.map((x) => `<option value="${x}">${STATUS_LABEL[x]}</option>`).join('')}</select></label>
    </div></article>`;
}

export default {
  id: 'kanban',
  title: 'Kanban Board',
  subtitle: 'Visual task management',
  icon: 'square-kanban',
  color: 'mint',

  render(root, ctx) {
    const s = getState();
    const tasks = activeTasks(s).filter((t) => ui.category === 'all' || t.categoryId === ui.category);
    root.innerHTML = `
      <header class="page-head">
        <div><h1>Kanban Board</h1><p class="muted">Drag cards between columns. Changes sync instantly with My Tasks and the Calendar.</p></div>
        <div class="page-actions"><select id="k-cat" aria-label="Filter board by category"><option value="all">All categories</option>
          ${s.categories.map((c) => `<option value="${c.id}" ${ui.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      </header>
      <div class="kanban">
        ${STATUSES.map((st) => {
          const list = sortTasks(tasks.filter((t) => t.status === st), 'manual');
          const m = COLUMN_META[st];
          return `<section class="k-col k-${m.color}" data-status="${st}" aria-label="${STATUS_LABEL[st]}">
            <header class="k-head"><span class="k-ic">${icon(m.icon)}</span><h2>${STATUS_LABEL[st]}</h2><span class="count">${list.length}</span>
              <button class="icon-btn small" type="button" data-add="${st}" aria-label="Add a task to ${STATUS_LABEL[st]}">${icon('plus')}</button></header>
            ${ui.adding === st ? `<form class="k-add" data-form="${st}"><input id="k-add-${st}" placeholder="Task name…" aria-label="New task name" autocomplete="off"><div class="row"><button class="btn btn-primary small">Add</button><button type="button" class="btn btn-ghost small" data-cancel>Cancel</button></div></form>` : ''}
            <div class="k-list" data-status="${st}">${list.map((t) => card(s, t)).join('') || `<p class="k-empty">${st === 'done' ? 'Finished tasks land here' : 'Drop tasks here'}</p>`}</div>
          </section>`;
        }).join('')}
      </div>`;

    root.querySelector('#k-cat').addEventListener('change', (e) => {
      ui.category = e.target.value;
      ctx.rerender();
    });

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-open], [data-add], [data-cancel]');
      if (!el) return;
      if (el.dataset.open) openTaskPanel(el.dataset.open);
      if (el.dataset.add) {
        ui.adding = el.dataset.add;
        ctx.rerender();
        setTimeout(() => document.getElementById(`k-add-${ui.adding}`)?.focus(), 0);
      }
      if (el.dataset.cancel !== undefined) {
        ui.adding = null;
        ctx.rerender();
      }
    });

    root.addEventListener('submit', (e) => {
      const st = e.target.dataset.form;
      if (!st) return;
      e.preventDefault();
      const input = e.target.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      ui.adding = st;
      const overrides = { status: st };
      if (ui.category !== 'all') overrides.categoryId = ui.category;
      quickAdd(text, overrides);
      setTimeout(() => document.getElementById(`k-add-${st}`)?.focus(), 0);
    });

    root.addEventListener('change', (e) => {
      const id = e.target.dataset.move;
      if (id && e.target.value) setTaskStatus(id, e.target.value);
    });

    // drag & drop
    let dragId = null;
    root.addEventListener('dragstart', (e) => {
      const c = e.target.closest('.k-card');
      if (!c) return;
      dragId = c.dataset.taskId;
      e.dataTransfer.setData('text/plain', dragId);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => c.classList.add('dragging'));
    });
    root.addEventListener('dragend', () => {
      dragId = null;
      $$('.dragging, .col-over, .drop-before', root).forEach((x) => x.classList.remove('dragging', 'col-over', 'drop-before'));
    });
    root.addEventListener('dragover', (e) => {
      const list = e.target.closest('.k-list');
      if (!dragId || !list) return;
      e.preventDefault();
      $$('.col-over', root).forEach((x) => x !== list && x.classList.remove('col-over'));
      list.classList.add('col-over');
      $$('.drop-before', root).forEach((x) => x.classList.remove('drop-before'));
      const target = e.target.closest('.k-card');
      if (target && target.dataset.taskId !== dragId) target.classList.add('drop-before');
    });
    root.addEventListener('drop', (e) => {
      const list = e.target.closest('.k-list');
      if (!dragId || !list) return;
      e.preventDefault();
      const id = dragId;
      const status = list.dataset.status;
      const before = e.target.closest('.k-card')?.dataset.taskId;
      // Reorder within the column first, then change status (with XP/undo).
      const st = getState();
      const order = sortTasks(activeTasks(st), 'manual').map((t) => t.id).filter((x) => x !== id);
      const idx = before && before !== id ? order.indexOf(before) : order.length;
      order.splice(idx, 0, id);
      update((x) => reorder(x, order), { silent: true });
      if (st.tasks.find((t) => t.id === id).status !== status) setTaskStatus(id, status);
      else ctx.rerender();
    });
  },
};
