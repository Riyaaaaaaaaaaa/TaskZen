// User-facing task actions with feedback and Undo. Views call these instead of
// mutating state directly, so behaviour is identical everywhere.
import { getState, undo, update } from '../core/store.js';
import * as T from '../core/tasks.js';
import { totalXP } from '../core/gamification.js';
import { parseTaskInput } from '../core/nlp.js';
import { formatTime, relativeDay } from '../core/utils.js';
import { confirmDialog, toast } from './dom.js';

function withXp(fn) {
  const before = totalXP(getState());
  fn();
  return totalXP(getState()) - before;
}

const undoToast = (msg, iconName = 'check', tone = 'default') =>
  toast(msg, { actionLabel: 'Undo', onAction: undo, iconName, tone });

export function toggleTask(id) {
  const t = T.getTask(getState(), id);
  if (!t) return;
  if (t.status === 'done') {
    update((s) => T.reopenTask(s, id), { undo: 'Reopened task' });
    undoToast(`Reopened “${t.title}”`, 'rotate-ccw');
  } else {
    const gained = withXp(() => update((s) => T.completeTask(s, id), { undo: 'Completed task' }));
    undoToast(`Done! ${gained > 0 ? `+${gained} XP` : ''}${t.recurrence ? ' · next one scheduled' : ''}`, 'party-popper', 'success');
  }
}

export function setTaskStatus(id, status) {
  const t = T.getTask(getState(), id);
  if (!t || t.status === status) return;
  const gained = withXp(() => update((s) => T.setStatus(s, id, status), { undo: 'Moved task' }));
  if (status === 'done') undoToast(`Done! ${gained > 0 ? `+${gained} XP` : ''}`, 'party-popper', 'success');
}

export async function deleteTasks(ids, { ask = true } = {}) {
  if (!ids.length) return false;
  if (ask) {
    const ok = await confirmDialog({
      title: ids.length === 1 ? 'Delete this task?' : `Delete ${ids.length} tasks?`,
      message: 'Deleted tasks can be restored with Undo straight away. XP earned from them is removed — archive instead to keep it.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return false;
  }
  update((s) => T.deleteTasks(s, ids), { undo: 'Deleted' });
  undoToast(ids.length === 1 ? 'Task deleted' : `${ids.length} tasks deleted`, 'trash-2');
  return true;
}

export function archiveTasks(ids, archived = true) {
  if (!ids.length) return;
  update((s) => T.archiveTasks(s, ids, archived), { undo: archived ? 'Archived' : 'Restored' });
  undoToast(archived ? `${ids.length} task${ids.length > 1 ? 's' : ''} archived` : 'Restored from archive', 'archive');
}

export function completeTasks(ids) {
  const gained = withXp(() =>
    update((s) => ids.forEach((id) => T.completeTask(s, id)), { undo: 'Completed tasks' }),
  );
  undoToast(`${ids.length} completed${gained > 0 ? ` · +${gained} XP` : ''}`, 'check-check', 'success');
}

export function duplicateTask(id) {
  const copy = update((s) => T.duplicateTask(s, id), { undo: 'Duplicated' });
  undoToast('Task duplicated', 'copy');
  return copy;
}

/** Create a task from natural language, with optional field overrides. */
export function quickAdd(text, overrides = {}) {
  const s = getState();
  if (!text.trim()) return null;
  const p = parseTaskInput(text, { categories: s.categories });
  const present = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
  // Defaults < context (e.g. the calendar day clicked) < what the user typed.
  const data = {
    priority: 'medium',
    categoryId: s.settings.defaultCategory,
    ...present(overrides),
    ...present({ title: p.title, dueDate: p.dueDate, dueTime: p.dueTime, priority: p.priority, categoryId: p.categoryId, estimate: p.estimate }),
    labels: p.labels,
  };
  const task = update((st) => T.createTask(st, data), { undo: 'Added task' });
  const when = task.dueDate
    ? ` · ${relativeDay(task.dueDate)}${task.dueTime ? ` ${formatTime(task.dueTime, s.settings.timeFormat)}` : ''}`
    : '';
  undoToast(`Added “${task.title}”${when}`, 'plus');
  return task;
}
