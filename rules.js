export const MAP = [
  { id: 'west', name: '西垒', x: 130, y: 291, kind: 'hq', owner: 'blue', troops: 9 },
  { id: 'pine', name: '松岭', x: 322, y: 160, kind: 'outpost', owner: 'blue', troops: 5 },
  { id: 'ford', name: '浅渡', x: 317, y: 420, kind: 'outpost', owner: 'blue', troops: 5 },
  { id: 'watch', name: '北哨', x: 520, y: 113, kind: 'outpost', owner: null, troops: 2 },
  { id: 'pass', name: '风门关', x: 510, y: 288, kind: 'gate', owner: null, troops: 4 },
  { id: 'mill', name: '旧磨坊', x: 502, y: 470, kind: 'outpost', owner: null, troops: 2 },
  { id: 'ridge', name: '赤阶', x: 704, y: 157, kind: 'outpost', owner: 'red', troops: 5 },
  { id: 'bridge', name: '石桥', x: 697, y: 412, kind: 'outpost', owner: 'red', troops: 5 },
  { id: 'east', name: '东垒', x: 874, y: 284, kind: 'hq', owner: 'red', troops: 9 },
];

export const LINKS = [
  ['west', 'pine'], ['west', 'ford'],
  ['pine', 'watch'], ['watch', 'ridge'],
  ['pine', 'pass'], ['ford', 'pass'], ['pass', 'ridge'], ['pass', 'bridge'],
  ['ford', 'mill'], ['mill', 'bridge'],
  ['ridge', 'east'], ['bridge', 'east'],
];

export const START_ROADS = [
  { from: 'west', to: 'pine', owner: 'blue' },
  { from: 'ridge', to: 'east', owner: 'red' },
];

export const RULES = Object.freeze({
  marchMs: 20_000,
  aiDecisionMs: 3_000,
  trailMs: 5_000,
  roadMs: 1_500,
  recruitCount: 3,
  startPoints: 4,
  maxPoints: 10,
  keepRounds: 2,
});

export const SIDE_NAME = { blue: '蓝方', red: '模型', neutral: '中立' };
export const PHASES = { plan: '侦察下令', march: '即时行军', build: '结算建设', ended: '对局结束' };
export const boardSize = { width: 1000, height: 570 };

export function edgeKey(from, to) {
  return [from, to].sort().join(':');
}

export function adjacent(from, to, links = LINKS) {
  return links.some(([a, b]) => (a === from && b === to) || (a === to && b === from));
}

export function routeFor(nodes, roads, side, from, to, links = LINKS, usable = () => true) {
  if (from === to || nodes[from]?.owner !== side || !nodes[to]) return null;
  if (nodes[to].owner === side) {
    const visited = new Set([from]);
    const queue = [[from]];
    const ownedRoads = roads.filter(road => road.owner === side);
    for (const path of queue) {
      const last = path[path.length - 1];
      if (last === to) {
        return { path, edgeMs: RULES.roadMs, duration: RULES.roadMs * (path.length - 1) };
      }
      for (const road of ownedRoads) {
        const next = road.from === last ? road.to : road.to === last ? road.from : null;
        if (next && nodes[next].owner === side && !visited.has(next) && usable(last, next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }
  }
  if (!adjacent(from, to, links) || !usable(from, to)) return null;
  return { path: [from, to], edgeMs: RULES.trailMs, duration: RULES.trailMs };
}
