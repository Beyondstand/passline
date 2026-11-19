import { SIDE_NAME, boardSize, edgeKey } from './rules.js';
import { CLASSIC, elementAt } from './levels.js';
import { drawTerrain } from './terrain.js';

const { width, height } = boardSize;
const colors = { blue: '#78e2d6', red: '#ff9589', neutral: '#e8be82' };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const scenes = new Map();

function getScene(level) {
  if (!scenes.has(level.id)) {
    const positions = Object.fromEntries(level.nodes.map(node => [node.id, node]));
    const bends = new Map((level.curves ?? []).map(([from, to, x, y]) => [edgeKey(from, to), { x, y }]));
    scenes.set(level.id, { level, positions, bends, terrain: drawTerrain(level) });
  }
  return scenes.get(level.id);
}

function surfaceWidth(canvas, ctx) {
  const cssWidth = canvas.clientWidth, cssHeight = canvas.clientHeight;
  if (!cssWidth || !cssHeight) return 0;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(cssWidth * ratio), pixelHeight = Math.round(cssHeight * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  return cssWidth;
}

function controlPoint(scene, from, to) {
  const offset = scene.bends.get(edgeKey(from, to));
  if (!offset) return null;
  const a = scene.positions[from], b = scene.positions[to];
  return { x: (a.x + b.x) / 2 + offset.x, y: (a.y + b.y) / 2 + offset.y };
}

function stroke(ctx, a, b, color, weight, dash = [], control = null) {
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (control) ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
  else ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintMap(ctx, scene, element, roads, cssWidth) {
  const { level, positions, terrain } = scene;
  ctx.drawImage(terrain, 0, 0);
  ctx.lineCap = 'round';
  for (const [from, to] of level.links) {
    const a = positions[from], b = positions[to];
    const curve = controlPoint(scene, from, to);
    stroke(ctx, a, b, '#061523bc', 8, [], curve);
    stroke(ctx, a, b, '#c4d3dba6', 1.9, [3, 6], curve);
  }
  for (const { from, to, owner } of roads) {
    const a = positions[from], b = positions[to];
    const curve = controlPoint(scene, from, to);
    stroke(ctx, a, b, colors[owner] + 'aa', 5.4, [], curve);
    stroke(ctx, a, b, '#172a35', 2.6, [], curve);
    stroke(ctx, a, b, colors[owner] + '9c', 1.2, [3, 5], curve);
  }
  if (!element) return;
  for (const [from, to] of element.affectedEdges) {
    const color = element.closed ? '#ff9589' : level.accent + 'cf';
    stroke(ctx, positions[from], positions[to], color, 4, [4, 7], controlPoint(scene, from, to));
  }
  const radius = Math.max(31, 21 * width / cssWidth);
  for (const id of element.affectedNodes) {
    const { x, y } = positions[id];
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = level.accent + 'ad';
    ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawPreviewNode(ctx, node, showLabels) {
  const color = colors[node.owner ?? 'neutral'];
  const radius = node.kind === 'outpost' ? 15 : 21;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI * i / 3;
    const x = node.x + radius * Math.cos(angle), y = node.y + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#0d1d29';
  ctx.strokeStyle = color;
  ctx.lineWidth = node.kind === 'gate' ? 3 : 2.3;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  if (node.kind === 'gate') {
    ctx.fillRect(node.x - 5, node.y - 5, 10, 10);
  } else if (node.kind === 'hq') {
    ctx.fillRect(node.x - 7, node.y - 4, 14, 8);
  } else {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (showLabels) {
    ctx.font = 'bold 19px "Microsoft YaHei UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0b1523eb';
    ctx.fillStyle = '#e9f0f4';
    ctx.strokeText(node.name, node.x, node.y + radius + 7);
    ctx.fillText(node.name, node.x, node.y + radius + 7);
  }
}

export function createMapPreview(canvas) {
  const ctx = canvas.getContext('2d');
  let selected = null;
  let drawn = null;
  function render() {
    if (!selected) return;
    const cssWidth = surfaceWidth(canvas, ctx);
    if (!cssWidth) return;
    const scene = getScene(selected);
    paintMap(ctx, scene, elementAt(selected, 1), selected.startRoads, cssWidth);
    for (const node of selected.nodes) drawPreviewNode(ctx, node, cssWidth >= 440);
    drawn = selected;
  }
  new ResizeObserver(render).observe(canvas);
  return level => {
    selected = level;
    if (drawn !== level) render();
  };
}

function drawFlight(ctx, flight, time, scene) {
  const leg = flight.legs.find(part => time >= part.startAt && time < part.endAt);
  if (!leg) return;
  const a = scene.positions[leg.from], b = scene.positions[leg.to];
  const control = controlPoint(scene, leg.from, leg.to) ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const segment = leg.segments?.find(part => time >= part.startAt && time < part.endAt);
  const fraction = segment
    ? segment.fromProgress + (segment.toProgress - segment.fromProgress) * (time - segment.startAt) / (segment.endAt - segment.startAt)
    : (time - leg.startAt) / (leg.endAt - leg.startAt);
  const t = reducedMotion.matches ? .52 : .16 + fraction * .68;
  const u = 1 - t;
  const x = u * u * a.x + 2 * t * u * control.x + t * t * b.x;
  const y = u * u * a.y + 2 * t * u * control.y + t * t * b.y;
  const dx = u * (control.x - a.x) + t * (b.x - control.x);
  const dy = u * (control.y - a.y) + t * (b.y - control.y);
  const length = Math.hypot(dx, dy);
  const sideOffset = flight.side === 'blue' ? 9 : -9;
  const px = x - dy / length * sideOffset, py = y + dx / length * sideOffset;
  const color = colors[flight.side];

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(dy, dx));
  stroke(ctx, { x: -31, y: 0 }, { x: -5, y: 0 }, color + '62', 3);
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -7);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#0c1625';
  ctx.strokeStyle = color + 'bb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(px - 11, py - 30, 22, 18, 5);
  else ctx.rect(px - 11, py - 30, 22, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 14px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(flight.troops, px, py - 20.5);
}

export function createBoard({ onSelect, onDrag, canDrag, getTime }) {
  const stage = document.getElementById('map-stage');
  const canvas = document.getElementById('terrain');
  const layer = document.getElementById('map-nodes');
  const ctx = canvas.getContext('2d');
  const buttons = new Map();
  let scene = null;
  let state = null;
  let selected = {};
  let drag = null;
  let suppressClick = false;
  let dirty = true;
  let drawingMotion = false;

  function mountNodes(level) {
    buttons.clear();
    layer.replaceChildren();
    for (const node of level.nodes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.node = node.id;
      button.style.left = `${node.x / width * 100}%`;
      button.style.top = `${node.y / height * 100}%`;
      const tile = document.createElement('span');
      tile.className = 'tile';
      const number = document.createElement('span');
      number.className = 'node-number';
      const name = document.createElement('span');
      name.className = 'node-name';
      name.textContent = node.name;
      tile.append(number);
      button.append(tile, name);
      layer.append(button);
      buttons.set(node.id, { button, number });
      button.addEventListener('click', () => { if (!suppressClick) onSelect(node.id); });
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !canDrag(node.id)) return;
        drag = { id: node.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      });
    }
  }

  window.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    if (!drag.moved && Math.hypot(drag.x - event.clientX, drag.y - event.clientY) < 8) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    drag.moved = true;
    drag.point = { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
    dirty = true;
  });
  window.addEventListener('pointerup', event => {
    if (drag?.pointer !== event.pointerId) return;
    if (drag.moved) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-node]')?.dataset.node;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (target && target !== drag.id) onDrag(drag.id, target);
    }
    drag = null;
    dirty = true;
  });
  window.addEventListener('pointercancel', () => { drag = null; dirty = true; });
  new ResizeObserver(() => { dirty = true; }).observe(stage);

  function update(view, selection, level = CLASSIC) {
    if (scene?.level !== level) {
      scene = getScene(level);
      drag = null;
      mountNodes(level);
    }
    state = view;
    selected = selection;
    for (const node of view?.nodes ?? level.nodes) {
      const { button, number } = buttons.get(node.id);
      const owner = node.owner ?? 'neutral';
      const troops = !view && owner === 'red' ? null : node.troops;
      button.className = ['map-node', owner, node.kind,
        troops === null ? 'unknown' : '', node.scouted ? 'scouted' : '',
        node.id === selection.focus ? 'selected' : '',
        node.id === selection.from ? 'from' : '', node.id === selection.to ? 'target' : '',
      ].filter(Boolean).join(' ');
      const details = [node.name, SIDE_NAME[owner], troops === null ? '兵力未知' : `${troops} 兵`];
      const type = node.kind === 'hq' ? '指挥部' : node.kind === 'gate' ? '中央关口' : '据点';
      if (node.scouted) details.push('已侦察');
      button.setAttribute('aria-label', [...details, type].join('，'));
      button.title = details.join(' · ');
      number.textContent = troops ?? '?';
    }
    dirty = true;
  }

  function draw(cssWidth) {
    const { level, positions } = scene;
    const time = getTime();
    paintMap(ctx, scene, elementAt(level, state?.elementRound ?? 1, time), state?.roads ?? level.startRoads, cssWidth);
    const path = selected.path ?? [];
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1], to = path[i];
      stroke(ctx, positions[from], positions[to], '#a0ede1', 4.2, [7, 4], controlPoint(scene, from, to));
    }
    if (drag?.moved) stroke(ctx, positions[drag.id], drag.point, '#d1fbf2', 3, [6, 4]);
    for (const flight of state?.flights ?? []) drawFlight(ctx, flight, time, scene);
  }

  function frame() {
    const moving = Boolean(state?.flights.length && !state.march?.paused);
    if (scene && (dirty || moving || drawingMotion)) {
      const cssWidth = surfaceWidth(canvas, ctx);
      if (cssWidth) {
        draw(cssWidth);
        dirty = false;
      }
    }
    drawingMotion = moving;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { update };
}
