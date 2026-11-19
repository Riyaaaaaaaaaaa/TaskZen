// TaskZen 2.0 entry point: store setup, hash router, shell, reminders.
import { addMiddleware, getState, initStore, subscribe, update } from './core/store.js';
import { energyBalance, evaluate, levelInfo, totalXP } from './core/gamification.js';
import { dueReminders } from './core/reminders.js';
import * as focus from './core/focus.js';
import { chime } from './core/sound.js';
import { $, confetti, icon, refreshIcons, toast } from './ui/dom.js';
import { avatarHTML } from './ui/components.js';
import { closeTaskPanel, isPanelOpen } from './ui/taskEditor.js';
import { quickAdd } from './ui/actions.js';

import dashboard from './views/dashboard.js';
import tasks from './views/tasks.js';
import calendar from './views/calendar.js';
import kanban from './views/kanban.js';
import habits from './views/habits.js';
import focusView from './views/focus.js';
import achievements from './views/achievements.js';
import insights from './views/insights.js';
import garden from './views/garden.js';
import settings from './views/settings.js';

const VIEWS = [dashboard, tasks, calendar, kanban, habits, focusView, achievements, insights, garden, settings];
const byId = Object.fromEntries(VIEWS.map((v) => [v.id, v]));

let current = null;
let currentParams = new URLSearchParams();

// ---------- boot ----------

initStore();
addMiddleware({
  before: (s) => totalXP(s),
  after: (s, xpBefore) => evaluate(s, Date.now(), xpBefore),
});
focus.initFocus();

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return { id: byId[path] ? path : 'dashboard', params: new URLSearchParams(query || '') };
}

function renderNav() {
  $('#nav').innerHTML = VIEWS.map(
    (v) => `<li><a href="#/${v.id}" class="nav-link ${current?.id === v.id ? 'active' : ''}" ${current?.id === v.id ? 'aria-current="page"' : ''}>
      <span class="nav-ic nav-${v.color}">${icon(v.icon)}</span><span><strong>${v.title}</strong><small>${v.subtitle}</small></span></a></li>`,
  ).join('');
  const s = getState();
  const lvl = levelInfo(totalXP(s));
  const energy = energyBalance(s).balance;
  $('#sidebar-level').innerHTML = `<a href="#/achievements" class="level-card">
      <div class="level-top"><span class="level-badge">Lv ${lvl.level}</span><strong>${lvl.name}</strong></div>
      <div class="xp-bar" role="progressbar" aria-valuenow="${Math.round(lvl.progress * 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progress to next level"><span style="width:${lvl.progress * 100}%"></span></div>
      <div class="level-meta"><span>${lvl.xp} XP${lvl.next ? ` · ${lvl.toNext} to go` : ''}</span><span title="Garden energy">${icon('zap')}${energy}</span></div>
    </a>`;
  $('#profile-btn').innerHTML = avatarHTML(s.profile, 36);
}

function render(entering = false) {
  const view = byId[parseHash().id];
  const root = $('#view');
  const active = document.activeElement;
  const restoreId = root.contains(active) && active.id ? active.id : null;
  const sel = restoreId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = window.scrollY;
  current?.destroy?.();
  current = view;
  const page = document.createElement('div');
  page.className = `page page-${view.id}${entering ? ' page-enter' : ''}`;
  view.render(page, { params: currentParams, rerender: () => render() });
  root.replaceChildren(page);
  renderNav();
  refreshIcons();
  window.scrollTo(0, scroll);
  if (restoreId) {
    const el = document.getElementById(restoreId);
    if (el) {
      el.focus();
      if (sel) try { el.setSelectionRange(...sel); } catch { /* not a text input */ }
    }
  }
}

function navigate() {
  const { id, params } = parseHash();
  const changed = current?.id !== id;
  currentParams = params;
  if (changed) {
    current?.destroy?.();
    current = null;
    window.scrollTo(0, 0);
  }
  document.body.classList.remove('nav-open');
  $('#menu-btn').setAttribute('aria-expanded', 'false');
  if (isPanelOpen() && changed) closeTaskPanel();
  render(changed);
  document.title = `${byId[id].title} · TaskZen ✿`;
  if (changed) $('#view').focus({ preventScroll: true });
}

// ---------- theme ----------

const media = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const pref = getState().settings.theme;
  const theme = pref === 'system' ? (media.matches ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = theme;
  $('#theme-btn').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  $('#theme-btn').setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  refreshIcons();
}
media.addEventListener('change', applyTheme);
$('#theme-btn').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  update((s) => (s.settings.theme = dark ? 'light' : 'dark'));
});

// ---------- celebrations ----------

