import { MAP, LINKS, START_ROADS, edgeKey, routeFor } from './rules.js';

export const DEFAULT_LEVEL = 'xun';
const hq = (id, name, x, y, owner) => ({ id, name, x, y, owner, kind: 'hq', troops: 9 });
const post = (id, name, x, y, owner = null, troops = owner ? 5 : 2) =>
  ({ id, name, x, y, owner, kind: 'outpost', troops });
const gate = (name, x, y, troops = 4) => ({ id: 'pass', name, x, y, kind: 'gate', owner: null, troops });
const roads = (blueTo, redTo) => [
  { from: 'west', to: blueTo, owner: 'blue' }, { from: 'east', to: redTo, owner: 'red' },
];

// Trigram identity, imagery, phase and direction follow the supplied table.csv.
// Map layouts and elemental rules are original to this game.
export const BAGUA = [
  {
    id: 'qian', trigram: '乾', symbol: '☰', image: '天', phase: '金', direction: '西北',
    title: '云阙天门', accent: '#c3ceff', palette: ['#243a60', '#111d3f', '#393158'],
    layout: '双层浮岛', brief: '上层云桥能直取天门。下层先经过落云渡，再由浮云阁绕到中央。',
    nodes: [
      hq('west', '望云台', 129, 288, 'blue'), hq('east', '凌霄垒', 871, 288, 'red'),
      post('pine', '凌空台', 312, 151, 'blue'), post('ridge', '晴崖', 688, 151, 'red'),
      post('ford', '云径', 286, 420, 'blue'), post('bridge', '霞阶', 714, 420, 'red'),
      gate('天门', 500, 131), post('watch', '浮云阁', 500, 305, null, 3), post('mill', '落云渡', 500, 471),
    ],
    links: [
      ['west', 'pine'], ['west', 'ford'], ['east', 'ridge'], ['east', 'bridge'],
      ['pine', 'pass'], ['ridge', 'pass'], ['pass', 'watch'],
      ['pine', 'watch'], ['ridge', 'watch'], ['watch', 'mill'], ['ford', 'mill'], ['bridge', 'mill'],
    ],
    startRoads: roads('pine', 'ridge'),
    curves: [['pine', 'pass', 0, -52], ['ridge', 'pass', 0, -52], ['ford', 'mill', 0, 35], ['bridge', 'mill', 0, 35], ['pass', 'watch', -64, 0]],
    effect: {
      kind: 'sky', periodMs: 4_000, summary: '每 4 秒交替云开与云合。云开时，双方都能看见所有在途部队。',
      modes: [
        { label: '云开', detail: '所有在途部队可见', revealFlights: true },
        { label: '云合', detail: '恢复行军迷雾', revealFlights: false },
      ],
    },
  },
  {
    id: 'kun', trigram: '坤', symbol: '☷', image: '地', phase: '土', direction: '西南',
    title: '厚土原', accent: '#edc890', palette: ['#484536', '#2b2e25', '#52392a'],
    layout: '三层梯田', brief: '三条田埂平行推进。两侧己方梯田可以修路互援，地枢关与两座粮台受地脉保护。',
    nodes: [
      hq('west', '耕原垒', 111, 282, 'blue'), hq('east', '厚土台', 889, 282, 'red'),
      post('bankW', '上层田', 281, 107, 'blue', 4), post('bankE', '上层畦', 719, 107, 'red', 4),
      post('pine', '中层垄', 311, 280, 'blue'), post('ridge', '中层堤', 689, 280, 'red'),
      post('ford', '坤丘', 281, 447, 'blue', 4), post('bridge', '陶坡', 719, 447, 'red', 4),
      post('watch', '北粮台', 500, 111, null, 3), gate('地枢关', 500, 280, 5), post('mill', '南粮台', 500, 450),
    ],
    links: [
      ['west', 'bankW'], ['west', 'pine'], ['west', 'ford'], ['east', 'bankE'], ['east', 'ridge'], ['east', 'bridge'],
      ['bankW', 'pine'], ['pine', 'ford'], ['bankE', 'ridge'], ['ridge', 'bridge'],
      ['bankW', 'watch'], ['bankE', 'watch'], ['pine', 'pass'], ['ridge', 'pass'],
      ['ford', 'mill'], ['bridge', 'mill'], ['watch', 'pass'], ['pass', 'mill'],
    ],
    startRoads: roads('pine', 'ridge'),
    curves: [['west', 'bankW', -14, -28], ['east', 'bankE', 14, -28], ['west', 'ford', -12, 34], ['east', 'bridge', 12, 34]],
    effect: {
      kind: 'earth', periodMs: 5_000, nodes: ['watch', 'pass', 'mill'],
      summary: '地脉每 5 秒开启或休眠。开启时，标记据点上有驻军的控制方获得 2 点屏障，优先抵消来袭损耗。',
      modes: [
        { label: '地脉开启', detail: '标记据点的驻军获得 2 点屏障', shield: 2 },
        { label: '地脉休眠', detail: '标记据点按原兵力交战', shield: 0 },
      ],
    },
  },
  {
    id: 'zhen', trigram: '震', symbol: '☳', image: '雷', phase: '木', direction: '东',
    title: '惊雷原', accent: '#e1b6ff', palette: ['#233047', '#231b3e', '#482c59'],
    layout: '斜向雷环', brief: '两座雷眼夹住中线。卡在落雷后踏进雷眼可占先机，也可以从偏斜的裂谷小径直扑引雷关。',
    nodes: [
      hq('west', '听雷堡', 125, 353, 'blue'), hq('east', '震霆垒', 875, 217, 'red'),
      post('pine', '静松坡', 293, 159, 'blue'), post('ridge', '电石台', 707, 411, 'red'),
      post('ford', '避雷坳', 302, 425, 'blue'), post('bridge', '鸣谷', 698, 145, 'red'),
      post('watch', '北雷眼', 505, 102), gate('引雷关', 500, 285), post('mill', '南雷眼', 495, 468),
    ],
    links: [
      ['west', 'pine'], ['west', 'ford'], ['east', 'ridge'], ['east', 'bridge'],
      ['pine', 'watch'], ['watch', 'bridge'], ['ford', 'mill'], ['mill', 'ridge'],
      ['watch', 'pass'], ['mill', 'pass'], ['ford', 'pass'], ['bridge', 'pass'],
      ['pine', 'ford'], ['ridge', 'bridge'],
    ],
    startRoads: roads('pine', 'ridge'),
    curves: [['west', 'pine', -50, -20], ['east', 'ridge', 50, 20], ['watch', 'pass', -47, -6], ['mill', 'pass', 47, 6], ['ford', 'pass', 5, 62], ['bridge', 'pass', -5, -62]],
    effect: {
      kind: 'thunder', periodMs: 5_000, nodes: ['watch', 'mill'],
      summary: '每 5 秒劈中标记雷眼，驻军各减 2，最低为 0。同刻先落雷，再结算抵达。',
      pulse: { kind: 'damage', count: 2, label: '落雷' },
      modes: [{ label: '雷势蓄积', detail: '倒计时结束时，标记雷眼驻军 −2' }],
    },
  },
  {
    id: 'xun', trigram: '巽', symbol: '☴', image: '风', phase: '木', direction: '东南',
    title: '回风峡', accent: '#8be9cf', palette: ['#183f50', '#0f262e', '#374039'],
    layout: 'S 形峡谷', brief: '两段大弯经过南北风眼。对角线能直取回风关，侧翼则给预备队留出回旋余地。',
    nodes: [
      hq('west', '西风垒', 128, 347, 'blue'), hq('east', '东风垒', 872, 223, 'red'),
      post('pine', '迎风坡', 293, 167, 'blue'), post('bridge', '回流渡', 707, 403, 'red'),
      post('ford', '藏风坳', 300, 432, 'blue'), post('ridge', '背风台', 700, 138, 'red'),
      post('watch', '北风眼', 484, 92), gate('回风关', 500, 285), post('mill', '风车坪', 516, 478),
    ],
    links: [
      ['west', 'pine'], ['west', 'ford'], ['east', 'bridge'], ['east', 'ridge'],
      ['pine', 'watch'], ['ridge', 'watch'], ['ford', 'mill'], ['bridge', 'mill'],
      ['pine', 'pass'], ['bridge', 'pass'], ['watch', 'pass'], ['mill', 'pass'],
    ],
    startRoads: roads('pine', 'bridge'),
    curves: [
      ['west', 'pine', -29, -49], ['east', 'bridge', 29, 49],
      ['pine', 'watch', 13, -43], ['bridge', 'mill', -13, 43],
      ['watch', 'pass', 91, 22], ['mill', 'pass', -91, -22],
      ['pine', 'pass', -21, 32], ['bridge', 'pass', 21, -32],
    ],
    effect: {
      kind: 'wind', periodMs: 4_000, alternateByRound: true,
      summary: '每 4 秒换向，顺风方速度 ×1.5，逆风方 ×0.65。正在行军的部队也随风向变速。',
      modes: [
        { label: '蓝方顺风', detail: '蓝方 ×1.5 · 模型 ×0.65', speed: { blue: 1.5, red: .65 } },
        { label: '模型顺风', detail: '蓝方 ×0.65 · 模型 ×1.5', speed: { blue: .65, red: 1.5 } },
      ],
    },
  },
  {
    id: 'kan', trigram: '坎', symbol: '☵', image: '水', phase: '水', direction: '北',
    title: '双潮河', accent: '#8dccff', palette: ['#1d4262', '#102e48', '#27416a'],
    layout: '三汊河口', brief: '高堤线耗时固定，水上的短渡线则随潮汐变快或变慢。河心关和下游沙洲可以互相支援。',
    nodes: [
      hq('west', '上游垒', 122, 269, 'blue'), hq('east', '入海垒', 878, 269, 'red'),
      post('bankW', '西高堤', 298, 119, 'blue', 4), post('bankE', '东高堤', 702, 119, 'red', 4),
      post('pine', '西渡头', 278, 333, 'blue'), post('ridge', '东渡头', 722, 333, 'red'),
      post('watch', '堰桥', 500, 101, null, 3), gate('河心关', 500, 284), post('mill', '潮汐沙洲', 500, 472),
      post('ford', '西芦汀', 306, 473), post('bridge', '东芦汀', 694, 473),
    ],
    links: [
      ['west', 'bankW'], ['west', 'pine'], ['east', 'bankE'], ['east', 'ridge'],
      ['bankW', 'watch'], ['bankE', 'watch'], ['watch', 'pass'],
      ['pine', 'pass'], ['ridge', 'pass'], ['pine', 'mill'], ['ridge', 'mill'],
      ['pine', 'ford'], ['ridge', 'bridge'], ['ford', 'mill'], ['bridge', 'mill'], ['pass', 'mill'],
    ],
    startRoads: roads('bankW', 'bankE'),
    curves: [['pine', 'mill', 27, 38], ['ridge', 'mill', -27, 38], ['pass', 'mill', 63, 12], ['bankW', 'watch', 0, -28], ['bankE', 'watch', 0, -28]],
    effect: {
      kind: 'water', periodMs: 5_000,
      edges: [['pine', 'pass'], ['pass', 'ridge'], ['pine', 'mill'], ['mill', 'ridge']],
      summary: '每 5 秒涨退潮。标记渡线在低潮时速度 ×1.4，涨潮时 ×0.5。在途部队即时变速。',
      modes: [
        { label: '低潮', detail: '标记渡线通行速度 ×1.4', edgeSpeed: 1.4 },
        { label: '涨潮', detail: '标记渡线通行速度 ×0.5', edgeSpeed: .5 },
      ],
    },
  },
  {
    id: 'li', trigram: '离', symbol: '☲', image: '火', phase: '火', direction: '南',
    title: '赤焰谷', accent: '#ffab8c', palette: ['#4b3137', '#2d202c', '#553037'],
    layout: '环形火山口', brief: '冷灰台沿环脊相连，南坡可穿过火线抢关。少量部队适合走外环，集中的大队更能承受灼烧。',
    nodes: [
      hq('west', '余烬垒', 115, 286, 'blue'), hq('east', '赤霞垒', 885, 286, 'red'),
      post('ford', '灰松岗', 274, 121, 'blue', 4), post('bridge', '火石台', 726, 121, 'red', 4),
      post('pine', '西烬坡', 271, 429, 'blue'), post('ridge', '东烬坡', 729, 429, 'red'),
      post('ventW', '西烟孔', 328, 275, null, 1), post('ventE', '东烟孔', 672, 275, null, 1),
      post('watch', '冷灰台', 500, 93), gate('赤焰关', 500, 284), post('mill', '炉谷', 500, 469, null, 3),
    ],
    links: [
      ['west', 'ford'], ['west', 'pine'], ['east', 'bridge'], ['east', 'ridge'],
      ['ford', 'watch'], ['bridge', 'watch'], ['watch', 'pass'],
      ['ford', 'ventW'], ['pine', 'ventW'], ['bridge', 'ventE'], ['ridge', 'ventE'],
      ['ventW', 'pass'], ['ventE', 'pass'], ['pine', 'pass'], ['ridge', 'pass'],
      ['pine', 'mill'], ['ridge', 'mill'], ['mill', 'pass'],
    ],
    startRoads: roads('ford', 'bridge'),
    curves: [['ford', 'watch', -32, -44], ['bridge', 'watch', 32, -44], ['pine', 'mill', -25, 53], ['ridge', 'mill', 25, 53], ['pine', 'pass', 15, 41], ['ridge', 'pass', -15, 41]],
    effect: {
      kind: 'fire', periodMs: 4_000, nodes: ['pass', 'mill', 'ventW', 'ventE'],
      summary: '明火与余烬每 4 秒切换。明火期，每支抵达标记据点的部队先损失 1 兵。',
      modes: [
        { label: '余烬', detail: '标记据点暂可安全抵达', arrivalLoss: 0 },
        { label: '明火', detail: '每支抵达标记据点的部队先损失 1 兵', arrivalLoss: 1 },
      ],
    },
  },
  {
    id: 'gen', trigram: '艮', symbol: '☶', image: '山', phase: '土', direction: '东北',
    title: '叠嶂隘', accent: '#c5d8a6', palette: ['#314b42', '#222f2c', '#40463b'],
    layout: '对角攀峰', brief: '双方从山脊两端向中央攀升。直登隘口的山道会封闭，绕过两侧峰哨仍能抵达。',
    nodes: [
      hq('west', '西麓垒', 277, 478, 'blue'), hq('east', '东北峰', 723, 92, 'red'),
      post('pine', '西岭肩', 190, 324, 'blue'), post('ridge', '东峰脊', 810, 246, 'red'),
      post('ford', '山脚驿', 476, 457, 'blue'), post('bridge', '北山道', 524, 113, 'red'),
      post('watch', '西峰哨', 295, 151, null, 3), gate('叠嶂关', 500, 285), post('mill', '东峰哨', 705, 419, null, 3),
    ],
    links: [
      ['west', 'pine'], ['west', 'ford'], ['east', 'ridge'], ['east', 'bridge'],
      ['pine', 'pass'], ['ridge', 'pass'], ['pine', 'watch'], ['ridge', 'mill'],
      ['ford', 'mill'], ['bridge', 'watch'], ['watch', 'pass'], ['mill', 'pass'], ['ford', 'pine'], ['bridge', 'ridge'],
    ],
    startRoads: roads('ford', 'bridge'),
    curves: [['pine', 'pass', -15, -76], ['ridge', 'pass', 15, 76], ['ford', 'mill', 30, 49], ['bridge', 'watch', -30, -49], ['watch', 'pass', 65, -22], ['mill', 'pass', -65, 22]],
    effect: {
      kind: 'mountain', periodMs: 3_000, edges: [['pine', 'pass'], ['pass', 'ridge']],
      summary: '山道每 3 秒开闭。落石时不能经由封锁路径新出兵，已出发的部队继续行军。',
      modes: [
        { label: '山道畅通', detail: '标记山道可通行', closed: false },
        { label: '落石封路', detail: '标记山道暂停新出兵', closed: true },
      ],
    },
  },
  {
    id: 'dui', trigram: '兑', symbol: '☱', image: '泽（湖泽）', phase: '金', direction: '西',
    title: '映泽洲', accent: '#91e3e0', palette: ['#154351', '#102f37', '#234557'],
    layout: '双月泽岛', brief: '两条月弧通向会补兵的月汀和回水汀。浮埠截住中路，泽岛驻军可以从南北绕进芦洲关。',
    nodes: [
      hq('west', '西泽垒', 124, 281, 'blue'), hq('east', '镜湖垒', 876, 281, 'red'),
      post('pine', '芦苇岸', 271, 149, 'blue'), post('ridge', '鱼脊洲', 729, 149, 'red'),
      post('ford', '浅湾', 269, 420, 'blue'), post('bridge', '盐草岸', 731, 420, 'red'),
      post('watch', '月汀', 500, 94), gate('芦洲关', 500, 282), post('mill', '回水汀', 500, 473),
      post('floatW', '西浮埠', 333, 278), post('floatE', '东浮埠', 667, 278),
    ],
    links: [
      ['west', 'pine'], ['west', 'ford'], ['east', 'ridge'], ['east', 'bridge'],
      ['pine', 'watch'], ['ridge', 'watch'], ['ford', 'mill'], ['bridge', 'mill'],
      ['pine', 'floatW'], ['ford', 'floatW'], ['ridge', 'floatE'], ['bridge', 'floatE'],
      ['floatW', 'pass'], ['floatE', 'pass'], ['watch', 'pass'], ['mill', 'pass'],
      ['floatW', 'mill'], ['floatE', 'mill'],
    ],
    startRoads: roads('pine', 'ridge'),
    curves: [['pine', 'watch', 10, -54], ['ridge', 'watch', -10, -54], ['ford', 'mill', 10, 51], ['bridge', 'mill', -10, 51], ['watch', 'pass', 44, 0], ['mill', 'pass', -44, 0]],
    effect: {
      kind: 'marsh', periodMs: 6_000, nodes: ['watch', 'mill'],
      summary: '每 6 秒泽泉补给一次，只有已被控制的标记洲汀各获得 1 兵。同刻先补给，再结算抵达。',
      pulse: { kind: 'growth', count: 1, label: '泽泉补给' },
      modes: [{ label: '泽泉蓄水', detail: '倒计时结束时，已被控制的标记据点 +1 兵' }],
    },
  },
];

