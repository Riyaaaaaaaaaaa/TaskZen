import { exportData, getSaveError, getState, hasBackup, importData, resetAll, restoreBackup, STORAGE_KEY, update } from '../core/store.js';
import { COLORS } from '../core/model.js';
import { refreshDurations } from '../core/focus.js';
import { esc, todayKey } from '../core/utils.js';
import { confirmDialog, download, icon, openModal, toast } from '../ui/dom.js';
import { avatarHTML } from '../ui/components.js';

const AVATARS = ['🌸', '🌿', '🦊', '🐼', '🐱', '🦉', '🐢', '🌻', '🍀', '🌈', '⭐', '🎧'];
const CATEGORY_ICONS = ['briefcase', 'home', 'heart-pulse', 'book-open', 'utensils', 'dumbbell', 'palette', 'music', 'graduation-cap', 'plane', 'shopping-cart', 'code', 'users', 'wallet', 'leaf', 'tag'];

const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function openCategoryManager() {
  const renderBody = () => {
    const s = getState();
    return `<ul class="cat-list">${s.categories.map((c) => {
      const used = s.tasks.filter((t) => t.categoryId === c.id).length;
      return `<li data-cat="${c.id}">
        <span class="chip chip-${c.color}">${icon(c.icon)}</span>
        <input value="${esc(c.name)}" data-field="name" aria-label="Category name" maxlength="30">
        <select data-field="color" aria-label="Colour">${COLORS.map((x) => `<option value="${x}" ${x === c.color ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <select data-field="icon" aria-label="Icon">${CATEGORY_ICONS.map((x) => `<option value="${x}" ${x === c.icon ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <span class="muted small">${used} task${used === 1 ? '' : 's'}</span>
        <button type="button" class="icon-btn small" data-del-cat="${c.id}" aria-label="Delete ${esc(c.name)}" ${s.categories.length <= 1 ? 'disabled' : ''}>${icon('trash-2')}</button></li>`;
    }).join('')}</ul>
    <form class="add-cat row" autocomplete="off"><input name="name" placeholder="New category name" aria-label="New category name" maxlength="30" required>
      <button class="btn btn-primary small" type="submit">${icon('plus')}Add category</button></form>`;
  };

  openModal({
    title: 'Categories',
    wide: true,
    body: '<div data-cat-body></div>',
    onMount: (el) => {
      const body = el.querySelector('[data-cat-body]');
      const paint = () => {
        body.innerHTML = renderBody();
        window.lucide?.createIcons();
      };
      paint();
      body.addEventListener('change', (e) => {
        const li = e.target.closest('[data-cat]');
        if (!li || !e.target.dataset.field) return;
        const value = e.target.value.trim();
        if (!value) return paint();
        update((s) => {
          const c = s.categories.find((x) => x.id === li.dataset.cat);
          c[e.target.dataset.field] = value;
        });
        paint();
      });
      body.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        if (!name) return;
        const s = getState();
        let id = slug(name) || 'category';
        if (s.categories.some((c) => c.id === id || c.name.toLowerCase() === name.toLowerCase())) return toast('That category already exists', { iconName: 'alert-circle', tone: 'warn' });
        update((st) => st.categories.push({ id, name, color: COLORS[st.categories.length % COLORS.length], icon: 'tag' }));
        paint();
        el.querySelector('.add-cat input')?.focus();
      });
      body.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-del-cat]');
        if (!b) return;
        const s = getState();
        const c = s.categories.find((x) => x.id === b.dataset.delCat);
        const fallback = s.categories.find((x) => x.id !== c.id);
        const used = s.tasks.filter((t) => t.categoryId === c.id).length + s.habits.filter((h) => h.categoryId === c.id).length;
        const ok = await confirmDialog({
          title: `Delete “${c.name}”?`,
          message: used ? `${used} task(s)/habit(s) use it and will move to “${fallback.name}”.` : 'No tasks use this category.',
          confirmText: 'Delete category',
          danger: true,
        });
        if (!ok) return;
        update((st) => {
          st.tasks.forEach((t) => t.categoryId === c.id && (t.categoryId = fallback.id));
          st.habits.forEach((h) => h.categoryId === c.id && (h.categoryId = fallback.id));
          st.categories = st.categories.filter((x) => x.id !== c.id);
          if (st.settings.defaultCategory === c.id) st.settings.defaultCategory = fallback.id;
        }, { undo: 'Deleted category' });
        paint();
      });
    },
  });
}

