import { ModelError, normalizeEndpoint, normalizeKey } from './model.js';

// 浏览器版把本机设置存入 localStorage；与 Node 版不同，这里没有系统级密钥保护。
const PROFILE_KEY = 'passline-profile';
const empty = { version: 1, endpoint: '', model: '', credential: null };

function load() {
  try {
    const record = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    const credential = record?.credential;
    if (record?.version !== 1 || typeof record.endpoint !== 'string' || typeof record.model !== 'string'
      || (credential !== null && (typeof credential?.endpoint !== 'string' || typeof credential?.key !== 'string'))) {
      return { record: { ...empty }, saved: false };
    }
    return { record, saved: true };
  } catch {
    return { record: { ...empty }, saved: false };
  }
}

function save(record) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(record));
  } catch {
    throw new ModelError('无法在本机保存 API 设置。');
  }
}

function forBrowser(record, saved) {
  let hasKey = false;
  if (record.credential) {
    try { hasKey = normalizeEndpoint(record.endpoint) === record.credential.endpoint; } catch {
      // A draft can contain an address the player is still editing.
    }
  }
  return { endpoint: record.endpoint, model: record.model, saved, hasKey, hasStoredKey: Boolean(record.credential) };
}

function draftField(value, before, limit) {
  if (value === undefined) return before;
  if (typeof value !== 'string' || value.length > limit) throw new ModelError('API 设置格式有误。');
  return value.trim();
}

export async function getProfile() {
  const { record, saved } = load();
  return forBrowser(record, saved);
}

export async function updateProfile(input) {
  const { record: before, saved } = load();
  const endpoint = draftField(input.endpoint, before.endpoint, 1024);
  if (input.endpoint !== undefined && endpoint) normalizeEndpoint(endpoint);
  const model = draftField(input.model, before.model, 160);
  const key = normalizeKey(input.key);
  let credential = input.clearKey === true ? null : before.credential;
  if (key && input.clearKey !== true) {
    credential = { endpoint: normalizeEndpoint(endpoint), key };
  }
  const record = { version: 1, endpoint, model, credential };
  if (!saved || endpoint !== before.endpoint || model !== before.model || credential !== before.credential) {
    save(record);
  }
  return forBrowser(record, true);
}

export async function keyFor(endpoint) {
  const { record: { credential } } = load();
  return credential?.endpoint === endpoint ? credential.key : '';
}
