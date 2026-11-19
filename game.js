import { RULES, SIDE_NAME, adjacent, edgeKey } from './rules.js';
import { elementAt, getLevel, pulseTimes, travelFor } from './levels.js';

const SIDES = ['blue', 'red'];
const isBase = node => node.kind !== 'outpost';
const failure = error => ({ ok: false, error });
const success = { ok: true };

export function createGame(levelId = 'classic') {
  const level = getLevel(levelId);
  if (!level) throw new RangeError('Unknown level');
  const players = Object.fromEntries(SIDES.map(side => [side, {
    points: RULES.startPoints, ready: false, orders: [], scout: null, reserveUsed: false, hold: 0,
  }]));
  const game = {
    level, players, nodes: Object.fromEntries(level.nodes.map(node => [node.id, { ...node }])),
    roads: level.startRoads.map(road => ({ ...road })),
    phase: 'plan', phaseId: 1, round: 1, flights: [], eventId: 0, events: [],
    march: null, winner: null, endReason: null,
  };
  record(game, 'phase', `第 1 回合开始。${game.nodes.pass.name}仍由中立守军控制。`);
  return game;
}

function record(game, kind, text, audience = null) {
  game.events.push({ id: ++game.eventId, kind, text, audience });
  if (game.events.length > 70) game.events.shift();
}

function switchPhase(game, phase) {
  game.phase = phase;
  game.phaseId++;
  for (const side of SIDES) game.players[side].ready = false;
}

export function marchTime(game, now) {
  if (!game.march) return 0;
  const { elapsed, runningSince, aiHandled } = game.march;
  const limit = aiHandled ? RULES.marchMs : RULES.aiDecisionMs;
  return Math.min(limit, elapsed + (runningSince === null ? 0 : Math.max(0, now - runningSince)));
}

function dispatch(game, side, order, route) {
  game.nodes[order.from].troops -= order.count;
  game.flights.push({ id: ++game.eventId, side, troops: order.count, to: order.to, legs: route.legs, arriveAt: route.arriveAt });
}

function beginMarch(game, now) {
  switchPhase(game, 'march');
  game.march = {
    elapsed: 0, runningSince: now, aiHandled: false, lastStep: 0,
    baseOwners: new Map(Object.values(game.nodes).filter(isBase).map(node => [node.id, node.owner])),
  };
  for (const side of SIDES) {
    const player = game.players[side];
    for (const order of player.orders) {
      const route = travelFor(game.level, game.round, game.nodes, game.roads, side, order.from, order.to);
      dispatch(game, side, order, route);
    }
    player.orders = [];
  }
  record(game, 'phase', '预设部队同时出发。双方各可追加一次出兵。');
}

function beginPlan(game) {
  switchPhase(game, 'plan');
  game.round++;
  game.march = null;
  for (const side of SIDES) {
    const player = game.players[side];
    const income = Object.values(game.nodes).filter(node => node.owner === side && isBase(node)).length;
    player.points = Math.min(RULES.maxPoints, player.points + income);
    player.scout = null;
    player.reserveUsed = false;
  }
  record(game, 'phase', `第 ${game.round} 回合开始，控制的基地各提供 1 行动点。`);
}

function endMarch(game) {
  for (const [id, before] of game.march.baseOwners) {
    const { owner, name } = game.nodes[id];
    if (!owner || owner === before) continue;
    const player = game.players[owner];
    player.points = Math.min(RULES.maxPoints, player.points + 1);
    record(game, 'capture', `${SIDE_NAME[owner]}结算 ${name}，获得 1 行动点。`);
  }
  const winners = SIDES.filter(side => {
    const player = game.players[side];
    player.hold = game.nodes.pass.owner === side ? player.hold + 1 : 0;
    const enemyHq = side === 'blue' ? game.nodes.east : game.nodes.west;
    return enemyHq.owner === side || player.hold >= RULES.keepRounds;
  });
  if (winners.length) {
    switchPhase(game, 'ended');
    game.winner = winners.length === 1 ? winners[0] : 'draw';
    const hq = winners[0] === 'blue' ? game.nodes.east : game.nodes.west;
    game.endReason = game.winner === 'draw' ? '双方同时达成胜利条件。'
      : hq.owner === game.winner ? `${SIDE_NAME[game.winner]}占领了对方指挥部。`
        : `${SIDE_NAME[game.winner]}连续两次在轮末控制${game.nodes.pass.name}。`;
    record(game, 'phase', game.endReason);
  } else {
    switchPhase(game, 'build');
    record(game, 'phase', '轮末结算完成，可以在基地征兵或修建己方道路。');
  }
  game.march = null;
}

