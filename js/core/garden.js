// Zen Garden economy. Garden energy is earned alongside XP (half the XP of each
// genuine activity) and spent here on plants, decorations, themes and space.
import { energyBalance, levelInfo, totalXP } from './gamification.js';
import { uid } from './utils.js';

export const GARDEN_ITEMS = [
  { type: 'tulip', name: 'Tulip', cost: 8, level: 1, kind: 'Flower' },
  { type: 'daisy', name: 'Daisy', cost: 8, level: 1, kind: 'Flower' },
  { type: 'bush', name: 'Round bush', cost: 15, level: 1, kind: 'Plant' },
  { type: 'rock', name: 'Zen stone', cost: 12, level: 1, kind: 'Decoration' },
  { type: 'mushroom', name: 'Mushroom', cost: 15, level: 2, kind: 'Plant' },
  { type: 'tree', name: 'Oak tree', cost: 35, level: 2, kind: 'Tree' },
  { type: 'bench', name: 'Garden bench', cost: 40, level: 2, kind: 'Decoration' },
  { type: 'pine', name: 'Pine tree', cost: 35, level: 3, kind: 'Tree' },
  { type: 'lantern', name: 'Stone lantern', cost: 45, level: 3, kind: 'Decoration' },
  { type: 'pond', name: 'Koi pond', cost: 90, level: 3, kind: 'Water' },
  { type: 'sakura', name: 'Cherry blossom', cost: 70, level: 4, kind: 'Tree' },
  { type: 'gate', name: 'Garden gate', cost: 120, level: 5, kind: 'Landmark' },
];

export const SEASONS = [
  { id: 'spring', name: 'Spring', level: 1 },
  { id: 'summer', name: 'Summer', level: 2 },
  { id: 'autumn', name: 'Autumn', level: 3 },
  { id: 'winter', name: 'Winter', level: 4 },
  { id: 'night', name: 'Firefly night', level: 5 },
];

export const MAX_ROWS = 8;
export const REFUND_RATE = 0.5;
export const expansionCost = (rows) => 60 * (rows - 3);

export const itemDef = (type) => GARDEN_ITEMS.find((i) => i.type === type);
const level = (state) => levelInfo(totalXP(state)).level;

export function canAfford(state, cost) {
  return energyBalance(state).balance >= cost;
}

export function placeItem(state, type, x, y, now = Date.now()) {
  const def = itemDef(type);
  if (!def) throw new Error('Unknown item');
  if (level(state) < def.level) throw new Error(`Unlocks at level ${def.level}`);
  if (x < 0 || y < 0 || x >= state.garden.cols || y >= state.garden.rows) throw new Error('Outside the garden');
  if (state.garden.items.some((i) => i.x === x && i.y === y)) throw new Error('That spot is taken');
  if (!canAfford(state, def.cost)) throw new Error('Not enough garden energy');
  const item = { id: uid('g'), type, x, y, placedAt: now };
  state.garden.items.push(item);
  state.garden.spent.push({ id: uid('spend'), what: `place:${type}`, cost: def.cost, ts: now });
  return item;
}

export function removeItem(state, id, now = Date.now()) {
  const item = state.garden.items.find((i) => i.id === id);
  if (!item) return 0;
  const refund = Math.floor(itemDef(item.type).cost * REFUND_RATE);
  state.garden.items = state.garden.items.filter((i) => i.id !== id);
  state.garden.spent.push({ id: uid('spend'), what: `remove:${item.type}`, cost: -refund, ts: now });
  return refund;
}

export function moveItem(state, id, x, y) {
  const item = state.garden.items.find((i) => i.id === id);
  if (!item) return;
  if (x < 0 || y < 0 || x >= state.garden.cols || y >= state.garden.rows) throw new Error('Outside the garden');
  if (state.garden.items.some((i) => i.id !== id && i.x === x && i.y === y)) throw new Error('That spot is taken');
  Object.assign(item, { x, y });
}

export function expandGarden(state, now = Date.now()) {
  const g = state.garden;
  if (g.rows >= MAX_ROWS) throw new Error('Your garden is as big as it gets');
  const cost = expansionCost(g.rows);
  if (!canAfford(state, cost)) throw new Error('Not enough garden energy');
  g.rows += 1;
  g.spent.push({ id: uid('spend'), what: 'expand', cost, ts: now });
}

export function setSeason(state, id) {
  const s = SEASONS.find((x) => x.id === id);
  if (!s) return;
  if (level(state) < s.level) throw new Error(`Unlocks at level ${s.level}`);
  state.garden.season = id;
}

/** 0–4: how lush the lawn looks, from lifetime energy earned. */
export function lushness(state) {
  const earned = energyBalance(state).earned;
  return earned >= 600 ? 4 : earned >= 250 ? 3 : earned >= 100 ? 2 : earned >= 25 ? 1 : 0;
}
