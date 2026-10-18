const $ = selector => document.querySelector(selector);
let me = null;
let lastKey = '';
let autoKeyAttempted = false;

const endpointMeta = {
  '/api/ping': { title: 'Estado de la API', required: '', label: 'Sin parámetros', hint: 'No requiere parámetros', example: '' },
  '/api/info': { title: 'Información de la API', required: '', label: 'Sin parámetros', hint: 'No requiere parámetros', example: '' },
  '/api/ytsearch': { title: 'Búsqueda de YouTube', required: 'q', label: 'Búsqueda', hint: 'Ej. Shakira', example: 'Shakira' },
  '/api/play/audio': { title: 'Descargar audio', required: 'q', label: 'Búsqueda o título', hint: 'Ej. Shakira', example: 'Shakira' },
  '/api/play/video': { title: 'Descargar video', required: 'q', label: 'Búsqueda o título', hint: 'Ej. Shakira', example: 'Shakira' },
  '/api/facebook': { title: 'Facebook', required: 'url', label: 'URL de Facebook', hint: 'Pega la URL pública del contenido', example: '' },
  '/api/tiktok': { title: 'TikTok', required: 'url', label: 'URL de TikTok', hint: 'Pega la URL pública del contenido', example: '' },
  '/api/instagram': { title: 'Instagram', required: 'url', label: 'URL de Instagram', hint: 'Pega la URL pública del contenido', example: '' },
  '/api/spotify': { title: 'Spotify', required: 'q', label: 'Búsqueda', hint: 'Ej. canción o artista', example: 'Shakira' }
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  let data = {};
  try { data = await response.json(); } catch { data = { error: `Respuesta HTTP ${response.status}` }; }
  if (!response.ok) throw Object.assign(new Error(data.error || data.message || `Error HTTP ${response.status}`), { status: response.status, data });
  return data;
}

function notify(message, type = '') {
  const node = $('#notice');
  if (!node) return;
  node.textContent = message;
  node.className = `notice ${type}`.trim();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    notify('Copiado al portapapeles.', 'success');
  } catch {
    notify('El navegador no permitió copiar. Selecciona el texto y cópialo manualmente.', 'warning');
  }
}

function renderEndpoints() {
  const target = $('#endpointList');
  if (!target) return;
  target.innerHTML = Object.entries(endpointMeta).map(([path, item]) => `
    <article class="endpoint-row">
      <span class="http-method">GET</span>
      <div class="endpoint-info"><b>${escapeHtml(path)}</b><small>${escapeHtml(item.title)}${item.required ? ` · parámetro <code>${escapeHtml(item.required)}</code>` : ''}</small></div>
      <button class="small-button" data-copy-path="${escapeHtml(path)}" type="button">Copiar URL</button>
      <button class="small-button test-shortcut" data-test-path="${escapeHtml(path)}" type="button">Probar</button>
    </article>`).join('');
  target.querySelectorAll('[data-copy-path]').forEach(button => button.addEventListener('click', () => {
    const path = button.dataset.copyPath;
    const required = endpointMeta[path].required;
    const query = required ? `?${required}=${encodeURIComponent(required === 'url' ? 'PEGA_URL_AQUI' : 'TU_BUSQUEDA')}` : '';
    copyText(`${location.origin}${path}${query}`);
  }));
  target.querySelectorAll('[data-test-path]').forEach(button => button.addEventListener('click', () => {
    $('#endpointSelect').value = button.dataset.testPath;
    updateTesterFields();
    location.hash = '#tester';
    $('#testValue')?.focus();
  }));
}

function updateTesterFields() {
  const path = $('#endpointSelect')?.value || '/api/ping';
  const meta = endpointMeta[path] || endpointMeta['/api/ping'];
  $('#valueLabel').textContent = meta.required ? `${meta.label} (${meta.required})` : 'Parámetro';
  $('#testValue').placeholder = meta.hint;
  $('#testValue').disabled = !meta.required;
  $('#testValue').value = meta.example || '';
  $('#limitField').hidden = path !== '/api/ytsearch';
}

