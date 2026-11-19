import { getState, update } from '../core/store.js';
import * as F from '../core/focus.js';
import { AMBIENT, currentAmbient, playAmbient, setVolume, stopAmbient } from '../core/sound.js';
import { activeTasks, getTask } from '../core/tasks.js';
import { esc, formatMinutes, toDateKey, todayKey, weekDays } from '../core/utils.js';
import { $, icon, refreshIcons, toast } from '../ui/dom.js';
import { toggleTask } from '../ui/actions.js';

const RING = 2 * Math.PI * 130;
let unsub = null;
let settingsOpen = false;

const fmt = (ms) => {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function paint(root, t) {
  const time = root.querySelector('[data-time]');
  if (!time) return;
  time.textContent = fmt(t.remainingMs);
  root.querySelector('[data-arc]').style.strokeDashoffset = String(RING * (1 - (t.totalMs - t.remainingMs) / t.totalMs));
  const btn = root.querySelector('[data-toggle]');
  const label = t.running ? 'Pause' : t.startedAt ? 'Resume' : 'Start';
  if (btn.dataset.state !== label) {
    btn.dataset.state = label;
    btn.innerHTML = `${icon(t.running ? 'pause' : 'play')}${label}`;
    refreshIcons();
  }
  root.querySelector('.timer-wrap').classList.toggle('running', t.running);
  document.title = t.running ? `${fmt(t.remainingMs)} · ${F.MODE_LABEL[t.mode]} · TaskZen` : 'Focus Mode · TaskZen ✿';
}

export default {
  id: 'focus',
  title: 'Focus Mode',
  subtitle: 'Deep work sessions',
  icon: 'timer',
  color: 'pink',

  destroy() {
    unsub?.();
    unsub = null;
    document.body.classList.remove('zen');
  },

  render(root, ctx) {
    const s = getState();
    const fs = s.settings.focus;
    const pre = ctx.params.get('task');
    if (pre) {
      if (getTask(s, pre)) F.setTask(pre);
      history.replaceState(null, '', '#/focus'); // apply once; later choices win
    }
    const t = F.getTimer();
    const today = todayKey();
    const work = s.focusSessions.filter((x) => x.mode === 'work');
    const week = new Set(weekDays(today, s.settings.weekStart));
    const todayMin = work.filter((x) => toDateKey(new Date(x.endedAt)) === today).reduce((n, x) => n + x.actualMin, 0);
    const weekMin = work.filter((x) => week.has(toDateKey(new Date(x.endedAt)))).reduce((n, x) => n + x.actualMin, 0);
    const allMin = work.reduce((n, x) => n + x.actualMin, 0);
    const open = activeTasks(s).filter((x) => x.status !== 'done');
    const task = t.taskId ? getTask(s, t.taskId) : null;
    const history = [...work].sort((a, b) => b.endedAt - a.endedAt).slice(0, 12);
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const amb = currentAmbient();

    root.innerHTML = `
      <header class="page-head">
        <div><h1>Focus Mode</h1><p class="muted">Pomodoro sessions: ${fs.work} min focus, ${fs.short} min break, a ${fs.long}-minute break every ${fs.longEvery} sessions. Each finished session earns 15 XP.</p></div>
        <div class="page-actions"><button class="btn btn-soft" type="button" data-zen>${icon('maximize')}Zen mode</button></div>
      </header>
      <div class="focus-layout">
        <section class="card focus-stage mode-${t.mode}" id="focus-stage">
          <div class="tabs center" role="tablist" aria-label="Timer mode">
            ${['work', 'short', 'long'].map((m) => `<button role="tab" type="button" class="tab ${t.mode === m ? 'active' : ''}" aria-selected="${t.mode === m}" data-mode="${m}">${F.MODE_LABEL[m]}</button>`).join('')}
          </div>
          <div class="timer-wrap">
            <svg viewBox="0 0 300 300" class="timer-svg" aria-hidden="true">
              <circle cx="150" cy="150" r="130" class="ring-track" stroke-width="14" fill="none"/>
              <circle cx="150" cy="150" r="130" class="ring-value" data-arc stroke-width="14" fill="none" stroke-linecap="round"
                stroke-dasharray="${RING}" stroke-dashoffset="${RING}" transform="rotate(-90 150 150)"/>
            </svg>
            <div class="timer-center">
              <span class="timer-mode">${F.MODE_LABEL[t.mode]}</span>
              <span class="timer-time" data-time role="timer" aria-live="off">${fmt(t.remainingMs)}</span>
              <span class="timer-task">${task ? esc(task.title) : 'No task selected'}</span>
            </div>
          </div>
          <div class="cycle-dots" aria-label="Session ${(t.cycle % fs.longEvery) + 1} of ${fs.longEvery} before a long break">
            ${Array.from({ length: fs.longEvery }, (_, i) => `<span class="${i < t.cycle % fs.longEvery ? 'on' : ''}"></span>`).join('')}</div>
          <div class="timer-controls">
            <button class="btn btn-ghost" type="button" data-reset aria-label="Reset timer">${icon('rotate-ccw')}Reset</button>
            <button class="btn btn-primary btn-lg" type="button" data-toggle>${icon('play')}Start</button>
            <button class="btn btn-ghost" type="button" data-skip aria-label="Skip to next phase">${icon('skip-forward')}Skip</button>
          </div>
          <button class="btn btn-ghost small zen-exit" type="button" data-zen>${icon('minimize')}Exit Zen mode</button>
        </section>

        <aside class="focus-side">
          <section class="card">
            <h2 class="card-title">${icon('crosshair')}Focusing on</h2>
            <select id="focus-task" aria-label="Task to focus on"><option value="">— Just focus (no task) —</option>
              ${open.map((x) => `<option value="${x.id}" ${x.id === t.taskId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
            ${task ? `<button class="btn btn-soft small block" type="button" data-done>${icon('check')}Mark “${esc(task.title)}” done</button>` : ''}
          </section>
          <section class="card">
            <h2 class="card-title">${icon('headphones')}Ambient sound</h2>
            <div class="sound-grid">${AMBIENT.map((a) => `<button type="button" class="pill ${amb === a.id ? 'active' : ''}" data-sound="${a.id}" aria-pressed="${amb === a.id}">${icon(a.icon)}${a.label}</button>`).join('')}</div>
            <label class="field"><span>Volume</span><input type="range" id="focus-vol" min="0" max="1" step="0.05" value="${fs.volume}"></label>
          </section>
          <section class="card stats-mini">
            <div><span class="big-num">${formatMinutes(todayMin)}</span><span class="muted small">today</span></div>
            <div><span class="big-num">${formatMinutes(weekMin)}</span><span class="muted small">this week</span></div>
            <div><span class="big-num">${formatMinutes(allMin)}</span><span class="muted small">all time</span></div>
          </section>
          <details class="card" id="focus-settings-box" ${settingsOpen ? 'open' : ''}>
            <summary class="card-title">${icon('sliders-horizontal')}Timer settings</summary>
            <form id="focus-settings" class="form-grid">
              <label class="field"><span>Focus (min)</span><input type="number" name="work" min="1" max="180" value="${fs.work}"></label>
              <label class="field"><span>Short break</span><input type="number" name="short" min="1" max="60" value="${fs.short}"></label>
              <label class="field"><span>Long break</span><input type="number" name="long" min="1" max="90" value="${fs.long}"></label>
              <label class="field"><span>Long break every</span><input type="number" name="longEvery" min="2" max="10" value="${fs.longEvery}"></label>
              <label class="check-field span-2"><input type="checkbox" name="autoStartBreaks" ${fs.autoStartBreaks ? 'checked' : ''}> Start breaks automatically</label>
              <label class="check-field span-2"><input type="checkbox" name="notify" ${s.settings.notifications.focus ? 'checked' : ''}> Chime and notify when a session ends</label>
            </form>
            ${perm === 'default' ? `<button type="button" class="btn btn-soft small" data-perm>${icon('bell')}Allow browser notifications</button>` : ''}
            ${perm === 'denied' ? '<p class="muted small">Browser notifications are blocked for this site; in-app alerts still work.</p>' : ''}
          </details>
        </aside>

        <section class="card span-all">
          <h2 class="card-title">${icon('history')}Session history</h2>
          ${history.length ? `<ul class="history">${history.map((x) => {
            const tk = x.taskId && getTask(s, x.taskId);
            return `<li><span class="badge ${x.completed ? 'badge-mint' : 'badge-peach'}">${x.completed ? 'Completed' : 'Partial'}</span>
              <span class="grow">${tk ? esc(tk.title) : '<span class="muted">Free focus</span>'}</span>
              <span class="muted small">${formatMinutes(x.actualMin)} · ${new Date(x.endedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span></li>`;
          }).join('')}</ul>` : '<p class="muted">No sessions yet. Press Start to begin your first one.</p>'}
        </section>
      </div>`;

    unsub?.();
    unsub = F.onTimer((tm) => paint(root, tm));
    requestAnimationFrame(() => paint(root, F.getTimer()));

    root.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-mode],[data-toggle],[data-reset],[data-skip],[data-zen],[data-sound],[data-done],[data-perm]');
      if (!el) return;
      const tm = F.getTimer();
      if (el.dataset.mode) {
        if (tm.startedAt && tm.mode === 'work' && !confirm('Switching modes ends the current session. Continue?')) return;
        F.setMode(el.dataset.mode);
        ctx.rerender();
      }
      if (el.dataset.toggle !== undefined) (tm.running ? F.pause() : F.start());
      if (el.dataset.reset !== undefined) {
        F.reset();
        ctx.rerender();
      }
      if (el.dataset.skip !== undefined) {
        F.skip();
        ctx.rerender();
      }
      if (el.dataset.zen !== undefined) {
        const on = document.body.classList.toggle('zen');
        try {
          if (on && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
          else if (!on && document.fullscreenElement) await document.exitFullscreen();
        } catch {
          /* fullscreen not allowed: the in-page zen layout still applies */
        }
      }
      if (el.dataset.sound) {
        if (el.dataset.sound === 'none') stopAmbient();
        else playAmbient(el.dataset.sound, getState().settings.focus.volume);
        update((st) => (st.settings.focus.sound = el.dataset.sound), { silent: true });
        ctx.rerender();
      }
      if (el.dataset.done !== undefined && tm.taskId) {
        toggleTask(tm.taskId);
        F.setTask(null);
      }
      if (el.dataset.perm !== undefined) {
        const p = await Notification.requestPermission();
        if (p === 'granted') update((st) => (st.settings.notifications.browser = true));
        toast(p === 'granted' ? 'Browser notifications on' : 'Notifications were not allowed', { iconName: 'bell' });
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) document.body.classList.remove('zen');
    }, { once: true });

    $('#focus-task', root).addEventListener('change', (e) => {
      F.setTask(e.target.value || null);
      ctx.rerender();
    });
    $('#focus-settings-box', root).addEventListener('toggle', (e) => (settingsOpen = e.target.open));
    $('#focus-vol', root).addEventListener('input', (e) => {
      setVolume(Number(e.target.value));
      update((st) => (st.settings.focus.volume = Number(e.target.value)), { silent: true });
    });
    $('#focus-settings', root).addEventListener('change', (e) => {
      const f = new FormData(e.currentTarget);
      const clampN = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number(v) || d));
      update((st) => {
        Object.assign(st.settings.focus, {
          work: clampN(f.get('work'), 1, 180, 25),
          short: clampN(f.get('short'), 1, 60, 5),
          long: clampN(f.get('long'), 1, 90, 15),
          longEvery: clampN(f.get('longEvery'), 2, 10, 4),
          autoStartBreaks: f.get('autoStartBreaks') === 'on',
        });
        st.settings.notifications.focus = f.get('notify') === 'on';
      });
      F.refreshDurations();
      toast('Timer settings saved', { iconName: 'check', timeout: 2000 });
    });
  },
};
