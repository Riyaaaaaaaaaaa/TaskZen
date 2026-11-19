// Small DOM helpers: icons, toasts, modals, confirmation dialogs, confetti.
import { esc } from '../core/utils.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const icon = (name, cls = '') => `<i data-lucide="${name}" class="ic ${cls}" aria-hidden="true"></i>`;

export function refreshIcons(root = document) {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({ attrs: { 'stroke-width': 2 }, root });
  }
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- toasts ----------

export function toast(message, { actionLabel, onAction, iconName = 'sparkles', tone = 'default', timeout = 4500 } = {}) {
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(iconName)}<span class="toast-msg">${esc(message)}</span>${
    actionLabel ? `<button class="toast-action" type="button">${esc(actionLabel)}</button>` : ''
  }<button class="toast-close" type="button" aria-label="Dismiss">${icon('x')}</button>`;
  root.appendChild(el);
  refreshIcons(el);
  const close = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.toast-close').onclick = close;
  if (actionLabel) {
    el.querySelector('.toast-action').onclick = () => {
      onAction?.();
      close();
    };
  }
  setTimeout(close, timeout);
  // keep at most 4 toasts on screen
  const all = $$('.toast', root);
  if (all.length > 4) all[0].remove();
  return close;
}

// ---------- modals ----------

let openCount = 0;

/**
 * @param {{ title: string, body: string, wide?: boolean, onMount?: (el: HTMLElement, close: () => void) => void, onClose?: () => void }} o
 */
export function openModal({ title, body, wide = false, onMount, onClose, className = '' }) {
  const previous = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''} ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title-${openCount}">
    <header class="modal-head"><h2 id="modal-title-${openCount}">${esc(title)}</h2>
    <button class="icon-btn" data-close type="button" aria-label="Close">${icon('x')}</button></header>
    <div class="modal-body">${body}</div></div>`;
  openCount++;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  refreshIcons(wrap);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.add('leaving');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      wrap.remove();
      if (!$('.modal-backdrop')) document.body.classList.remove('no-scroll');
    }, 160);
    onClose?.();
    previous?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && wrap === $$('.modal-backdrop').pop()) close();
    if (e.key === 'Tab') trapFocus(e, wrap);
  };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });
  $$('[data-close]', wrap).forEach((b) => (b.onclick = close));
  onMount?.(wrap.querySelector('.modal'), close);
  const first =
    wrap.querySelector('[autofocus]') ||
    wrap.querySelector('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select') ||
    wrap.querySelector('button:not([data-close])');
  setTimeout(() => first?.focus(), 30);
  return close;
}

function trapFocus(e, root) {
  const f = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', root).filter(
    (x) => x.offsetParent !== null,
  );
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

export function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      body: `<p class="muted">${esc(message)}</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close type="button">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok type="button">${esc(confirmText)}</button></div>`,
      onMount: (el, close) => {
        el.querySelector('[data-ok]').onclick = () => {
          answered = true;
          resolve(true);
          close();
        };
        setTimeout(() => el.querySelector('[data-ok]').focus(), 40);
      },
      onClose: () => !answered && resolve(false),
    });
  });
}

// ---------- celebration ----------

export function confetti({ count = 120, duration = 2200 } = {}) {
  if (reducedMotion()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = window.devicePixelRatio || 1;
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const colors = ['#7C5CFF', '#FF9F7A', '#3CC9A0', '#4BA9FF', '#F5B83D', '#FF6FA8'];
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: innerHeight / 3,
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -12 - 4,
    r: Math.random() * 6 + 4,
    rot: Math.random() * 6,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[(Math.random() * colors.length) | 0],
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));
  const start = performance.now();
  (function frame(t) {
    const p = (t - start) / duration;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const q of parts) {
      q.vy += 0.35;
      q.vx *= 0.99;
      q.x += q.vx;
      q.y += q.vy;
      q.rot += q.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - p);
      g.translate(q.x, q.y);
      g.rotate(q.rot);
      g.fillStyle = q.color;
      if (q.shape === 'rect') g.fillRect(-q.r / 2, -q.r / 4, q.r, q.r / 2);
      else {
        g.beginPath();
        g.arc(0, 0, q.r / 2.5, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    if (p < 1) requestAnimationFrame(frame);
    else c.remove();
  })(start);
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}
