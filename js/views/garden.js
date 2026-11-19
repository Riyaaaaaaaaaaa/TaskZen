import { getState, update } from '../core/store.js';
import { energyBalance, levelInfo, totalXP } from '../core/gamification.js';
import { expandGarden, expansionCost, GARDEN_ITEMS, itemDef, lushness, MAX_ROWS, moveItem, placeItem, REFUND_RATE, removeItem, SEASONS, setSeason } from '../core/garden.js';
import { esc, hashString } from '../core/utils.js';
import { icon, toast } from '../ui/dom.js';

const TILE = 64;
const ui = { tool: null, selected: null, moving: false };

const PALETTE = {
  spring: { grass: '#9BE3B0', grass2: '#7DD39A', leaf: '#4CB872', leaf2: '#3A9E5E', bloom: '#FF8FB8', sky: 'linear-gradient(180deg,#DDF2FF,#F3FFF6)' },
  summer: { grass: '#A6E07A', grass2: '#8CCF5E', leaf: '#3FA95A', leaf2: '#2F8C47', bloom: '#FFB347', sky: 'linear-gradient(180deg,#BFE6FF,#FFF7DA)' },
  autumn: { grass: '#E3CF8A', grass2: '#D4B96C', leaf: '#F08A3E', leaf2: '#D9652A', bloom: '#E85D5D', sky: 'linear-gradient(180deg,#FFE3C4,#FFF4E6)' },
  winter: { grass: '#E8F1F8', grass2: '#D3E3EF', leaf: '#5E9C83', leaf2: '#4A8270', bloom: '#C6D8FF', sky: 'linear-gradient(180deg,#DCE7F5,#F7FAFF)' },
  night: { grass: '#3E6B5A', grass2: '#345C4D', leaf: '#2E5E4B', leaf2: '#244C3D', bloom: '#C59BFF', sky: 'linear-gradient(180deg,#1B1838,#2C2A55)' },
};