async function load() {
  try {
    me = await api('/api/me');
    if (!me.authenticated) {
      $('#welcome').hidden = false;
      $('#appcontent').hidden = true;
      $('#userbox').innerHTML = '<span class="avatar">S</span><span><b>Sesión no iniciada</b><small>Conecta tu cuenta</small></span>';
      return;
    }

    $('#welcome').hidden = true;
    $('#appcontent').hidden = false;
    const user = me.user || {};
    const admin = Boolean(user.admin);
    $('#userbox').innerHTML = `<span class="avatar">${user.avatar ? `<img src="${escapeHtml(user.avatar)}" alt="">` : 'S'}</span><span><b>${escapeHtml(user.name || 'Usuario')}</b><small>${escapeHtml(user.email || '')}</small></span><span class="user-arrow">↗</span>`;
    $('#profileName').textContent = user.name || 'Usuario';
    $('#profileEmail').textContent = user.email || '—';
    $('#profileRole').textContent = admin ? 'ADMINISTRADOR' : 'USUARIO';
    $('#profilePlan').textContent = admin ? 'MX PLUS · ADMIN' : 'MX PLUS';
    $('#profileAvatar').src = user.avatar || '';
    $('#profileAvatar').hidden = !user.avatar;
    $('#profileSince').textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString('es-PE',{year:'numeric',month:'short',day:'numeric'}) : 'Cuenta Google';
    $('#profileLimit').textContent = me.unlimited ? 'Ilimitado' : `${Number(me.limit || 450)} solicitudes`;
    $('#today').textContent = Number(me.usage?.today || 0);
    $('#errors').textContent = Number(me.usage?.errors || 0);
    $('#role').textContent = admin ? 'ADMIN' : 'NORMAL';
    $('#roleSub').textContent = admin ? 'Uso ilimitado' : 'Límite diario activo';
    $('#limitLabel').textContent = me.unlimited ? 'Sin límite diario' : `de ${Number(me.limit || 450)} solicitudes diarias`;
    $('#usageBar').style.width = me.unlimited ? '100%' : `${Math.min(100, Number(me.usage?.today || 0) / Math.max(1, Number(me.limit || 450)) * 100)}%`;
    $('#adminLink').hidden = !admin;
    $('#admin').hidden = !admin;
    renderRecent(me.usage?.recent || []);

    const keys = Array.isArray(me.keys) ? me.keys : [];
    if (!keys.length && !autoKeyAttempted) {
      autoKeyAttempted = true;
      try {
        const created = await api('/api/keys', { method: 'POST', body: '{}' });
        lastKey = created.key || '';
        $('#keydisplay').textContent = lastKey || 'Clave creada';
        notify('Tu API Key se generó automáticamente al iniciar sesión. Cópiala y guárdala ahora.', 'success');
        me.keys = [{ prefix: lastKey.slice(0, 12) }];
      } catch (error) {
        $('#keydisplay').textContent = 'No se pudo generar la clave';
        notify(error.message, 'warning');
      }
    } else if (lastKey) {
      $('#keydisplay').textContent = lastKey;
    } else if (keys.length) {
      $('#keydisplay').textContent = `${keys[0].prefix || 'sai_'}••••••••••••••••`;
    } else {
      $('#keydisplay').textContent = 'Pulsa Generar clave para intentarlo de nuevo';
    }

    if (location.hash === '#dashboard') $('#dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    notify(`No se pudo cargar el panel: ${error.message}`, 'warning');
  }
}

function renderRecent(items) {
  const node = $('#recent');
  if (!items.length) {
    node.innerHTML = '<p class="empty-state">Todavía no hay solicitudes registradas. Prueba un endpoint para empezar.</p>';
    return;
  }
  node.innerHTML = items.slice(0, 20).map(item => `
    <div class="activity-row"><span class="activity-dot ${Number(item.status) >= 400 ? 'error' : ''}"></span><div><b>${escapeHtml(item.endpoint || 'Endpoint')}</b><small>${new Date(item.at).toLocaleString()}</small></div><span class="http-code ${Number(item.status) >= 400 ? 'bad' : 'good'}">${escapeHtml(item.status)}</span></div>`).join('');
}

$('#newkey')?.addEventListener('click', async () => {
  if (!confirm('¿Generar una clave nueva? La clave anterior dejará de funcionar.')) return;
  try {
    const data = await api('/api/keys', { method: 'POST', body: '{}' });
    lastKey = data.key || '';
    $('#keydisplay').textContent = lastKey;
    notify(data.message || 'Clave generada. Cópiala ahora.', 'success');
    const refreshed = await api('/api/me');
    me = refreshed;
  } catch (error) { notify(error.message, 'warning'); }
});

$('#copykey')?.addEventListener('click', () => {
  if (lastKey) return copyText(lastKey);
  notify('La clave completa no se puede recuperar. Genera una nueva para copiarla.', 'warning');
});

$('#userbox')?.addEventListener('click', () => { location.hash = '#profile'; document.querySelector('#profile')?.scrollIntoView({behavior:'smooth',block:'start'}); });
$('#profileLogout')?.addEventListener('click', async () => { $('#logout')?.click(); });
$('#logout')?.addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    lastKey = '';
    location.href = '/';
  } catch (error) { notify(error.message, 'warning'); }
});

