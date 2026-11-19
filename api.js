import * as engine from './engine.js';
import { CLASSIC, getLevel } from './levels.js';
import { ModelError, readConfig, testConnection } from './model.js';
import { getProfile, keyFor, updateProfile } from './storage.js';

function fail(status, message, view) {
  const error = new Error(message);
  error.status = status;
  if (view) error.view = view;
  throw error;
}

async function modelConfig(input, previous) {
  const explicit = readConfig(input);
  const key = explicit.key || await keyFor(explicit.endpoint);
  return readConfig({ ...input, key }, previous);
}

// 对原本地服务的请求处理做同构移植：成功返回数据对象，失败抛出带 status/view 的错误。
export async function route(path, { method, headers, payload, signal } = {}) {
  try {
    const url = new URL(path, window.location.origin);
    const token = headers?.Authorization?.replace(/^Bearer /i, '') || null;

    if (url.pathname === '/api/model-profile') {
      if (method === 'GET') return { ok: true, profile: await getProfile() };
      if (method === 'POST') return { ok: true, profile: await updateProfile(payload) };
    }
    if (method === 'POST' && url.pathname === '/api/test') {
      const config = await modelConfig(payload, engine.session(token)?.config);
      await testConnection(config, signal);
      return { ok: true, reasoningEffort: config.reasoningEffort };
    }
    if (method === 'POST' && url.pathname === '/api/game') {
      const config = await modelConfig(payload, engine.session(token)?.config);
      const level = getLevel(payload.levelId ?? CLASSIC.id);
      if (!level) fail(400, '请选择有效关卡。');
      const created = engine.createSession(level.id, config);
      return { ok: true, token: created.token, view: engine.snapshot(created) };
    }
    if (!url.pathname.startsWith('/api/')) fail(404, '页面不存在。');

    const session = engine.session(token);
    if (!session) fail(404, '对局已结束或服务已重启，请重新开局。');
    if (method === 'GET' && url.pathname === '/api/state') {
      engine.refresh(session);
      if (Number(url.searchParams.get('after')) === session.version) {
        await engine.waitForChange(session, signal);
      }
      return { ok: true, view: engine.snapshot(session) };
    }
    if (method === 'POST' && url.pathname === '/api/action') {
      engine.refresh(session);
      const result = engine.handleAction(session, payload);
      if (!result.ok) fail(409, result.error, engine.snapshot(session));
      return { ...result, view: engine.snapshot(session) };
    }
    if (method === 'POST' && url.pathname === '/api/config') {
      const config = await modelConfig(payload, session.config);
      engine.applyConfig(session, config);
      return { ok: true, view: engine.snapshot(session) };
    }
    fail(404, '接口不存在。');
  } catch (error) {
    if (error instanceof ModelError) fail(400, error.message);
    throw error;
  }
}