function resizeImage(file, size = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const m = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const toggle = (name, checked, label, hint = '') =>
  `<label class="switch-row"><span><strong>${label}</strong>${hint ? `<small class="muted">${hint}</small>` : ''}</span>
   <input type="checkbox" class="switch" name="${name}" ${checked ? 'checked' : ''}></label>`;

export default {
  id: 'settings',
  title: 'Settings',
  subtitle: 'Profile & preferences',
  icon: 'settings',
  color: 'violet',

  render(root) {
    const s = getState();
    const st = s.settings;
    const n = st.notifications;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
    const saveErr = getSaveError();

    root.innerHTML = `
      <header class="page-head"><div><h1>Settings & Profile</h1><p class="muted">Changes save instantly. Everything is stored privately in this browser.</p></div></header>
      ${saveErr ? `<div class="alert">${icon('alert-triangle')}Couldn’t save your latest changes — browser storage may be full. Export a backup now.</div>` : ''}
      <div class="settings-grid">
        <section class="card">
          <h2 class="card-title">${icon('user-round')}Profile</h2>
          <div class="profile-row">${avatarHTML(s.profile, 64)}
            <label class="field grow"><span>Your name</span><input id="set-name" name="profile.name" value="${esc(s.profile.name)}" placeholder="What should we call you?" maxlength="40"></label></div>
          <fieldset class="field"><legend>Avatar</legend><div class="avatar-grid">
            ${AVATARS.map((a) => `<button type="button" class="avatar-pick ${!s.profile.avatarImage && s.profile.avatar === a ? 'active' : ''}" data-avatar="${a}" aria-label="Use ${a} as avatar">${a}</button>`).join('')}
            <label class="avatar-pick upload" title="Upload a photo">${icon('upload')}<input type="file" accept="image/*" id="avatar-file" class="sr-only"></label>
          </div></fieldset>
        </section>

        <section class="card">
          <h2 class="card-title">${icon('palette')}Appearance</h2>
          <fieldset class="field"><legend>Theme</legend><div class="seg">
            ${[['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'System', 'monitor']].map(([v, l, i]) => `<label><input type="radio" name="settings.theme" value="${v}" ${st.theme === v ? 'checked' : ''}><span>${icon(i)}${l}</span></label>`).join('')}</div></fieldset>
          ${toggle('settings.celebrate', st.celebrate, 'Celebration animations', 'Confetti for level-ups, badges and finishing your day')}
        </section>

        <section class="card">
          <h2 class="card-title">${icon('sliders-horizontal')}Preferences</h2>
          <div class="form-grid">
            <label class="field"><span>Week starts on</span><select name="settings.weekStart"><option value="1" ${st.weekStart === 1 ? 'selected' : ''}>Monday</option><option value="0" ${st.weekStart === 0 ? 'selected' : ''}>Sunday</option></select></label>
            <label class="field"><span>Time format</span><select name="settings.timeFormat"><option value="12" ${st.timeFormat === '12' ? 'selected' : ''}>12-hour (3pm)</option><option value="24" ${st.timeFormat === '24' ? 'selected' : ''}>24-hour (15:00)</option></select></label>
            <label class="field"><span>Default category</span><select name="settings.defaultCategory">${s.categories.map((c) => `<option value="${c.id}" ${st.defaultCategory === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            <label class="field"><span>Daily goal (tasks)</span><input type="number" min="1" max="50" name="settings.dailyGoal" value="${st.dailyGoal}"></label>
            <label class="field"><span>Day starts</span><input type="time" name="settings.workdayStart" value="${st.workdayStart}"></label>
            <label class="field"><span>Day ends</span><input type="time" name="settings.workdayEnd" value="${st.workdayEnd}"></label>
          </div>
          <button type="button" class="btn btn-soft small" data-categories>${icon('tags')}Manage categories</button>
        </section>

        <section class="card">
          <h2 class="card-title">${icon('bell')}Notifications & reminders</h2>
          <p class="muted small">Reminders appear inside TaskZen while it’s open in a tab. TaskZen is hosted as a static site, so reminders can’t arrive when the browser tab is closed.</p>
          ${toggle('settings.notifications.browser', n.browser && perm === 'granted', 'Browser notifications', perm === 'denied' ? 'Blocked in your browser settings' : perm === 'unsupported' ? 'Not supported in this browser' : 'Also show system notifications')}
          ${toggle('settings.notifications.deadline', n.deadline, 'Upcoming deadlines')}
          <label class="field inline"><span>Remind me</span><select name="settings.notifications.leadMinutes">${[5, 10, 15, 30, 60].map((m) => `<option value="${m}" ${n.leadMinutes === m ? 'selected' : ''}>${m} min before</option>`).join('')}</select></label>
          ${toggle('settings.notifications.overdue', n.overdue, 'Overdue tasks')}
          ${toggle('settings.notifications.habit', n.habit, 'Habit reminders')}
          <label class="field inline"><span>Habit reminder at</span><input type="time" name="settings.notifications.habitTime" value="${n.habitTime}"></label>
          ${toggle('settings.notifications.planning', n.planning, 'Daily planning reminder')}
          <label class="field inline"><span>Planning reminder at</span><input type="time" name="settings.notifications.planningTime" value="${n.planningTime}"></label>
          ${toggle('settings.notifications.focus', n.focus, 'Focus session complete')}
          ${toggle('settings.notifications.weekly', n.weekly, 'Weekly summary')}
        </section>

        <section class="card span-all">
          <h2 class="card-title">${icon('database')}Your data</h2>
          <p class="muted small">Using ${(bytes / 1024).toFixed(1)} KB of browser storage. Export regularly — clearing your browser data deletes everything.</p>
          <div class="row wrap">
            <button type="button" class="btn btn-primary" data-export>${icon('download')}Export backup</button>
            <label class="btn btn-soft">${icon('upload')}Import backup<input type="file" accept="application/json,.json" id="import-file" class="sr-only"></label>
            ${hasBackup() ? `<button type="button" class="btn btn-ghost" data-restore>${icon('history')}Undo last import/reset</button>` : ''}
            <span class="grow"></span>
            <button type="button" class="btn btn-ghost danger-text" data-reset>${icon('trash-2')}Reset all data</button>
          </div>
          <p class="muted small">Cloud accounts and cross-device sync aren’t set up yet — your data stays on this device.</p>
        </section>
      </div>`;

    const setPath = (obj, path, value) => {
      const keys = path.split('.');
      const last = keys.pop();
      keys.reduce((o, k) => o[k], obj)[last] = value;
    };

    root.addEventListener('change', async (e) => {
      const el = e.target;
      if (el.id === 'avatar-file') {
        const file = el.files[0];
        if (!file) return;
        try {
          const data = await resizeImage(file);
          update((x) => (x.profile.avatarImage = data));
        } catch {
          toast('Couldn’t read that image', { tone: 'warn', iconName: 'alert-circle' });
        }
        return;
      }
      if (el.id === 'import-file') {
        const file = el.files[0];
        if (!file) return;
        const ok = await confirmDialog({ title: 'Import this backup?', message: 'Your current data will be replaced. A copy of it is kept so you can switch back with “Undo last import/reset”.', confirmText: 'Import' });
        if (!ok) return (el.value = '');
        try {
          importData(await file.text());
          refreshDurations();
          toast('Backup imported', { iconName: 'check', tone: 'success' });
        } catch (err) {
          toast(err.message, { tone: 'warn', iconName: 'alert-circle', timeout: 7000 });
        }
        return;
      }
      if (!el.name) return;
      let value = el.type === 'checkbox' ? el.checked : el.value;
      if (el.name === 'settings.weekStart' || el.name === 'settings.dailyGoal' || el.name === 'settings.notifications.leadMinutes') value = Math.max(0, Number(value) || 0);
      if (el.name === 'settings.dailyGoal') value = Math.min(50, Math.max(1, value));
      if (el.name === 'profile.name') value = String(value).trim();
      if (el.type === 'time' && !value) return;
      if (el.name === 'settings.notifications.browser' && value) {
        if (perm === 'unsupported' || perm === 'denied') {
          el.checked = false;
          return toast('Your browser isn’t allowing notifications for this site', { iconName: 'bell-off', tone: 'warn' });
        }
        if (Notification.permission !== 'granted') {
          const p = await Notification.requestPermission();
          if (p !== 'granted') {
            el.checked = false;
            return toast('Notifications were not allowed', { iconName: 'bell-off' });
          }
        }
      }
      update((x) => setPath(x, el.name, value));
    });

    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-avatar],[data-export],[data-reset],[data-restore],[data-categories]');
      if (!el) return;
      if (el.dataset.avatar) update((x) => Object.assign(x.profile, { avatar: el.dataset.avatar, avatarImage: null }));
      if (el.dataset.categories !== undefined) openCategoryManager();
      if (el.dataset.export !== undefined) {
        download(`taskzen-backup-${todayKey()}.json`, exportData());
        update((x) => (x.meta.lastBackupAt = Date.now()), { silent: true });
        toast('Backup downloaded', { iconName: 'download', tone: 'success' });
      }
      if (el.dataset.restore !== undefined) {
        const ok = await confirmDialog({ title: 'Switch back to the previous data?', message: 'This swaps your current data with the copy saved before your last import or reset.', confirmText: 'Switch back' });
        if (ok && restoreBackup()) toast('Previous data restored', { iconName: 'history', tone: 'success' });
      }
      if (el.dataset.reset !== undefined) {
        const ok = await confirmDialog({ title: 'Reset everything?', message: 'All tasks, habits, focus history, XP and your garden will be cleared. A single safety copy is kept so you can switch back.', confirmText: 'Reset all data', danger: true });
        if (ok) {
          resetAll();
          toast('All data reset', { iconName: 'trash-2' });
        }
      }
    });
  },
};
