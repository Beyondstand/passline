import { createBoard, createMapPreview } from './board.js';
import { PHASES, RULES, SIDE_NAME, adjacent, edgeKey } from './rules.js';
import { BAGUA, CLASSIC, DEFAULT_LEVEL, elementAt, getLevel, markedEdge, travelFor } from './levels.js';
import { createProfileEditor } from './profile-form.js';
import { route } from './api.js';

const $ = selector => document.querySelector(selector);
const sessionKey = 'passline-session';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const modeSets = { plan: [['move', '下令'], ['scout', '侦察']], build: [['recruit', '征兵'], ['road', '修路']] };
const compassSlots = { 西北: 'nw', 北: 'n', 东北: 'ne', 西: 'w', 东: 'e', 西南: 'sw', 南: 's', 东南: 'se' };
let token = getSession();
let view = null;
let previewLevel = levelFromHash() ?? getLevel(DEFAULT_LEVEL);
let currentLevel = previewLevel;
let pendingLevel = currentLevel;
let atBattle = Boolean(levelFromHash());
let levelNotice = '';
let nodes = {};
let clockReceivedAt = 0;
let mode = 'move';
let selection = {};
let ratio = .5;
let busy = false;
let command = null;
let notice = null;
let pollController = null;
let logSignature = '';
let requestNumber = 0;

function levelFromHash() {
  const match = /^#battle\/([a-z]+)$/.exec(window.location.hash);
  return match ? getLevel(match[1]) : null;
}

function getSession() {
  try { return sessionStorage.getItem(sessionKey); } catch { return null; }
}

function saveSession(value) {
  token = value;
  try {
    if (value) sessionStorage.setItem(sessionKey, value);
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // The open page can still use the in-memory session.
  }
}

function text(selector, value) {
  const element = $(selector);
  if (element.textContent !== String(value)) element.textContent = value;
}

function tag(name, content, className) {
  const element = document.createElement(name);
  if (className) element.className = className;
  element.textContent = content;
  return element;
}

async function api(path, { payload, signal } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return route(path, { method: payload ? 'POST' : 'GET', headers, payload, signal });
}

function getTime() {
  if (!view?.march) return 0;
  if (view.march.paused) return view.march.time;
  const limit = view.march.aiHandled ? RULES.marchMs : RULES.aiDecisionMs;
  return Math.min(limit, view.march.time + Math.max(0, performance.now() - clockReceivedAt));
}

function setView(next) {
  if (view && next.version < view.version) return;
  if (view && next.version === view.version && next.march?.time < view.march?.time) return;
  if (view?.phaseId !== next.phaseId) {
    mode = next.phase === 'build' ? 'recruit' : 'move';
    selection = {};
    notice = null;
  }
  if (view?.levelId !== next.levelId || next.round < view?.round) logSignature = '';
  view = next;
  currentLevel = getLevel(next.levelId) ?? CLASSIC;
  clockReceivedAt = performance.now();
  nodes = Object.fromEntries(next.nodes.map(node => [node.id, node]));
  render();
}

