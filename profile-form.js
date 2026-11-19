const fields = ['endpoint', 'model', 'key'];

function validAddress(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
      ? url.href : '';
  } catch {
    return '';
  }
}

export function createProfileEditor(api) {
  const entries = new Set();
  let stored = null;
  const loaded = api('/api/model-profile').then(({ profile }) => {
    stored = profile;
    for (const entry of entries) {
      if (!entry.edits) fill(entry);
      if (profile.saved && !entry.edits) status(entry, '已载入保存的设置。');
    }
  }).catch(error => {
    for (const entry of entries) status(entry, error.message, true);
  });
  let writes = loaded;

  function status(entry, message, error = false) {
    entry.message.textContent = message;
    entry.message.hidden = !message;
    entry.message.classList.toggle('error', error);
    paint(entry);
  }

  function paint(entry) {
    const matches = stored?.hasKey && entry.fields.endpoint.value.trim() === stored.endpoint;
    entry.fields.key.placeholder = matches ? '已保存，留空即可使用' : '如接口无需鉴权，可留空';
    entry.clear.hidden = !stored?.hasStoredKey;
    entry.row.hidden = entry.clear.hidden && entry.message.hidden;
  }

  function fill(entry, fallback = entry.fallback) {
    if (fallback) entry.fallback = fallback;
    if (!entry.changed.size && !entry.saving) {
      const source = stored?.saved ? stored : entry.fallback ?? {};
      entry.fields.endpoint.value = source.endpoint || '';
      entry.fields.model.value = source.model || '';
      entry.fields.key.value = '';
      entry.savedInput = '';
      entry.keyAddress = null;
    }
    paint(entry);
  }

  function clearKeyInput(entry) {
    entry.fields.key.value = '';
    entry.savedInput = '';
    entry.keyAddress = null;
  }

  function flush(entry, clear = false) {
    clearTimeout(entry.timer);
    const { fields: input, changed } = entry;
    const endpoint = input.endpoint.value.trim();
    const address = validAddress(endpoint);
    const patch = {};
    if (changed.has('endpoint') && (address || !endpoint)) {
      patch.endpoint = endpoint;
      changed.delete('endpoint');
    }
    if (changed.delete('model')) patch.model = input.model.value;
    if (clear) {
      patch.clearKey = true;
      changed.delete('key');
      clearKeyInput(entry);
    } else if (changed.has('key')) {
      if (address && input.key.value.trim()) {
        patch.endpoint = endpoint;
        patch.key = input.key.value;
        changed.delete('key');
      } else if (!input.key.value.trim()) changed.delete('key');
    }
    if (!Object.keys(patch).length) {
      if (changed.size) status(entry, '填写有效的 API 地址后自动保存。');
      return writes;
    }

    const captured = entry.edits;
    entry.saving++;
    status(entry, '正在自动保存…');
    const save = writes.then(async () => {
      try {
        const { profile } = await api('/api/model-profile', { payload: patch });
        stored = profile;
        if (patch.key && input.key.value === patch.key && validAddress(input.endpoint.value.trim()) === validAddress(patch.endpoint)) {
          if (document.activeElement === input.key) entry.savedInput = patch.key;
          else clearKeyInput(entry);
        }
        for (const form of entries) paint(form);
        if (entry.edits === captured) {
          status(entry, patch.clearKey ? '已移除保存的密钥。'
            : changed.size ? '填写有效的 API 地址后自动保存。' : '已自动保存。');
        }
      } catch (error) {
        if (entry.edits === captured) {
          for (const field of fields) if (field in patch) changed.add(field);
          status(entry, `自动保存失败。 ${error.message}`, true);
        }
      } finally {
        entry.saving--;
      }
    });
    writes = save;
    return save;
  }

  return form => {
    const entry = {
      fields: form.elements,
      row: form.querySelector('.profile-row'),
      message: form.querySelector('.profile-status'),
      clear: form.querySelector('.profile-clear'),
      changed: new Set(), edits: 0, saving: 0, timer: null, keyAddress: null, savedInput: '',
    };
    entries.add(entry);
    if (stored) fill(entry);
    form.addEventListener('input', ({ target }) => {
      const { name } = target;
      if (!fields.includes(name)) return;
      const address = validAddress(entry.fields.endpoint.value.trim());
      if (name === 'key') {
        entry.savedInput = '';
        entry.keyAddress = address || null;
      } else if (name === 'endpoint' && entry.keyAddress && entry.keyAddress !== address) {
        clearKeyInput(entry);
        entry.changed.delete('key');
      }
      entry.edits++;
      entry.changed.add(name);
      paint(entry);
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => void flush(entry), 450);
    });
    form.addEventListener('change', ({ target }) => {
      if (entry.changed.has(target.name)) void flush(entry);
    });
    entry.fields.key.addEventListener('blur', () => {
      if (entry.savedInput && entry.fields.key.value === entry.savedInput) clearKeyInput(entry);
    });
    entry.clear.addEventListener('click', async () => {
      entry.edits++;
      entry.clear.disabled = true;
      await flush(entry, true);
      entry.clear.disabled = false;
    });

    return {
      fill: fallback => fill(entry, fallback),
      flush() {
        for (const field of ['endpoint', 'model']) {
          if (entry.fields[field].value.trim() !== (stored?.[field] ?? '')) entry.changed.add(field);
        }
        if (entry.fields.key.value && entry.fields.key.value !== entry.savedInput) entry.changed.add('key');
        return flush(entry);
      },
    };
  };
}
