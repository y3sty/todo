const STORAGE_KEY = 'daily-list-tasks-v1';
const THEME_KEY = 'daily-list-theme';
const DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxEhFdm7tOpiHEOPDifEvhsWv32fckiT_1ocSWG7NkL17Iq5rl0cX-7bP-H-mpm3q9R9w/exec';
const endpoint = DEFAULT_ENDPOINT;
let tasks = endpoint ? [] : loadLocal();
let isSyncing = false;
let isSaving = false;
let hasLoadedOnce = false;
const pendingChanges = new Map();

const $ = (id) => document.getElementById(id);
$('todayLabel').textContent = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

/* ---------- světlý / tmavý režim ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('themeLabel').textContent = theme === 'dark' ? '☀ Světlý režim' : '☾ Tmavý režim';
  $('themeToggle').setAttribute('aria-pressed', String(theme === 'dark'));
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  const system = matchMedia('(prefers-color-scheme: dark)');
  applyTheme(saved || (system.matches ? 'dark' : 'light'));
  system.addEventListener('change', (event) => {
    let current = null;
    try { current = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
    if (!current) applyTheme(event.matches ? 'dark' : 'light');
  });
}
$('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  applyTheme(next);
});
initTheme();

/* ---------- data ---------- */
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function makeId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function formatTime(iso) { return new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
function plural(n, one, few, many) { if (n === 1) return one; if (n >= 2 && n <= 4) return few; return many; }

/* ---------- vykreslení ---------- */
function render() {
  const completed = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  $('totalCount').textContent = total;
  $('doneCount').textContent = completed;
  $('progressText').textContent = `${percent} %`;
  const filled = Math.round(percent / 10);
  [...$('progressBar').children].forEach((seg, index) => seg.classList.toggle('on', index < filled));
  $('progressSub').textContent = `${completed} z ${total} ${plural(total, 'úkol', 'úkolů', 'úkolů')} — jen tak dál!`;
  $('countBadge').textContent = `${total} ${plural(total, 'úkol', 'úkoly', 'úkolů')} · ${completed} ${plural(completed, 'hotový', 'hotové', 'hotových')}`;
  $('emptyState').hidden = total !== 0;
  $('taskList').innerHTML = tasks.map((task) => `<div class="task-row ${task.done ? 'completed' : ''}" data-id="${task.id}">
    <button class="check" data-action="toggle" aria-label="${task.done ? 'Označit jako nedokončené' : 'Označit jako hotové'}">✓</button>
    <span class="title-wrap"><span class="task-title">${escapeHtml(task.title)}</span>${task.done ? '<span class="done-tag">Hotovo!</span>' : ''}</span>
    <span class="task-time">${formatTime(task.createdAt)}</span>
    <button class="delete-button" data-action="delete" aria-label="Smazat úkol">×</button></div>`).join('');
}

/* ---------- sync s Google Tabulkami ---------- */
function setStatus(text, connected = false) { $('syncStatus').innerHTML = `<i></i> ${text}`; $('syncStatus').classList.toggle('connected', connected); }
function mergePendingChanges(remoteTasks) {
  const remote = new Map(remoteTasks.map(task => [task.id, task]));
  const remoteOrder = remoteTasks.map(task => task.id);
  for (const [id, change] of pendingChanges) {
    if (change.action === 'upsert') {
      const remoteTask = remote.get(id);
      if (remoteTask && JSON.stringify(remoteTask) === JSON.stringify(change.task)) pendingChanges.delete(id);
      else remote.set(id, change.task);
    } else if (change.action === 'delete') {
      if (!remote.has(id)) pendingChanges.delete(id);
      else remote.delete(id);
    }
  }
  const result = remoteOrder.filter(id => remote.has(id)).map(id => remote.get(id));
  for (const [id, task] of remote) if (!remoteOrder.includes(id)) result.unshift(task);
  return result;
}
async function request(method, body) {
  if (!endpoint) return;
  if (method === 'GET') {
    try {
      return await new Promise((resolve, reject) => {
      const callback = `dailyListCallback_${Date.now()}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('Načtení trvalo příliš dlouho')); }, 15000);
      const cleanup = () => { clearTimeout(timer); delete window[callback]; script.remove(); };
      window[callback] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('Google Apps Script není dostupný')); };
      script.src = `${endpoint}${endpoint.includes('?') ? '&' : '?'}callback=${callback}&t=${Date.now()}`;
      document.body.appendChild(script);
      });
    } catch {
      const response = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Načtení selhalo');
      return response.json();
    }
  }
  return new Promise((resolve, reject) => {
    const callback = `dailyListWrite_${Date.now()}`;
    const script = document.createElement('script');
    const params = new URLSearchParams({ action: body.action, callback });
    if (body.action === 'delete') params.set('id', body.id);
    if (body.action === 'upsert') {
      params.set('id', body.task.id);
      params.set('title', body.task.title);
      params.set('done', String(Boolean(body.task.done)));
      params.set('createdAt', body.task.createdAt);
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('Uložení trvalo příliš dlouho')); }, 15000);
    const cleanup = () => { clearTimeout(timer); delete window[callback]; script.remove(); };
    window[callback] = (data) => { cleanup(); data?.ok ? resolve(data) : reject(new Error(data?.error || 'Uložení selhalo')); };
    script.onerror = () => { cleanup(); reject(new Error('Google Apps Script není dostupný')); };
    script.src = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${params.toString()}`;
    document.body.appendChild(script);
  });
}
async function sync() {
  if (!endpoint) { setStatus('Demo režim'); $('lastUpdated').textContent = 'Lokálně v prohlížeči'; return; }
  if (isSyncing || isSaving) return;
  isSyncing = true;
  const firstLoad = !hasLoadedOnce;
  if (firstLoad) setStatus('Načítám…');
  try { const data = await request('GET'); if (Array.isArray(data.tasks)) { const nextTasks = mergePendingChanges(data.tasks); if (JSON.stringify(nextTasks) !== JSON.stringify(tasks)) { tasks = nextTasks; saveLocal(); render(); } } if (firstLoad) { setStatus('Synchronizováno', true); $('lastUpdated').textContent = `Aktualizováno ${formatTime(new Date().toISOString())}`; } hasLoadedOnce = true; }
  catch { if (!tasks.length) { tasks = loadLocal(); render(); } if (firstLoad) setStatus('Offline — lokální kopie'); hasLoadedOnce = true; }
  finally { isSyncing = false; }
}
async function push(change) {
  saveLocal();
  if (!endpoint) return sync();
  if (!change) return;
  const changeId = change.task?.id || change.id;
  pendingChanges.set(changeId, change);
  isSaving = true;
  try { setStatus('Ukládám…'); await request('POST', change); setStatus('Synchronizováno', true); $('lastUpdated').textContent = `Aktualizováno ${formatTime(new Date().toISOString())}`; }
  catch { setStatus('Neuloženo — zkus znovu'); }
  finally { isSaving = false; }
}

/* ---------- události ---------- */
$('addForm').addEventListener('submit', async (event) => { event.preventDefault(); const input = $('taskInput'); const title = input.value.trim(); if (!title) return; const task = { id: makeId(), title, done: false, createdAt: new Date().toISOString() }; tasks.unshift(task); input.value = ''; render(); await push({ action: 'upsert', task }); });
$('taskList').addEventListener('click', async (event) => { const action = event.target.dataset.action; if (!action) return; const row = event.target.closest('.task-row'); const index = tasks.findIndex((task) => task.id === row.dataset.id); if (index < 0) return; if (action === 'toggle') { tasks[index].done = !tasks[index].done; render(); await push({ action: 'upsert', task: tasks[index] }); } if (action === 'delete') { const id = tasks[index].id; tasks.splice(index, 1); render(); await push({ action: 'delete', id }); } });

render();
sync();
setInterval(sync, 5000);
