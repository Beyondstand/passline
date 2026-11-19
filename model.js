const TIMEOUT_MS = 150_000;
const EFFORTS = ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', null];

export class ModelError extends Error {}

export function normalizeEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new ModelError('API 地址需要包含 https:// 或 http://。');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ModelError('请填写 API 基础地址，或完整的 Chat Completions 地址。');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/chat/completions')
    ? pathname : `${pathname || '/v1'}/chat/completions`;
  return url.toString();
}

export function normalizeKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key.length > 2048 || /[^\x21-\x7e]/.test(key)) throw new ModelError('API 密钥格式有误。');
  return key;
}

export function readConfig(input, previous) {
  if (typeof input?.endpoint !== 'string' || typeof input?.model !== 'string') {
    throw new ModelError('请填写 API 地址和模型名。');
  }
  const model = input.model.trim();
  if (!model || model.length > 160) throw new ModelError('请填写服务商提供的模型名。');
  const endpoint = normalizeEndpoint(input.endpoint);
  const submittedKey = normalizeKey(input.key);
  const key = submittedKey || (input.reuseKey === true && endpoint === previous?.endpoint ? previous.key : '');
  const reasoningEffort = endpoint === previous?.endpoint && model === previous.model && key === previous.key
    ? previous.reasoningEffort : undefined;
  return { endpoint, model, key, reasoningEffort };
}

const apiErrors = {
  400: 'API 拒绝了请求，请检查模型名和接口兼容性。',
  401: 'API 鉴权失败，请检查密钥。',
  403: 'API 拒绝访问，请检查密钥权限或模型权限。',
  404: 'API 返回 404，请检查基础地址和模型名。',
  422: 'API 无法处理请求，请检查模型与 Chat Completions 的兼容性。',
  429: 'API 达到请求或配额上限，请稍后重试。',
};

function effortRejection(body) {
  const text = body.slice(0, 12_000).toLowerCase();
  if (!/reasoning[_ -]effort/.test(text)) return null;
  if (/supported values|allowed values|valid values|unsupported_value|invalid (?:enum|value)|one of|可选值/.test(text)) return 'value';
  if (/unsupported_parameter|unknown (?:parameter|field)|unrecognized|extra_forbidden|extra inputs|未知参数/.test(text)) return 'parameter';
  if (/unsupported|invalid|must be|unexpected|unavailable|does not support|not supported|不支持/.test(text)) return 'value';
  return null;
}

async function requestCompletion(config, messages, abort) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = abort ? AbortSignal.any([abort, timeout]) : timeout;
  let result;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.key) headers.Authorization = `Bearer ${config.key}`;
    for (let i = Math.max(0, EFFORTS.indexOf(config.reasoningEffort)); i < EFFORTS.length; i++) {
      const effort = EFFORTS[i];
      const body = { model: config.model, stream: false, messages };
      if (effort) body.reasoning_effort = effort;
      const response = await fetch(config.endpoint, {
        method: 'POST', redirect: 'error', headers, signal, body: JSON.stringify(body),
      });
      if (response.ok) {
        result = await response.json();
        config.reasoningEffort = effort;
        break;
      }
      if (effort && (response.status === 400 || response.status === 422)) {
        const rejected = effortRejection(await response.text());
        if (rejected) {
          if (rejected === 'parameter') i = EFFORTS.length - 2;
          continue;
        }
      } else {
        await response.body?.cancel();
      }
      throw new ModelError(apiErrors[response.status] || `API 返回 HTTP ${response.status}，可重试或更换接口。`);
    }
  } catch (error) {
    if (error instanceof ModelError || abort?.aborted) throw error;
    if (timeout.aborted) throw new ModelError('模型响应超过 150 秒，请重试本阶段或更换模型。');
    if (error instanceof SyntaxError) throw new ModelError('API 返回的内容无法按 Chat Completions 解析。');
    throw new ModelError('无法连接模型 API，请检查地址及网络。');
  }
  const content = result?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map(part => part?.text ?? '').join('') : content;
  if (typeof text !== 'string' || !text.trim()) throw new ModelError('模型返回了空回复，请重试。');
  return text;
}