$('#menu')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));
$('#endpointSelect')?.addEventListener('change', updateTesterFields);

$('#runTest')?.addEventListener('click', async () => {
  const button = $('#runTest');
  const path = $('#endpointSelect').value;
  const meta = endpointMeta[path];
  const params = {};
  if (meta.required) {
    const value = $('#testValue').value.trim();
    if (!value) {
      $('#testResult').textContent = JSON.stringify({ status: false, error: `Completa el parámetro ${meta.required}.`, creator: 'SAI', year: 2026 }, null, 2);
      $('#responseStatus').textContent = 'Falta un parámetro';
      return;
    }
    params[meta.required] = value;
  }
  if (path === '/api/ytsearch' && $('#testLimit').value) params.limit = Math.min(20, Math.max(1, Number($('#testLimit').value) || 5));
  button.disabled = true;
  button.textContent = 'Probando…';
  $('#responseStatus').textContent = 'Solicitud en curso';
  $('#testResult').textContent = 'Consultando endpoint…';
  const started = performance.now();
  try {
    const result = await api('/dashboard/api/test', { method: 'POST', body: JSON.stringify({ path, params }) });
    $('#testResult').textContent = JSON.stringify(result, null, 2);
    $('#responseStatus').textContent = `OK · ${Math.round(performance.now() - started)} ms`;
    $('#responseStatus').className = 'response-status success';
    notify('Prueba completada.', 'success');
  } catch (error) {
    $('#testResult').textContent = JSON.stringify(error.data || { status: false, error: error.message, creator: 'SAI', year: 2026 }, null, 2);
    $('#responseStatus').textContent = `Error ${error.status || ''}`.trim();
    $('#responseStatus').className = 'response-status error';
    notify(error.message, 'warning');
  } finally {
    button.disabled = false;
    button.textContent = '▶ Ejecutar prueba';
    try {
      const refreshed = await api('/api/me');
      if (refreshed.authenticated) {
        me = refreshed;
        $('#today').textContent = Number(me.usage?.today || 0);
        $('#errors').textContent = Number(me.usage?.errors || 0);
        $('#limitLabel').textContent = me.unlimited ? 'Sin límite diario' : `de ${Number(me.limit || 450)} solicitudes diarias`;
        renderRecent(me.usage?.recent || []);
      }
    } catch {}
  }
});

$('#refreshUsers')?.addEventListener('click', async () => {
  try {
    const data = await api('/api/admin/users');
    $('#users').innerHTML = data.users.length ? data.users.map(user => `
      <div class="activity-row"><span class="activity-dot"></span><div><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.email)} · ${user.keys} claves · ${user.usage} solicitudes hoy</small></div></div>`).join('') : '<p class="empty-state">No hay usuarios registrados.</p>';
  } catch (error) { $('#users').textContent = error.message; }
});

document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => { $('#sidebar')?.classList.remove('open'); document.querySelectorAll('.nav-link').forEach(n => n.classList.toggle('active', n === link)); }));
window.addEventListener('hashchange', () => { const hash = location.hash || '#dashboard'; document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === hash)); });
renderEndpoints();
updateTesterFields();
load();
