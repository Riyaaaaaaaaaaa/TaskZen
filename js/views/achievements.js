import { getState } from '../core/store.js';
import { ACHIEVEMENTS, achievementProgress, achievementStats, bestStreak, dailyChallenges, energyBalance, LEVELS, levelInfo, productivityStreak, totalXP, XP } from '../core/gamification.js';
import { esc, formatDate, todayKey, toDateKey } from '../core/utils.js';
import { icon } from '../ui/dom.js';
import { progressRing } from '../ui/components.js';

export default {
  id: 'achievements',
  title: 'Achievements',
  subtitle: 'Celebrate your wins',
  icon: 'trophy',
  color: 'yellow',

  render(root) {
    const s = getState();
    const xp = totalXP(s);
    const lvl = levelInfo(xp);
    const stats = achievementStats(s);
    const unlocked = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
    const streak = productivityStreak(s).length;
    const ledger = [...s.xp].sort((a, b) => b.ts - a.ts).slice(0, 15);

    root.innerHTML = `
      <header class="page-head"><div><h1>Achievements</h1><p class="muted">XP is only earned for real completed activity — never for creating or deleting things.</p></div></header>
      <section class="card level-hero">
        ${progressRing(lvl.progress, { size: 140, label: `Lv ${lvl.level}`, sub: lvl.next ? `${Math.round(lvl.progress * 100)}%` : 'Max' })}
        <div class="grow">
          <p class="eyebrow">Current level</p>
          <h2>${lvl.name}</h2>
          <p class="muted">${xp} XP total${lvl.next ? ` · ${lvl.toNext} XP to <strong>${lvl.next.name}</strong>` : ' · You’ve reached the top level!'}</p>
          <ol class="level-track">${LEVELS.map((l) => `<li class="${l.level <= lvl.level ? 'reached' : ''}"><span>${l.level}</span><small>${l.name}</small></li>`).join('')}</ol>
        </div>
        <div class="level-side">
          <div><span class="big-num">${icon('flame')}${streak}</span><span class="muted small">day streak (best ${bestStreak(s)})</span></div>
          <div><span class="big-num">${icon('zap')}${energyBalance(s).balance}</span><span class="muted small">garden energy</span></div>
          <div><span class="big-num">${unlocked}/${ACHIEVEMENTS.length}</span><span class="muted small">badges</span></div>
        </div>
      </section>

      <h2 class="section-title">Badges</h2>
      <div class="badge-grid">${ACHIEVEMENTS.map((a) => {
        const at = s.achievements[a.id];
        const p = achievementProgress(a.id, stats);
        return `<article class="badge-card ${at ? 'unlocked' : 'locked'} c-${a.color}">
          <span class="badge-medal">${icon(at ? a.icon : 'lock')}</span>
          <h3>${esc(a.name)}</h3><p class="muted small">${esc(a.desc)}</p>
          ${at ? `<span class="small unlocked-on">${icon('check')}Unlocked ${formatDate(toDateKey(new Date(at)))}</span>`
            : `<div class="mini-progress"><span style="width:${(p.value / p.target) * 100}%"></span></div><span class="muted small">${p.value}/${p.target}</span>`}
        </article>`;
      }).join('')}</div>

      <div class="two-col">
        <section class="card">
          <h2 class="card-title">${icon('medal')}Today’s challenges</h2>
          <ul class="challenges">${dailyChallenges(s, todayKey()).map((c) => `<li class="${c.done ? 'done' : ''}"><span class="chal-ic">${icon(c.done ? 'check' : c.icon)}</span>
            <span class="grow">${esc(c.label)}</span><span class="muted small">${c.progress}/${c.target} · +${XP.challenge} XP</span></li>`).join('')}</ul>
          <h3 class="section-title small-title">How to earn XP</h3>
          <table class="xp-table"><tbody>
            <tr><td>Complete a task</td><td>${XP.task} XP</td></tr>
            <tr><td>High-priority or urgent bonus</td><td>+${XP.highPriorityBonus} XP</td></tr>
            <tr><td>Complete a habit</td><td>${XP.habit} XP</td></tr>
            <tr><td>Finish a focus session</td><td>${XP.focus} XP</td></tr>
            <tr><td>Complete every task due today</td><td>${XP.allDaily} XP</td></tr>
            <tr><td>Each 7 days of streak</td><td>${XP.streak7} XP</td></tr>
            <tr><td>Daily challenge</td><td>${XP.challenge} XP</td></tr>
          </tbody></table>
          <p class="muted small">Limits: up to 30 rewarded tasks and 12 rewarded focus sessions per day. Un-completing or deleting a task removes its XP.</p>
        </section>
        <section class="card">
          <h2 class="card-title">${icon('history')}Recent XP</h2>
          ${ledger.length ? `<ul class="ledger">${ledger.map((e) => `<li><span class="grow">${esc(e.label || e.activity)}</span><span class="muted small">${new Date(e.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><strong class="xp-plus">+${e.xp}</strong></li>`).join('')}</ul>`
            : '<p class="muted">Complete a task, habit or focus session to earn your first XP.</p>'}
        </section>
      </div>`;
  },
};