function resolveArrivals(game, node, incoming) {
  const element = elementAt(game.level, game.round, incoming[0].arriveAt);
  const affected = element?.affectedNodes.includes(node.id);
  const loss = affected ? element.arrivalLoss || 0 : 0;
  const arrivals = loss ? incoming.flatMap(flight => {
    const lost = Math.min(flight.troops, loss);
    record(game, 'element', `${node.name}的火线使抵达部队损失 ${lost} 兵。`, [flight.side]);
    return flight.troops > lost ? [{ ...flight, troops: flight.troops - lost }] : [];
  }) : incoming;
  if (!arrivals.length) return;
  const before = node.owner;
  const totals = { blue: 0, red: 0, neutral: 0 };
  totals[before ?? 'neutral'] = node.troops;
  for (const flight of arrivals) totals[flight.side] += flight.troops;
  const sides = new Set(arrivals.map(flight => flight.side));
  if (sides.size === 1 && sides.has(before)) {
    node.troops = totals[before];
    record(game, 'move', `${node.name} 收到 ${arrivals.reduce((sum, flight) => sum + flight.troops, 0)} 名援兵。`, [before]);
    return;
  }
  const shield = affected && before && node.troops > 0 ? element.shield || 0 : 0;
  if (shield) totals[before] += shield;
  const sum = totals.blue + totals.red + totals.neutral;
  const leader = Object.keys(totals).find(side => totals[side] * 2 > sum);
  if (leader && leader !== 'neutral') node.owner = leader;
  node.troops = leader ? Math.min(totals[leader] - (leader === before ? shield : 0), totals[leader] * 2 - sum) : 0;
  if (node.owner !== before) {
    game.roads = game.roads.filter(road => road.from !== node.id && road.to !== node.id);
    record(game, 'capture', `${SIDE_NAME[node.owner]}占领 ${node.name}。`);
  }
  const viewers = SIDES.filter(side => sides.has(side) || before === side || game.players[side].scout === node.id);
  const result = node.troops ? `${SIDE_NAME[node.owner ?? 'neutral']}余 ${node.troops} 兵` : '各方兵力相抵';
  record(game, 'battle', `${node.name} 交战，${result}。`, viewers);
}