export const CLASSIC = {
  id: 'classic', title: '风门关战役', nodes: MAP, links: LINKS, startRoads: START_ROADS,
  layout: '双线通关', brief: '从南北两线调兵，在中央风门关交锋。',
  accent: '#e9bf80', palette: ['#193246', '#162532', '#342b3a'], effect: null,
};

export function getLevel(id) {
  return id === CLASSIC.id ? CLASSIC : BAGUA.find(level => level.id === id) ?? null;
}

export function elementAt(level, round, time = 0) {
  const effect = level.effect;
  if (!effect) return null;
  const cycle = Math.floor(time / effect.periodMs);
  const roundOffset = effect.alternateByRound ? round - 1 : 0;
  const index = (cycle + roundOffset) % effect.modes.length;
  const mode = effect.modes[index];
  const next = effect.modes[(index + 1) % effect.modes.length];
  const elapsedMs = time - cycle * effect.periodMs;
  return {
    id: level.id, kind: effect.kind, trigram: level.trigram, symbol: level.symbol,
    image: level.image, fivePhase: level.phase, direction: level.direction,
    ...mode, affectedNodes: effect.nodes ?? [], affectedEdges: effect.edges ?? [],
    ...(effect.pulse ? { pulse: effect.pulse } : {}),
    progress: elapsedMs / effect.periodMs, elapsedMs, periodMs: effect.periodMs,
    nextInMs: effect.periodMs - elapsedMs, nextAtMs: (cycle + 1) * effect.periodMs,
    nextLabel: effect.pulse?.label ?? next.label, summary: effect.summary,
  };
}

