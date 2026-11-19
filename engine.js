import { applyAction, createGame, finishModelStep, modelPosition, modelStep, tick, viewFor } from './game.js';
import { askModel, isRecord, ModelError } from './model.js';
import { getLevel } from './levels.js';

const now = () => performance.now();
let active = null;
let clock = null;

function touch(session) {
  session.version++;
  for (const wake of session.waiters) wake();
}

function snapshot(session) {
  const { endpoint, model, key, reasoningEffort } = session.config;
  return {
    ...viewFor(session.game, 'blue', now()),
    version: session.version, ai: session.ai,
    config: { endpoint, model, hasKey: Boolean(key),
      reasoningEffort: reasoningEffort ?? null, reasoningResolved: reasoningEffort !== undefined },
  };
}

function waitForChange(session, signal) {
  return new Promise((done, reject) => {
    let timer;
    const wake = () => {
      clearTimeout(timer);
      session.waiters.delete(wake);
      signal?.removeEventListener('abort', onAbort);
      done();
    };
    const onAbort = () => {
      wake();
      reject(new DOMException('请求已取消。', 'AbortError'));
    };
    timer = setTimeout(wake, 17_000);
    session.waiters.add(wake);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function getModelOrders(step, decision) {
  if (step === 'build') return decision.actions.slice(0, 12);
  const orders = step === 'plan' ? decision.orders.slice(0, 20) : decision.reserve ? [decision.reserve] : [];
  return orders.map(order => isRecord(order) ? {
    type: step === 'plan' ? 'order' : 'reserve', from: order.from, to: order.to,
    count: typeof order.count === 'string' && /^\d{1,3}$/.test(order.count) ? Number(order.count) : order.count,
  } : null);
}

function refresh(session) {
  if (tick(session.game, now())) touch(session);
  const step = modelStep(session.game);
  if (!step || session.job || session.ai.state === 'error') return;
  const job = { abort: new AbortController(), step };
  session.job = job;
  session.ai = { state: 'thinking', step };
  touch(session);
  void runModel(session, job);
}

async function runModel(session, job) {
  const { game, config } = session;
  const { step } = job;
  const ask = stage => askModel(config, stage, modelPosition(game, step, now()), job.abort.signal);
  try {
    let decision = await ask(step);
    if (session.job !== job) return;
    if (step === 'plan' && typeof decision.scout === 'string') {
      const scout = applyAction(game, 'red', { type: 'scout', node: decision.scout }, now());
      if (scout.ok) {
        decision = await ask('replan');
        if (session.job !== job) return;
      }
    }
    const options = getModelOrders(step, decision);
    let accepted = 0;
    for (const option of options) {
      if (!isRecord(option)) continue;
      // Only the phase's allowlisted game actions may be submitted by the model.
      if (step === 'build' && option.type !== 'road' && option.type !== 'recruit') continue;
      if (applyAction(game, 'red', option, now()).ok) accepted++;
    }
    if (options.length && !accepted) throw new ModelError('模型没有给出当前可执行的指令。可重试本阶段。');
    finishModelStep(game, step, now());
    session.job = null;
    session.ai = { state: 'done', step };
    touch(session);
  } catch (error) {
    if (session.job !== job) return;
    session.job = null;
    session.ai = { state: 'error', step,
      message: error instanceof ModelError ? error.message : '模型请求失败，请重试本阶段。' };
    touch(session);
  }
}

function handleAction(session, input) {
  const { id, phaseId, action } = input;
  if (!isRecord(action) || typeof id !== 'string' || id.length < 1 || id.length > 100) {
    return { ok: false, error: '无法读取这条指令。' };
  }
  if (session.recent.has(id)) return session.recent.get(id);
  const game = session.game;
  let result;
  if (phaseId !== game.phaseId) {
    result = { ok: false, error: '阶段已更新，请重新下令。' };
  } else if (action.type === 'retry') {
    result = session.ai.state === 'error'
      ? { ok: true } : { ok: false, error: '目前没有等待重试的模型回合。' };
    if (result.ok) session.ai = { state: 'idle' };
  } else if (action.type === 'level' || (action.type === 'rematch' && game.phase === 'ended')) {
    const level = action.type === 'rematch' ? game.level : getLevel(action.levelId);
    if (level) {
      session.job?.abort.abort();
      session.job = null;
      session.game = createGame(level.id);
      session.game.phaseId = game.phaseId + 1;
      session.ai = { state: 'idle' };
      result = { ok: true };
    } else result = { ok: false, error: '请选择有效关卡。' };
  } else {
    result = applyAction(game, 'blue', action, now());
  }
  session.recent.set(id, result);
  if (session.recent.size > 100) session.recent.delete(session.recent.keys().next().value);
  if (result.ok) {
    touch(session);
    refresh(session);
  }
  return result;
}

function startClock() {
  if (!clock) clock = setInterval(() => { if (active) refresh(active); }, 80);
}

export function session(token) {
  return active && token && active.token === token ? active : null;
}

export function createSession(levelId, config) {
  if (active) {
    active.job?.abort.abort();
    active.job = null;
    touch(active);
  }
  active = {
    token: crypto.randomUUID(), config, game: createGame(levelId),
    version: 1, waiters: new Set(), recent: new Map(), ai: { state: 'idle' }, job: null,
  };
  startClock();
  refresh(active);
  return active;
}

export function applyConfig(session, config) {
  session.job?.abort.abort();
  session.job = null;
  session.config = config;
  session.ai = { state: 'idle' };
  touch(session);
  refresh(session);
}

export { refresh, snapshot, waitForChange, handleAction };