function settleFlights(game, through, inclusive = true) {
  const hasArrived = flight => flight.arriveAt < through || (inclusive && flight.arriveAt === through);
  const due = game.flights.filter(hasArrived).sort((a, b) => a.arriveAt - b.arriveAt);
  if (!due.length) return false;
  game.flights = game.flights.filter(flight => !hasArrived(flight));
  const groups = new Map();
  for (const flight of due) {
    const key = `${flight.arriveAt}:${flight.to}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(flight);
  }
  for (const flights of groups.values()) resolveArrivals(game, game.nodes[flights[0].to], flights);
  return true;
}

function applyPulse(game) {
  const { nodes, pulse } = game.level.effect;
  const affected = nodes.map(id => game.nodes[id]);
  if (pulse.kind === 'damage') {
    for (const node of affected) node.troops = Math.max(0, node.troops - pulse.count);
    record(game, 'element', `落雷击中 ${affected.map(node => node.name).join('、')}，各损失至多 ${pulse.count} 兵。`);
  } else {
    const controlled = affected.filter(node => node.owner);
    for (const node of controlled) node.troops += pulse.count;
    if (controlled.length) record(game, 'element', `泽泉为 ${controlled.map(node => node.name).join('、')} 各补充 ${pulse.count} 兵。`);
  }
}

export function tick(game, now) {
  if (game.phase !== 'march' || game.march.runningSince === null) return false;
  const time = marchTime(game, now);
  const previous = game.march.lastStep;
  const visibilityChanged = game.flights.some(flight => {
    const { startAt } = flight.legs.at(-1);
    return startAt > previous && startAt <= time;
  });
  const period = game.level.effect?.periodMs;
  const elementChanged = period && Math.floor(time / period) !== Math.floor(previous / period);
  for (const pulseTime of pulseTimes(game.level, previous, time)) {
    settleFlights(game, pulseTime, false);
    applyPulse(game);
  }
  const arrived = settleFlights(game, time);
  game.march.lastStep = time;
  if (!game.march.aiHandled && time >= RULES.aiDecisionMs) {
    game.march.elapsed = RULES.aiDecisionMs;
    game.march.runningSince = null;
    return true;
  }
  if (time >= RULES.marchMs) {
    endMarch(game);
    return true;
  }
  return Boolean(arrived || visibilityChanged || elementChanged);
}

export function modelStep(game) {
  if (game.phase === 'plan' && !game.players.red.ready) return 'plan';
  if (game.phase === 'build' && !game.players.red.ready) return 'build';
  if (game.phase === 'march' && game.march.runningSince === null && !game.march.aiHandled) return 'reserve';
  return null;
}

export function finishModelStep(game, step, now) {
  if (step !== modelStep(game)) return;
  if (step === 'reserve') {
    game.march.aiHandled = true;
    game.march.runningSince = now;
    return;
  }
  applyAction(game, 'red', { type: 'ready', value: true }, now);
}

function available(game, side, id) {
  const node = game.nodes[id];
  if (node?.owner !== side) return 0;
  return node.troops - game.players[side].orders.filter(order => order.from === id).reduce((sum, order) => sum + order.count, 0);
}

function checkOrder(game, side, action, startAt) {
  const { from, to, count } = action;
  if (typeof from !== 'string' || typeof to !== 'string') return failure('请选择起点和目标。');
  const route = travelFor(game.level, game.round, game.nodes, game.roads, side, from, to, startAt);
  if (!route) return failure('请选择开放的相邻目标或连通的己方道路。');
  if (route.arriveAt > RULES.marchMs) return failure('剩余行军时间不足以抵达。');
  if (!Number.isSafeInteger(count) || count < 1 || count > available(game, side, from)) {
    return failure('可用兵力不足。');
  }
  return { ok: true, route };
}

function scoutOptions(game, side) {
  const player = game.players[side];
  if (player.scout || player.points < 1) return [];
  const own = Object.values(game.nodes).filter(node => node.owner === side);
  return Object.values(game.nodes)
    .filter(node => node.owner !== side && own.some(from => adjacent(from.id, node.id, game.level.links)))
    .map(node => node.id);
}

function buildOptions(game, side) {
  if (game.players[side].points < 1) return { recruit: [], road: [] };
  const owned = Object.values(game.nodes).filter(node => node.owner === side);
  return {
    recruit: owned.filter(isBase).map(node => node.id),
    road: game.level.links.filter(([a, b]) => game.nodes[a].owner === side && game.nodes[b].owner === side
      && !game.roads.some(road => edgeKey(road.from, road.to) === edgeKey(a, b))),
  };
}

export function applyAction(game, side, action, now) {
  const player = game.players[side];
  const { type, node, from, to, count } = action;
  if (type === 'ready' && (game.phase === 'plan' || game.phase === 'build')) {
    player.ready = action.value !== false;
    if (SIDES.every(id => game.players[id].ready)) {
      if (game.phase === 'plan') beginMarch(game, now);
      else beginPlan(game);
    }
    return success;
  }
  if (player.ready) return failure('已确认本阶段，继续调整后可下令。');

  if (game.phase === 'plan') {
    if (type === 'scout') {
      if (!scoutOptions(game, side).includes(node)) return failure('侦察需要 1 行动点及一个相邻目标。每轮可用一次。');
      player.points--;
      player.scout = node;
      record(game, 'intel', `已侦察 ${game.nodes[node].name}，本轮可见该点兵力。`, [side]);
      return success;
    }
    if (type === 'order') {
      const check = checkOrder(game, side, action, 0);
      if (!check.ok) return check;
      if (player.orders.length >= 20) return failure('本轮最多安排 20 条行军命令。');
      player.orders.push({ id: ++game.eventId, from, to, count });
      return success;
    }
    if (type === 'cancel') {
      const index = player.orders.findIndex(order => order.id === action.id);
      if (index < 0) return failure('这条命令已经移除。');
      player.orders.splice(index, 1);
      return success;
    }
  }

  if (game.phase === 'march' && type === 'reserve') {
    if (player.reserveUsed) return failure('本轮追加出兵已用。');
    if (side === 'blue' && game.march.runningSince === null) return failure('模型正在决策，行军时钟已暂停。');
    const check = checkOrder(game, side, action, marchTime(game, now));
    if (!check.ok) return check;
    player.reserveUsed = true;
    dispatch(game, side, { from, to, count }, check.route);
    record(game, 'move', `从 ${game.nodes[from].name} 追加 ${count} 兵前往 ${game.nodes[to].name}。`, [side]);
    return success;
  }

  if (game.phase === 'build') {
    const options = buildOptions(game, side);
    if (type === 'recruit') {
      if (!options.recruit.includes(node)) return failure('只能花费 1 行动点在己方指挥部或中央关口征兵。');
      player.points--;
      game.nodes[node].troops += RULES.recruitCount;
      record(game, 'build', `在 ${game.nodes[node].name} 征募 ${RULES.recruitCount} 兵。`, [side]);
      return success;
    }
    if (type === 'road') {
      const link = options.road.find(([a, b]) => (a === from && b === to) || (a === to && b === from));
      if (!link) return failure('修路需要 1 行动点，且道路两端相邻并由你控制。');
      player.points--;
      game.roads.push({ from: link[0], to: link[1], owner: side });
      record(game, 'build', `${SIDE_NAME[side]}修通 ${game.nodes[from].name}—${game.nodes[to].name} 道路。`);
      return success;
    }
  }
  return failure('当前阶段无法使用这条指令。');
}

export function viewFor(game, side, now) {
  const player = game.players[side];
  const time = marchTime(game, now);
  const elementRound = game.phase === 'build' ? game.round + 1 : game.round;
  const element = elementAt(game.level, elementRound, time);
  const visibleFlights = game.flights.flatMap(flight => {
    if (flight.side === side || element?.revealFlights) return [flight];
    if (game.nodes[flight.to].owner !== side && player.scout !== flight.to) return [];
    const finalLeg = flight.legs.at(-1);
    if (time < finalLeg.startAt) return [];
    return [{ ...flight, legs: [finalLeg] }];
  });
  return {
    phase: game.phase, phaseId: game.phaseId, round: game.round, levelId: game.level.id,
    element, elementRound, winner: game.winner, endReason: game.endReason,
    nodes: Object.values(game.nodes).map(node => {
      const visible = node.owner === side || player.scout === node.id || node.owner === null;
      return { ...node, troops: visible ? node.troops : null, available: available(game, side, node.id),
        scouted: player.scout === node.id };
    }),
    roads: game.roads, flights: visibleFlights,
    you: { points: player.points, ready: player.ready, orders: player.orders, reserveUsed: player.reserveUsed },
    hold: Object.fromEntries(SIDES.map(id => [id, game.players[id].hold])),
    legal: { scout: game.phase === 'plan' ? scoutOptions(game, side) : [],
      build: game.phase === 'build' ? buildOptions(game, side) : { recruit: [], road: [] } },
    march: game.march ? { time, paused: game.march.runningSince === null, aiHandled: game.march.aiHandled } : null,
    events: game.events.filter(event => !event.audience || event.audience.includes(side))
      .slice(-26).map(({ id, kind, text }) => ({ id, kind, text })),
  };
}

export function modelPosition(game, step, now) {
  const view = viewFor(game, 'red', now);
  const nodes = Object.fromEntries(view.nodes.map(node => [node.id, node]));
  const moves = [];
  if (step !== 'build') {
    for (const from of view.nodes.filter(node => node.available > 0)) {
      for (const to of view.nodes) {
        const route = travelFor(game.level, game.round, nodes, view.roads, 'red', from.id, to.id, view.march?.time ?? 0);
        if (route && route.arriveAt <= RULES.marchMs) {
          const element = elementAt(game.level, game.round, route.arriveAt);
          const hazard = element?.affectedNodes.includes(to.id);
          moves.push({ from: from.id, to: to.id, path: route.path, seconds: Number((route.duration / 1000).toFixed(2)),
            arrivesAtMs: Math.round(route.arriveAt),
            ...(hazard && element.arrivalLoss ? { arrivalLoss: element.arrivalLoss } : {}),
            ...(hazard && element.shield ? { possibleDefenderShield: element.shield } : {}),
          });
        }
      }
    }
  }
  const forecast = [];
  if (view.element) {
    for (let atMs = view.element.nextAtMs; atMs <= RULES.marchMs; atMs += view.element.periodMs) {
      const { pulse, label, detail, speed, edgeSpeed, closed, revealFlights, arrivalLoss, shield } =
        elementAt(game.level, view.elementRound, atMs);
      forecast.push({ atMs, label: pulse?.label ?? label, detail, speed, edgeSpeed, closed, revealFlights, arrivalLoss, shield, pulse });
    }
  }
  return {
    level: { id: game.level.id, title: game.level.title, layout: game.level.layout, objective: game.nodes.pass.name },
    round: view.round, points: view.you.points, hold: view.hold, element: view.element,
    elementRound: view.elementRound, elementForecast: forecast,
    nodes: view.nodes.map(({ id, name, kind, x, y, owner, troops, available, scouted }) => ({
      id, name, kind, x, y, owner: owner ?? 'neutral', troops, ...(owner === 'red' ? { available } : {}), scouted,
    })),
    links: game.level.links, roads: view.roads, moves,
    scoutTargets: view.legal.scout, buildOptions: view.legal.build,
    secondsRemaining: view.march ? (RULES.marchMs - view.march.time) / 1000 : null,
    visibleFlights: view.flights.map(flight => ({
      side: flight.side, to: flight.to, troops: flight.troops, secondsToArrival: (flight.arriveAt - view.march.time) / 1000,
    })),
  };
}