function celebrate(events = []) {
  const s = getState();
  for (const e of events) {
    if (e.type === 'achievement') {
      toast(`Achievement unlocked: ${e.achievement.name}!`, { iconName: 'trophy', tone: 'success', timeout: 6000 });
      if (s.settings.celebrate) confetti({ count: 90 });
    }
    if (e.type === 'levelUp') {
      toast(`Level up! You’re now Level ${e.level.level}: ${e.level.name}`, { iconName: 'star', tone: 'success', timeout: 7000 });
      if (s.settings.celebrate) confetti({ count: 180 });
    }
    if (e.type === 'allDaily') {
      toast('Everything due today is done. Take a bow! +30 XP', { iconName: 'party-popper', tone: 'success', timeout: 6000 });
      if (s.settings.celebrate) confetti();
    }
    if (e.type === 'streak') toast(`${e.days}-day streak! +50 XP`, { iconName: 'flame', tone: 'success' });
    if (e.type === 'challenge') toast(`Daily challenge complete: ${e.label} · +20 XP`, { iconName: 'medal', tone: 'success' });
  }
}

subscribe((state, info) => {
  applyTheme();
  render();
  renderFocusPill();
  celebrate(info?.events);
});

// ---------- topbar ----------

$('#topbar-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#topbar-add-input');
  if (quickAdd(input.value)) input.value = '';
});

$('#menu-btn').addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  $('#menu-btn').setAttribute('aria-expanded', String(open));
});
$('#sidebar-scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
$('#drawer-backdrop').addEventListener('click', closeTaskPanel);

document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (e.key === 'Escape' && isPanelOpen() && !document.querySelector('.modal-backdrop')) closeTaskPanel();
  if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'n' || e.key === 'N') && !document.querySelector('.modal-backdrop')) {
    e.preventDefault();
    $('#topbar-add-input').focus();
  }
});

// focus timer pill in the top bar (visible on every page while a timer runs)
function renderFocusPill(t = focus.getTimer()) {
  const pill = $('#focus-pill');
  const show = t.running || (t.startedAt && t.remainingMs > 0);
  pill.hidden = !show || current?.id === 'focus';
  if (pill.hidden) return;
  const m = Math.floor(t.remainingMs / 60000);
  const sec = Math.floor((t.remainingMs % 60000) / 1000);
  pill.className = `focus-pill mode-${t.mode} ${t.running ? '' : 'paused'}`;
  pill.innerHTML = `${icon(t.running ? 'timer' : 'pause')}<span>${focus.MODE_LABEL[t.mode]} ${m}:${String(sec).padStart(2, '0')}</span>`;
  refreshIcons();
}
focus.onTimer(renderFocusPill);

focus.onComplete((finished, next) => {
  const s = getState();
  if (s.settings.notifications.focus) {
    chime();
    const msg = finished.mode === 'work' ? `Focus session complete! +15 XP. Time for a ${next.mode === 'long' ? 'long ' : ''}break.` : 'Break’s over — ready to focus again?';
    toast(msg, { iconName: 'timer', tone: 'success', timeout: 8000, actionLabel: 'Open timer', onAction: () => (location.hash = '#/focus') });
    browserNotify('TaskZen focus timer', msg);
  }
  renderFocusPill();
});

// ---------- reminders ----------

function browserNotify(title, body) {
  const s = getState();
  if (!s.settings.notifications.browser || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✿</text></svg>', tag: title });
    n.onclick = () => window.focus();
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

function checkReminders() {
  const s = getState();
  const due = dueReminders(s);
  if (!due.length) return;
  update(
    (st) => {
      for (const r of due) for (const k of [].concat(r.key)) st.notified[k] = Date.now();
      // keep the notified log from growing forever
      const keys = Object.keys(st.notified);
      if (keys.length > 600) keys.sort((a, b) => st.notified[a] - st.notified[b]).slice(0, keys.length - 500).forEach((k) => delete st.notified[k]);
    },
    { silent: true },
  );
  for (const r of due) {
    toast(`${r.title} — ${r.body}`, { iconName: 'bell', timeout: 9000, actionLabel: 'View', onAction: () => (location.hash = `#/${r.route}`) });
    browserNotify(r.title, r.body);
  }
}

window.addEventListener('hashchange', navigate);
applyTheme();
navigate();
renderFocusPill();
setTimeout(checkReminders, 2500);
setInterval(checkReminders, 30000);
// re-render once a minute so "overdue", greetings and dates stay current
setInterval(() => {
  if (!document.querySelector('.modal-backdrop') && !document.activeElement?.matches('input, textarea, select')) render();
}, 60000);

if (getState().meta.migratedFromV1 && !getState().meta.migrationNoticeShown) {
  setTimeout(() => {
    toast('Welcome to TaskZen 2.0! Your existing tasks and categories have been carried over.', { iconName: 'sparkles', tone: 'success', timeout: 9000 });
    update((s) => (s.meta.migrationNoticeShown = true), { silent: true });
  }, 600);
}