export function markedEdge(element, from, to) {
  return element?.affectedEdges.some(([a, b]) => edgeKey(a, b) === edgeKey(from, to)) ?? false;
}

function travelLeg(level, round, side, from, to, startAt, baseMs) {
  const affected = level.effect?.kind === 'wind' || level.effect?.kind === 'water';
  if (!affected) return { from, to, startAt, endAt: startAt + baseMs };
  const segments = [];
  let endAt = startAt;
  let remaining = baseMs;
  while (remaining > 0.000001) {
    const element = elementAt(level, round, endAt);
    const speed = element.speed?.[side] ?? (markedEdge(element, from, to) ? element.edgeSpeed : 1);
    const duration = remaining / speed;
    const initialProgress = 1 - remaining / baseMs;
    const segmentEnd = duration <= element.nextInMs ? endAt + duration : element.nextAtMs;
    remaining = duration <= element.nextInMs ? 0 : remaining - (segmentEnd - endAt) * speed;
    segments.push({ startAt: endAt, endAt: segmentEnd, fromProgress: initialProgress, toProgress: 1 - remaining / baseMs });
    endAt = segmentEnd;
  }
  return { from, to, startAt, endAt, segments };
}

export function travelFor(level, round, nodes, roads, side, from, to, startAt = 0) {
  const element = elementAt(level, round, startAt);
  const usable = (a, b) => !element?.closed || !markedEdge(element, a, b);
  const route = routeFor(nodes, roads, side, from, to, level.links, usable);
  if (!route) return null;
  let endAt = startAt;
  const legs = [];
  for (let i = 1; i < route.path.length; i++) {
    const leg = travelLeg(level, round, side, route.path[i - 1], route.path[i], endAt, route.edgeMs);
    legs.push(leg);
    endAt = leg.endAt;
  }
  return { path: route.path, legs, arriveAt: endAt, duration: endAt - startAt };
}

export function pulseTimes(level, from, to) {
  if (!level.effect?.pulse) return [];
  const period = level.effect.periodMs;
  const times = [];
  for (let t = (Math.floor(from / period) + 1) * period; t <= to; t += period) times.push(t);
  return times;
}