async function listen() {
  pollController?.abort();
  if (!token) return;
  const controller = new AbortController();
  pollController = controller;
  while (!controller.signal.aborted) {
    try {
      const after = view?.version ?? 0;
      const data = await api(`/api/state?after=${after}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (notice?.offline) notice = null;
      setView(data.view);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 404) {
        view = null;
        nodes = {};
        currentLevel = previewLevel;
        selection = {};
        notice = null;
        saveSession(null);
        setupForm.editor.fill();
        render();
        setFeedback($('#setup-form form'), error.message, true);
        return;
      }
      notice = { message: error.message, error: true, offline: true };
      render();
      await pause(1100);
    }
  }
}

async function sendAction(action) {
  if (!view || busy) return false;
  const payload = {
    id: window.crypto?.randomUUID?.() ?? `${Date.now()}-${++requestNumber}`,
    phaseId: view.phaseId,
    action,
  };
  busy = true;
  notice = null;
  render();
  try {
    const data = await api('/api/action', { payload });
    setView(data.view);
    return true;
  } catch (error) {
    if (error.view) setView(error.view);
    notice = { message: error.message, error: true };
    return false;
  } finally {
    busy = false;
    render();
  }
}

function setFeedback(form, message, error = false) {
  const feedback = form.querySelector('.api-feedback');
  feedback.textContent = message;
  feedback.hidden = !message;
  feedback.classList.toggle('error', error);
}

const bindProfile = createProfileEditor(api);

function mountForm(container, inGame) {
  container.append($('#api-form').content.cloneNode(true));
  const form = container.querySelector('form');
  const submit = form.querySelector('.submit-api');
  const test = form.querySelector('.test-api');
  const editor = bindProfile(form);
  submit.textContent = inGame ? '应用到本局' : '开始对战';
  const settings = () => ({
    endpoint: form.elements.endpoint.value, model: form.elements.model.value,
    key: form.elements.key.value,
    ...(!inGame ? { levelId: currentLevel.id } : {}),
  });
  const lock = locked => { submit.disabled = locked; test.disabled = locked; };
  test.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    lock(true);
    setFeedback(form, '正在请求模型…');
    try {
      const payload = settings();
      await editor.flush();
      const result = await api('/api/test', { payload });
      setFeedback(form, result.reasoningEffort
        ? `连接成功，已请求推理档 ${result.reasoningEffort}。`
        : '连接成功，推理档由接口默认配置决定。');
    } catch (error) {
      setFeedback(form, error.message, true);
    } finally {
      lock(false);
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    lock(true);
    setFeedback(form, inGame ? '正在应用…' : '正在创建对局…');
    try {
      const payload = settings();
      await editor.flush();
      const data = await api(inGame ? '/api/config' : '/api/game', { payload });
      form.elements.key.value = '';
      if (inGame) {
        $('#api-dialog').close();
      } else {
        pollController?.abort();
        saveSession(data.token);
        view = null;
      }
      setView(data.view);
      if (!inGame) void listen();
      setFeedback(form, '');
    } catch (error) {
      setFeedback(form, error.message, true);
    } finally {
      lock(false);
    }
  });
  return { form, editor };
}

const drawPreview = createMapPreview($('#level-preview'));

function renderAtlas() {
  const level = pendingLevel;
  for (const option of document.querySelectorAll('[data-level]')) {
    option.setAttribute('aria-pressed', String(option.dataset.level === level.id));
  }
  $('#select-classic').setAttribute('aria-pressed', String(level.id === CLASSIC.id));
  text('#level-title', level.title);
  text('#level-symbol', level.symbol ?? '◇');
  text('#level-meta', `${level.layout} · ${level.nodes.length} 个据点`);
  text('#level-brief', level.brief);
  $('#level-element').hidden = !level.effect;
  if (level.effect) {
    text('#level-element-label', `${level.trigram} · ${level.image} · ${level.phase}`);
    text('#level-summary', level.effect.summary);
  }
  $('#level-screen').style.setProperty('--map-accent', level.accent);
  $('#level-preview').setAttribute('aria-label', `${level.title}地图预览，${level.layout}`);
  drawPreview(level);
  const selectedActive = view && level.id === view.levelId;
  const play = selectedActive ? view.phase === 'ended' ? '再战此关' : '继续对局'
    : view ? '在此关开新局' : '进入关卡';
  text('#confirm-level', play);
  $('#confirm-level').disabled = busy;
  $('#resume-battle').hidden = !view;
  text('#resume-battle', view?.phase === 'ended' ? '查看战果' : '返回对局');
  $('#level-notice').hidden = !levelNotice;
  text('#level-notice', levelNotice);
}

function syncScreen() {
  const level = levelFromHash();
  const changingScreen = atBattle !== Boolean(level);
  atBattle = Boolean(level);
  if (level) {
    previewLevel = level;
    if (!view && currentLevel !== level) {
      currentLevel = level;
      selection = {};
    }
  }
  render();
  if (changingScreen) {
    window.scrollTo(0, 0);
    $(atBattle ? '#phase-title' : '#atlas-title').focus({ preventScroll: true });
  }
}

function openBattle(level) {
  if (window.location.hash === `#battle/${level.id}`) syncScreen();
  else window.location.hash = `battle/${level.id}`;
}

function openAtlas() {
  pendingLevel = currentLevel;
  levelNotice = '';
  if (window.location.hash === '#levels') syncScreen();
  else window.location.hash = 'levels';
}

function chooseLevel(level) {
  pendingLevel = level;
  levelNotice = '';
  renderAtlas();
}

function mountLevels() {
  const grid = $('#level-grid');
  for (const [direction, slot] of Object.entries(compassSlots)) {
    const level = BAGUA.find(item => item.direction === direction);
    const option = tag('button', '', 'level-option');
    option.type = 'button';
    option.dataset.level = level.id;
    option.style.gridArea = slot;
    option.style.setProperty('--level-accent', level.accent);
    const symbol = tag('span', level.symbol, 'level-symbol');
    symbol.setAttribute('aria-hidden', 'true');
    const heading = tag('span', '', 'level-card-heading');
    heading.append(symbol, tag('span', direction, 'level-direction'));
    option.append(heading, tag('strong', level.title), tag('small', `${level.trigram} · ${level.image.split('（')[0]}`));
    option.addEventListener('click', () => chooseLevel(level));
    grid.append(option);
  }
  $('#select-classic').addEventListener('click', () => chooseLevel(CLASSIC));
  $('#resume-battle').addEventListener('click', () => {
    if (view) openBattle(currentLevel);
  });
  $('#confirm-level').addEventListener('click', async () => {
    const level = pendingLevel;
    const same = view?.levelId === level.id;
    const action = !view ? null : same && view.phase === 'ended' ? { type: 'rematch' }
      : !same ? { type: 'level', levelId: level.id } : null;
    levelNotice = '';
    if (action && !await sendAction(action)) {
      levelNotice = notice?.message ?? '暂时无法进入关卡，请重试。';
      renderAtlas();
      return;
    }
    openBattle(level);
  });
}

mountLevels();
const setupForm = mountForm($('#setup-form'), false);
const settingsForm = mountForm($('#settings-form'), true);

function showSettings() {
  if (!view) return;
  settingsForm.editor.fill(view.config);
  setFeedback(settingsForm.form, '');
  $('#api-dialog').showModal();
}

function showGuide() {
  const level = atBattle ? currentLevel : pendingLevel;
  $('#guide-level').style.setProperty('--guide-accent', level.accent);
  text('#guide-level-title', level.effect ? `${level.symbol} ${level.title} · ${level.image}` : level.title);
  text('#guide-level-layout', level.brief);
  text('#guide-level-effect', level.effect?.summary ?? '');
  $('#guide-level-effect').hidden = !level.effect;
  $('#guide-level-hint').hidden = !level.effect;
  $('#rules-dialog').showModal();
}

$('#show-api').addEventListener('click', showSettings);
$('#fix-api').addEventListener('click', showSettings);
$('#show-levels').addEventListener('click', openAtlas);
$('#map-level').addEventListener('click', openAtlas);
window.addEventListener('hashchange', syncScreen);
$('#jump-setup').addEventListener('click', () => $('#setup').scrollIntoView({ block: 'start' }));
$('#show-rules').addEventListener('click', showGuide);
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#retry-model').addEventListener('click', () => void sendAction({ type: 'retry' }));
$('#command-action').addEventListener('click', () => { if (command) void sendAction(command.action); });
$('#ready').addEventListener('click', () => {
  if (view?.phase === 'ended') void sendAction({ type: 'rematch' });
  else if (view) void sendAction({ type: 'ready', value: !view.you.ready });
});
for (const button of document.querySelectorAll('[data-ratio]')) {
  button.addEventListener('click', () => {
    ratio = Number(button.dataset.ratio);
    render();
  });
}

function changeMode(next) {
  if (next === mode) return;
  mode = next;
  selection = { focus: selection.focus };
  notice = null;
  render();
}

function isMoveMode() {
  return view?.phase === 'march' || (view?.phase === 'plan' && mode === 'move');
}

function canMove() {
  if (!isMoveMode() || view.you.ready || busy) return false;
  return view.phase !== 'march' || (!view.you.reserveUsed && !view.march.paused);
}

function getRoute(from, to) {
  return from && to
    ? travelFor(currentLevel, view.round, nodes, view.roads, 'blue', from, to, getTime())
    : null;
}

function countFrom(id) {
  const troops = nodes[id]?.available ?? 0;
  return troops > 0 ? Math.max(1, Math.floor(troops * ratio)) : 0;
}

function buildLink(from, to) {
  if (!from || !to) return false;
  return view.legal.build.road.some(([a, b]) => edgeKey(a, b) === edgeKey(from, to));
}

function selectNode(id) {
  if (!view) return;
  const node = nodes[id];
  notice = null;
  if (isMoveMode() && (view.phase === 'plan' || !view.you.reserveUsed)) {
    const from = selection.from;
    if (from && id !== from && (getRoute(from, id) || adjacent(from, id, currentLevel.links))) selection = { from, to: id, focus: id };
    else if (from === id) selection = { focus: id };
    else selection = { focus: id, from: node.available > 0 ? id : undefined };
  } else if (view.phase === 'build' && mode === 'road') {
    const from = selection.from;
    if (buildLink(from, id)) selection = { from, to: id, focus: id };
    else selection = { focus: id, from: from !== id && node.owner === 'blue' ? id : undefined };
  } else {
    selection = { focus: id };
  }
  render();
}

function dragOrder(from, to) {
  if (!canMove()) return;
  selection = { from, to, focus: to };
  const route = getRoute(from, to);
  if (!route) {
    notice = { message: '请选择开放的相邻目标或连通的己方道路。', error: true };
    render();
    return;
  }
  const count = countFrom(from);
  if (count) void sendAction({ type: view.phase === 'plan' ? 'order' : 'reserve', from, to, count });
}

const board = createBoard({
  onSelect: selectNode, onDrag: dragOrder, getTime,
  canDrag: id => canMove() && nodes[id]?.available > 0,
});

function renderOverview() {
  text('#turn-number', view ? `第 ${view.round} 回合` : '对战准备');
  const endNames = { blue: '你获胜了', red: '模型获胜', draw: '本局平局' };
  text('#phase-title', !view ? currentLevel.title : endNames[view.winner] || PHASES[view.phase]);
  $('#turn-values').hidden = !view;
  $('#clock-box').hidden = view?.phase !== 'march';
  document.querySelectorAll('[data-phase]').forEach(item => {
    const active = item.dataset.phase === view?.phase;
    item.classList.toggle('current', active);
    if (active) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  if (!view) return;
  text('#points', view.you.points);
  $('#hold-status').hidden = false;
  text('#hold-blue', `${view.hold.blue}/${RULES.keepRounds}`);
  text('#hold-red', `${view.hold.red}/${RULES.keepRounds}`);
}

function renderModel() {
  const status = view.ai.state;
  const phaseStatus = {
    plan: ['正在拟定行军计划', '行军命令已就绪'],
    reserve: ['正在决定是否追加出兵', '增援决策已完成'],
    build: ['正在安排征兵和道路', '建设命令已完成'],
  };
  let label = view.phase === 'ended' ? '本局结束' : 'API 已配置';
  if (view.phase !== 'ended') {
    if (status === 'thinking') label = phaseStatus[view.ai.step][0];
    else if (status === 'error') label = '等待重试';
    else if (status === 'done') {
      label = view.phase === 'march' && view.ai.step === 'plan' ? '正在观察行军' : phaseStatus[view.ai.step][1];
    }
  }
  $('#model-status').className = `model-status ${status}`;
  text('#model-name', view.config.model);
  text('#model-state', label);
  text('#model-effort', view.config.reasoningEffort ? `最高档已请求 · ${view.config.reasoningEffort}`
    : view.config.reasoningResolved ? '接口默认推理档' : '自动请求最高推理档');
  $('#model-error').hidden = status !== 'error';
  text('#model-message', view.ai.message || '');
  $('#retry-model').disabled = busy;
}

function displaySelection(title, detail) {
  $('#selection').replaceChildren(tag('strong', title), tag('span', detail));
}

function describeNode(node) {
  const type = node.kind === 'hq' ? '指挥部' : node.kind === 'gate' ? '中央关口' : '据点';
  const troops = node.troops === null ? '兵力未知' : `${node.troops} 兵`;
  return `${SIDE_NAME[node.owner ?? 'neutral']} · ${type} · ${troops}${node.scouted ? ' · 已侦察' : ''}`;
}

function setCommand(label, action, { canUse = true } = {}) {
  command = { label, action, canUse };
}

function routeDetail(from, to, route) {
  const time = (route.duration / 1000).toFixed(1);
  const onArrival = elementAt(currentLevel, view.round, route.arriveAt);
  const marked = onArrival?.affectedNodes.includes(to);
  const details = [`可用 ${nodes[from].available} 兵`, `预计 ${time} 秒抵达`];
  if (marked && onArrival.arrivalLoss) details.push(`火线 −${onArrival.arrivalLoss} 兵`);
  if (marked && onArrival.shield && nodes[to].owner !== 'blue' && nodes[to].owner !== null) {
    details.push(`守方可能有 ${onArrival.shield} 点屏障`);
  }
  return details.join(' · ');
}

function showMovement(focus, route) {
  const planning = view.phase === 'plan';
  const { from, to } = selection;
  const element = elementAt(currentLevel, view.round, getTime());
  if (route) {
    const count = countFrom(from);
    displaySelection(`${nodes[from].name} 至 ${nodes[to].name}`, routeDetail(from, to, route));
    setCommand(planning ? `安排 ${count} 兵` : `追加 ${count} 兵`,
      { type: planning ? 'order' : 'reserve', from, to, count },
      { canUse: count > 0 && canMove() });
  } else if (from && to && element?.closed && markedEdge(element, from, to)) {
    displaySelection(`${nodes[from].name} 至 ${nodes[to].name}`, '山道当前封闭。可以绕路，或等进度条走完。');
  } else if (focus) {
    displaySelection(focus.name, from === focus.id ? `可用 ${focus.available} 兵 · 请选择可到达的目标` : describeNode(focus));
  } else {
    displaySelection(planning ? '选择出兵据点' : '选择增援起点', '点选起点和目标，或拖拽据点直接出兵。');
  }
}

function showOtherControls(focus) {
  if (focus) displaySelection(focus.name, describeNode(focus));
  if (mode === 'scout') {
    if (!focus) displaySelection('选择侦察目标', '点击相邻据点。每轮可用一次，消耗 1 行动点。');
    setCommand('侦察 · 1 点', { type: 'scout', node: focus?.id }, { canUse: view.legal.scout.includes(focus?.id) });
  } else if (mode === 'recruit') {
    if (!focus) displaySelection('选择征兵地点', '可在己方指挥部和中央关口征兵。');
    setCommand('征募 3 兵 · 1 点', { type: 'recruit', node: focus?.id }, { canUse: view.legal.build.recruit.includes(focus?.id) });
  } else {
    const { from, to } = selection;
    if (buildLink(from, to)) displaySelection(`${nodes[from].name} 与 ${nodes[to].name}`, '建成后，沿己方道路调兵每段只需 1.5 秒。');
    else if (!focus) displaySelection('连接己方据点', '点选两座相邻的己方据点。');
    else if (from) displaySelection(focus.name, '选择另一座相邻的己方据点。');
    setCommand('修建道路 · 1 点', { type: 'road', from, to }, { canUse: buildLink(from, to) });
  }
}

function renderModes() {
  const bar = $('#mode-bar');
  const modes = modeSets[view.phase] || [];
  const modeKey = `${view.phase}:${mode}`;
  if (bar.dataset.current === modeKey) return;
  bar.dataset.current = modeKey;
  bar.replaceChildren(...modes.map(([id, label]) => {
    const button = tag('button', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(mode === id));
    button.addEventListener('click', () => changeMode(id));
    return button;
  }));
}

function renderOrders() {
  const active = view.phase === 'plan' && view.you.orders.length > 0;
  $('#planned').hidden = !active;
  if (!active) return;
  text('#planned-count', view.you.orders.length);
  $('#orders').replaceChildren(...view.you.orders.map(order => {
    const row = tag('li', '');
    const label = tag('span', `${nodes[order.from].name} 至 ${nodes[order.to].name} · ${order.count} 兵`);
    const cancel = tag('button', '撤销');
    cancel.type = 'button';
    cancel.disabled = busy || view.you.ready;
    cancel.addEventListener('click', () => void sendAction({ type: 'cancel', id: order.id }));
    row.append(label, cancel);
    return row;
  }));
}

function renderCommand() {
  command = null;
  const phase = view.phase;
  const ended = phase === 'ended';
  const marching = phase === 'march';
  $('#command-body').hidden = ended;
  const title = { plan: '下达指令', march: '追加出兵', build: '战后建设', ended: '本局战果' };
  const note = {
    plan: view.you.ready ? '你的命令已就绪。可在模型确认前继续调整。' : '预设命令会在行军开始时同时执行。',
    march: view.march?.paused ? '模型决策期间，双方的行军时钟暂停。' : view.you.reserveUsed ? '本轮追加出兵已用。' : '每轮可临时加派一支部队。',
    build: view.you.ready ? '你的建设已确认，等待模型。' : '用行动点补充兵力，或修路缩短增援时间。',
    ended: view.endReason,
  };
  text('#command-title', title[phase]);
  text('#command-note', note[phase]);
  renderModel();
  const focus = nodes[selection.focus];
  const route = isMoveMode() ? getRoute(selection.from, selection.to) : null;
  if (!ended) {
    renderModes();
    if (isMoveMode()) showMovement(focus, route);
    else showOtherControls(focus);
  }
  $('#ratios').hidden = ended || !isMoveMode() || (marching && view.you.reserveUsed);
  for (const button of document.querySelectorAll('[data-ratio]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.ratio) === ratio));
  }
  const commandButton = $('#command-action');
  commandButton.hidden = !command || ended || (marching && view.you.reserveUsed);
  if (command) text('#command-action', command.label);
  renderOrders();
  const ready = $('#ready');
  ready.hidden = marching;
  ready.disabled = busy;
  text('#ready', ended ? '再战一局' : view.you.ready ? '继续调整' : phase === 'plan' ? '开始行军' : '进入下一轮');
  $('#action-notice').hidden = !notice;
  $('#action-notice').classList.toggle('error', Boolean(notice?.error));
  text('#action-notice', notice?.message || '');
  return route?.path || (phase === 'build' && buildLink(selection.from, selection.to) ? [selection.from, selection.to] : null);
}

function renderLog() {
  const key = view.events.map(event => event.id).join(',');
  text('#log-round', `第 ${view.round} 回合`);
  if (key === logSignature) return;
  const list = $('#log');
  list.replaceChildren(...view.events.slice().reverse().map(event => tag('li', event.text, event.kind)));
  logSignature = key;
}

function renderClock() {
  const march = view?.phase === 'march';
  renderElement(march);
  if (!view) return;
  if (march) {
    const seconds = Math.max(0, RULES.marchMs - getTime()) / 1000;
    text('#clock', `${seconds.toFixed(1)}s`);
    text('#clock-label', view.march.paused ? '计时暂停' : '剩余行军');
    $('#clock-box').classList.toggle('paused', view.march.paused);
  }
  if (command) {
    const { from, to } = command.action;
    const currentRoute = march && getRoute(from, to);
    const isLate = march && currentRoute && currentRoute.arriveAt > RULES.marchMs;
    $('#command-action').disabled = busy || view.you.ready || !command.canUse || isLate || (march && !currentRoute);
    if (march && !view.you.reserveUsed) {
      text('#command-action', isLate ? '剩余时间不足' : currentRoute ? command.label : '路径暂时封闭');
      if (currentRoute && selection.from === from && selection.to === to) text('#selection span', routeDetail(from, to, currentRoute));
    }
  }
}

function renderElement(march) {
  const element = march ? elementAt(currentLevel, view.elementRound, getTime())
    : view?.element ?? elementAt(currentLevel, 1);
  $('#element-panel').hidden = !element;
  if (!element) return;
  const time = getTime();
  const endsBeforeChange = march && element.nextAtMs > RULES.marchMs;
  const next = march ? endsBeforeChange ? '本轮结束' : element.nextLabel
    : view?.phase === 'build' ? '下轮开场' : '开场效果';
  const seconds = ((endsBeforeChange ? RULES.marchMs - time : element.nextInMs) / 1000).toFixed(1);
  text('#element-symbol', element.symbol);
  text('#element-terrain', `${element.trigram} · ${element.image.split('（')[0]} ／ ${element.fivePhase} · ${element.direction}`);
  text('#element-state', element.label);
  text('#element-next', next);
  text('#element-clock', march ? `${seconds}s` : `${element.periodMs / 1000}s / 段`);
  text('#element-detail', element.detail);
  const progress = $('#element-progress');
  progress.value = element.progress;
  progress.setAttribute('aria-valuetext', march ? `${element.label}，距${next} ${seconds} 秒` : element.label);
}

function render() {
  const playing = Boolean(view);
  $('#level-screen').hidden = atBattle;
  $('#battle-screen').hidden = !atBattle;
  $('#show-levels').hidden = !atBattle;
  $('#show-api').hidden = !atBattle || !playing;
  $('#jump-setup').hidden = !atBattle || playing;
  if (!atBattle) {
    renderAtlas();
    return;
  }
  $('.layout').classList.toggle('playing', playing);
  $('#setup').hidden = playing;
  $('#command-panel').hidden = !playing;
  $('#log-card').hidden = !playing;
  $('#hold-status').hidden = !playing;
  text('#map-level', currentLevel.effect
    ? `${currentLevel.symbol} ${currentLevel.trigram} · ${currentLevel.image.split('（')[0]}` : '风门关 · 经典');
  const gateName = currentLevel.nodes.find(node => node.id === 'pass').name;
  text('#objective-title', `夺取${gateName}`);
  $('.map-card').style.setProperty('--element-accent', currentLevel.accent);
  $('#element-key').hidden = !currentLevel.effect?.nodes && !currentLevel.effect?.edges;
  renderOverview();
  const path = view ? renderCommand() : null;
  const instructions = {
    plan: '点选据点安排指令，或直接拖拽出兵。',
    march: '部队沿路径行军，到达时增援或交战。',
    build: '点选己方基地征兵，或连接己方据点。',
    ended: '本局已经结算。',
  };
  text('#map-instruction', playing ? instructions[view.phase] : '侦察、调兵与攻占都在这张地图上进行。');
  board.update(view, { ...selection, path }, currentLevel);
  if (view) renderLog();
  renderClock();
}

setInterval(() => { if (atBattle && view?.phase === 'march') renderClock(); }, 85);
render();
if (token) void listen();