function parseObject(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  try {
    const parsed = JSON.parse(clean.slice(first, last + 1));
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') return parsed;
  } catch {
    throw new ModelError('模型回复需要包含有效的 JSON 指令。可以重试本阶段。');
  }
  throw new ModelError('模型没有返回 JSON 指令对象。');
}

export async function testConnection(config, abort) {
  const text = await requestCompletion(config, [{ role: 'user', content: '连接测试。只回复 JSON 对象 {"ok":true}。' }], abort);
  if (parseObject(text).ok !== true) throw new ModelError('接口已响应，模型需要能按指示返回 JSON 对象。');
}

const sharedRules = [
  '你是原创策略游戏《关口争夺》的红方指挥官，对手是蓝方玩家。',
  '任意一方连续两次在轮末控制 pass（本关的中央关口），或轮末占领敌方总部，即达成胜利条件。你的总部是 east，敌方总部是 west。',
  '节点的 owner 与道路公开。troops=null 代表未知，不能当作零兵。available 是你该点可以派出的整数兵力。',
  '移动只能采用 moves 中列出的起点和目标。普通路径每段基准 5 秒，己方道路每段基准 1.5 秒。moves 已按元素与路径计算实际耗时和抵达时刻。出发时扣除兵力。',
  'element 是与玩家元素进度条对应的当前状态，progress 在 0 到 1，nextInMs 是到下一次变化的毫秒数。elementForecast 是本次行军的后续变化。下令与增援时请考虑顺逆风、封路和抵达时伤害。',
  '预设部队同步出发。友军到达即合兵。敌军交战按兵力相减，同刻先按阵营合兵。没有严格多数时原属主保留，驻军清零。',
  '只有总部和中央关口能征兵。每 1 行动点征募 3 兵或修一段道路；每座自有基地下一轮提供 1 行动点，轮末净新占基地立即加 1 点。',
  '只输出 JSON 对象。使用战况里的节点 ID 和整数兵数。允许留预备队或选择空动作。',
].join('\n');

const instructions = {
  plan: '侦察下令阶段。输出 {"scout":null,"orders":[{"from":"节点ID","to":"节点ID","count":3}]}。scout 可以是 scoutTargets 中一个节点，花 1 点并在本轮揭示该点。若你侦察，会得到新情报并重新选择 orders；也可以把 scout 设为 null 并立即确定 orders。',
  replan: '侦察已完成。按更新后的兵力和可见信息决定出兵。输出 {"orders":[{"from":"节点ID","to":"节点ID","count":3}]}。同一起点各命令合计不可超过 available。',
  reserve: '行军到第 3 秒。visibleFlights 是你此刻看到的部队。判断是否立即追加一支部队，只有这一次机会。输出 {"reserve":null} 或 {"reserve":{"from":"节点ID","to":"节点ID","count":3}}。',
  build: '行军结算后的建设阶段。按 points 与 buildOptions 建设。输出 {"actions":[{"type":"recruit","node":"节点ID"},{"type":"road","from":"节点ID","to":"节点ID"}]}。每条行动花 1 点。可以在同一基地重复征兵，每段路只能修一次。',
};

export async function askModel(config, step, position, abort) {
  const text = await requestCompletion(config, [{
    role: 'user',
    content: `${sharedRules}\n\n${instructions[step]}\n\n战况 JSON\n${JSON.stringify(position)}`,
  }], abort);
  const result = parseObject(text);
  if ((step === 'plan' || step === 'replan') && !Array.isArray(result.orders)) {
    throw new ModelError('模型回复缺少 orders 指令列表。');
  }
  if (step === 'reserve' && !(result.reserve === null || isRecord(result.reserve))) {
    throw new ModelError('模型回复缺少 reserve 决策。');
  }
  if (step === 'build' && !Array.isArray(result.actions)) throw new ModelError('模型回复缺少 actions 建设列表。');
  return result;
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