function art(type, p, season) {
  const snow = season === 'winter';
  const cap = (cx, cy, r) => (snow ? `<ellipse cx="${cx}" cy="${cy - r * 0.55}" rx="${r * 0.8}" ry="${r * 0.35}" fill="#fff"/>` : '');
  switch (type) {
    case 'tulip':
      return `<path d="M32 52 V30" stroke="${p.leaf2}" stroke-width="3" stroke-linecap="round"/><path d="M32 46 q-12 -4 -12 -14 q10 2 12 12z" fill="${p.leaf}"/>
        <path d="M23 22 q0 12 9 12 q9 0 9 -12 l-4 4 -5 -7 -5 7z" fill="${season === 'night' ? '#E3A6FF' : '#FF6FA8'}"/>`;
    case 'daisy':
      return `<path d="M32 52 V32" stroke="${p.leaf2}" stroke-width="3" stroke-linecap="round"/>${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse cx="32" cy="22" rx="4" ry="8" fill="#fff" transform="rotate(${a} 32 28) translate(0 -2)"/>`).join('')}<circle cx="32" cy="28" r="5" fill="#F5B83D"/>`;
    case 'bush':
      return `<circle cx="22" cy="40" r="12" fill="${p.leaf2}"/><circle cx="42" cy="40" r="12" fill="${p.leaf2}"/><circle cx="32" cy="32" r="14" fill="${p.leaf}"/>${cap(32, 32, 14)}${season === 'spring' ? '<circle cx="26" cy="30" r="2.5" fill="#FF8FB8"/><circle cx="38" cy="36" r="2.5" fill="#FF8FB8"/>' : ''}`;
    case 'rock':
      return `<ellipse cx="32" cy="46" rx="18" ry="7" fill="#9AA3AF"/><ellipse cx="32" cy="38" rx="12" ry="6" fill="#B7BEC8"/><ellipse cx="32" cy="31" rx="7" ry="4" fill="#CDD3DB"/>`;
    case 'mushroom':
      return `<rect x="28" y="34" width="8" height="16" rx="3" fill="#F6E7D3"/><path d="M16 36 q16 -24 32 0z" fill="#E85D5D"/><circle cx="26" cy="29" r="2.5" fill="#fff"/><circle cx="36" cy="27" r="2" fill="#fff"/><circle cx="32" cy="33" r="1.8" fill="#fff"/>`;
    case 'tree':
      return `<rect x="28" y="36" width="8" height="18" rx="2" fill="#9A6B4F"/><circle cx="22" cy="28" r="12" fill="${p.leaf2}"/><circle cx="42" cy="28" r="12" fill="${p.leaf2}"/><circle cx="32" cy="18" r="14" fill="${p.leaf}"/>${cap(32, 18, 14)}`;
    case 'pine':
      return `<rect x="29" y="44" width="6" height="10" fill="#8A5E44"/><path d="M32 6 L48 28 H16z" fill="${season === 'autumn' ? '#4E8F62' : p.leaf}"/><path d="M32 18 L52 44 H12z" fill="${season === 'autumn' ? '#3F7A52' : p.leaf2}"/>${snow ? '<path d="M32 6 L40 17 H24z" fill="#fff"/><path d="M32 18 L42 31 H22z" fill="#fff" opacity=".9"/>' : ''}`;
    case 'bench':
      return `<rect x="12" y="30" width="40" height="5" rx="2" fill="#B07A55"/><rect x="12" y="38" width="40" height="5" rx="2" fill="#C48B63"/><rect x="15" y="43" width="4" height="10" fill="#7A5038"/><rect x="45" y="43" width="4" height="10" fill="#7A5038"/>${snow ? '<rect x="12" y="36" width="40" height="3" rx="1.5" fill="#fff"/>' : ''}`;
    case 'lantern':
      return `<rect x="24" y="48" width="16" height="6" rx="2" fill="#8E96A3"/><rect x="29" y="34" width="6" height="14" fill="#A4ACB8"/><rect x="24" y="24" width="16" height="11" rx="2" fill="#B9C0CA"/>
        <rect x="28" y="27" width="8" height="6" rx="1" fill="${season === 'night' ? '#FFD86B' : '#6B7380'}"/>${season === 'night' ? '<circle cx="32" cy="30" r="14" fill="#FFD86B" opacity=".25"/>' : ''}<path d="M18 25 L32 14 L46 25z" fill="#8E96A3"/>${cap(32, 22, 12)}`;
    case 'pond':
      return `<ellipse cx="32" cy="38" rx="27" ry="17" fill="#7FB8C9"/><ellipse cx="32" cy="38" rx="23" ry="13" fill="${snow ? '#D6ECF5' : '#5AAFE0'}"/>
        ${snow ? '' : '<ellipse cx="25" cy="36" rx="5" ry="2.5" fill="#FF9F45"/><ellipse cx="39" cy="42" rx="4" ry="2" fill="#fff"/><path d="M38 42 l-3 -2 v4z" fill="#FF6A3D"/><circle cx="43" cy="33" r="3" fill="#6CC28A"/>'}
        <ellipse cx="28" cy="33" rx="7" ry="2" fill="#fff" opacity=".35"/>`;
    case 'sakura':
      return `<path d="M30 54 V34 l-8 -8 M32 38 l9 -10" stroke="#7A5038" stroke-width="5" stroke-linecap="round" fill="none"/>
        <circle cx="20" cy="24" r="11" fill="${snow ? '#F2F6FA' : '#FFB3CF'}"/><circle cx="42" cy="22" r="11" fill="${snow ? '#F2F6FA' : '#FFB3CF'}"/><circle cx="31" cy="15" r="12" fill="${snow ? '#fff' : '#FFC8DC'}"/>${season === 'autumn' ? '' : '<circle cx="24" cy="18" r="2" fill="#fff"/><circle cx="40" cy="24" r="2" fill="#fff"/>'}`;
    case 'gate':
      return `<rect x="16" y="20" width="5" height="34" fill="#D9473F"/><rect x="43" y="20" width="5" height="34" fill="#D9473F"/><rect x="8" y="12" width="48" height="6" rx="2" fill="#2E2A33"/><rect x="11" y="18" width="42" height="4" fill="#D9473F"/><rect x="12" y="27" width="40" height="4" fill="#D9473F"/>${cap(32, 14, 24)}`;
    default:
      return '';
  }
}

function tileGrass(x, y, p, lush) {
  const h = hashString(`${x},${y}`);
  const blades = [];
  for (let i = 0; i < lush * 2; i++) {
    const bx = 8 + ((h >> (i * 3)) % 48);
    const by = 14 + ((h >> (i * 2 + 1)) % 40);
    blades.push(`<path d="M${bx} ${by} l-2 -5 M${bx} ${by} l2 -6" stroke="${p.grass2}" stroke-width="1.6" stroke-linecap="round"/>`);
  }
  return blades.join('');
}

function particles(season, count) {
  const kind = { spring: 'petal', summer: 'sparkle', autumn: 'leaf', winter: 'snow', night: 'firefly' }[season];
  return Array.from({ length: count }, (_, i) => `<span class="particle ${kind}" style="left:${(i * 37) % 100}%;animation-delay:${(i * 0.7) % 6}s;animation-duration:${6 + (i % 5)}s"></span>`).join('');
}

export default {
  id: 'garden',
  title: 'Zen Garden',
  subtitle: 'Grow your virtual garden',
  icon: 'flower-2',
  color: 'mint',

  render(root, ctx) {
    const s = getState();
    const g = s.garden;
    const p = PALETTE[g.season] || PALETTE.spring;
    const lvl = levelInfo(totalXP(s)).level;
    const energy = energyBalance(s);
    const lush = lushness(s);
    const W = g.cols * TILE;
    const H = g.rows * TILE;
    const sel = ui.selected && g.items.find((i) => i.id === ui.selected);
    if (!sel) Object.assign(ui, { selected: null, moving: false });
    const occupied = new Set(g.items.map((i) => `${i.x},${i.y}`));

    const tiles = [];
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        const free = !occupied.has(`${x},${y}`);
        const target = free && (ui.tool || ui.moving);
        tiles.push(`<g transform="translate(${x * TILE} ${y * TILE})" class="tile ${target ? 'tile-target' : ''}" data-x="${x}" data-y="${y}" ${target ? `role="button" tabindex="0" aria-label="Place here, row ${y + 1} column ${x + 1}"` : ''}>
          <rect x="2" y="2" width="${TILE - 4}" height="${TILE - 4}" rx="14" fill="${(x + y) % 2 ? p.grass : p.grass2}" />${tileGrass(x, y, p, lush)}
          ${target ? `<rect x="6" y="6" width="${TILE - 12}" height="${TILE - 12}" rx="10" class="tile-hint"/>` : ''}</g>`);
      }
    }
    const items = [...g.items]
      .sort((a, b) => a.y - b.y)
      .map((i) => `<g transform="translate(${i.x * TILE} ${i.y * TILE})" class="g-item ${ui.selected === i.id ? 'selected' : ''}" data-item="${i.id}" role="button" tabindex="0" aria-label="${esc(itemDef(i.type).name)}">
        <ellipse cx="32" cy="54" rx="18" ry="5" fill="#000" opacity=".08"/>${art(i.type, p, g.season)}</g>`)
      .join('');

    const butterflies = g.items.length >= 6 && !['winter', 'night'].includes(g.season) && lush >= 1;

    root.innerHTML = `
      <header class="page-head">
        <div><h1>Zen Garden</h1><p class="muted">Every task and habit you complete earns garden energy (half its XP). Spend it to grow a garden that’s uniquely yours.</p></div>
        <div class="page-actions"><span class="energy-pill">${icon('zap')}<strong>${energy.balance}</strong> energy</span></div>
      </header>
      <div class="garden-layout">
        <section class="card garden-stage season-${g.season}">
          <div class="garden-sky" style="background:${p.sky}">
            <div class="particles" aria-hidden="true">${particles(g.season, g.season === 'night' ? 14 : 10)}${butterflies ? '<span class="butterfly">🦋</span><span class="butterfly b2">🦋</span>' : ''}</div>
            <svg class="garden-svg" viewBox="-8 -8 ${W + 16} ${H + 16}" role="group" aria-label="Your garden, ${g.items.length} items">
              <rect x="-8" y="-8" width="${W + 16}" height="${H + 16}" rx="26" fill="${p.grass2}" opacity=".6"/>
              ${tiles.join('')}${items}
            </svg>
          </div>
          <div class="garden-status" aria-live="polite">
            ${ui.tool ? `${icon('mouse-pointer-click')}Click an empty spot to plant a <strong>${esc(itemDef(ui.tool).name)}</strong> (${itemDef(ui.tool).cost} energy). <button class="btn btn-ghost small" data-cancel type="button">Cancel</button>`
              : ui.moving ? `${icon('move')}Click an empty spot to move it. <button class="btn btn-ghost small" data-cancel type="button">Cancel</button>`
              : sel ? `<strong>${esc(itemDef(sel.type).name)}</strong> <button class="btn btn-soft small" data-move type="button">${icon('move')}Move</button>
                  <button class="btn btn-ghost small danger-text" data-remove type="button">${icon('trash-2')}Remove (+${Math.floor(itemDef(sel.type).cost * REFUND_RATE)} energy)</button>
                  <button class="btn btn-ghost small" data-cancel type="button">Done</button>`
              : `${icon('info')}Pick something from the shop, or click an item in your garden to move or remove it.`}
          </div>
        </section>
        <aside class="garden-side">
          <section class="card">
            <h2 class="card-title">${icon('store')}Garden shop</h2>
            <div class="shop">${GARDEN_ITEMS.map((it) => {
              const locked = lvl < it.level;
              const poor = energy.balance < it.cost;
              return `<button type="button" class="shop-item ${ui.tool === it.type ? 'active' : ''}" data-tool="${it.type}" ${locked || poor ? 'aria-disabled="true"' : ''}
                title="${locked ? `Unlocks at level ${it.level}` : poor ? 'Not enough energy yet' : `Plant a ${it.name}`}">
                <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true" class="${locked ? 'locked' : ''}">${art(it.type, p, g.season)}</svg>
                <span class="shop-name">${esc(it.name)}</span>
                <span class="shop-cost ${poor && !locked ? 'poor' : ''}">${locked ? `${icon('lock')}Lv ${it.level}` : `${icon('zap')}${it.cost}`}</span></button>`;
            }).join('')}</div>
          </section>
          <section class="card">
            <h2 class="card-title">${icon('palette')}Season</h2>
            <div class="sound-grid">${SEASONS.map((x) => `<button type="button" class="pill ${g.season === x.id ? 'active' : ''}" data-season="${x.id}" ${lvl < x.level ? 'aria-disabled="true"' : ''} title="${lvl < x.level ? `Unlocks at level ${x.level}` : x.name}">${lvl < x.level ? icon('lock') : ''}${x.name}</button>`).join('')}</div>
          </section>
          <section class="card">
            <h2 class="card-title">${icon('expand')}Expand your garden</h2>
            <p class="muted small">${g.cols} × ${g.rows} plots · ${g.items.length} planted</p>
            ${g.rows < MAX_ROWS ? `<button type="button" class="btn btn-soft block" data-expand ${energy.balance < expansionCost(g.rows) ? 'aria-disabled="true"' : ''}>${icon('plus')}Add a row (${expansionCost(g.rows)} energy)</button>` : '<p class="muted small">Your garden is at its full size.</p>'}
            <p class="muted small">Lawn lushness grows with all the energy you’ve ever earned (${energy.earned}).</p>
          </section>
        </aside>
      </div>`;

    const act = (fn, ok) => {
      try {
        update(fn, { undo: 'Garden change' });
        if (ok) toast(ok, { iconName: 'sprout', tone: 'success', timeout: 2500 });
        return true;
      } catch (err) {
        toast(err.message, { iconName: 'alert-circle', tone: 'warn' });
        return false;
      }
    };

    const onTile = (el) => {
      const x = Number(el.dataset.x);
      const y = Number(el.dataset.y);
      if (ui.tool) {
        const def = itemDef(ui.tool);
        if (act((st) => placeItem(st, ui.tool, x, y), `Planted a ${def.name}`) && energyBalance(getState()).balance < def.cost) ui.tool = null;
        ctx.rerender();
      } else if (ui.moving && ui.selected) {
        if (act((st) => moveItem(st, ui.selected, x, y))) Object.assign(ui, { moving: false, selected: null });
        ctx.rerender();
      }
    };

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-tool],[data-season],[data-expand],[data-item],.tile-target,[data-cancel],[data-move],[data-remove]');
      if (!el) return;
      if (el.getAttribute('aria-disabled') === 'true') {
        return toast(el.title || 'Not available yet', { iconName: 'lock' });
      }
      if (el.dataset.tool) Object.assign(ui, { tool: ui.tool === el.dataset.tool ? null : el.dataset.tool, selected: null, moving: false });
      else if (el.dataset.season) act((st) => setSeason(st, el.dataset.season));
      else if (el.dataset.expand !== undefined) act((st) => expandGarden(st), 'Your garden grew a new row!');
      else if (el.dataset.item) Object.assign(ui, { selected: el.dataset.item, tool: null, moving: false });
      else if (el.classList.contains('tile-target')) return onTile(el);
      else if (el.dataset.cancel !== undefined) Object.assign(ui, { tool: null, selected: null, moving: false });
      else if (el.dataset.move !== undefined) ui.moving = true;
      else if (el.dataset.remove !== undefined) {
        const id = ui.selected;
        ui.selected = null;
        let refund = 0;
        act((st) => (refund = removeItem(st, id)));
        toast(`Removed · +${refund} energy back`, { iconName: 'undo-2' });
      }
      ctx.rerender();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('.tile-target, [data-item]');
      if (!el) return;
      e.preventDefault();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  },
};
