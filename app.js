const STORAGE_KEY = 'daily-list-tasks-v1';
const DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxEhFdm7tOpiHEOPDifEvhsWv32fckiT_1ocSWG7NkL17Iq5rl0cX-7bP-H-mpm3q9R9w/exec';
const endpoint = DEFAULT_ENDPOINT;
let tasks = endpoint ? [] : loadLocal();
let isSyncing = false;
let isSaving = false;

const $ = (id) => document.getElementById(id);
$('todayLabel').textContent = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
function makeId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function formatTime(iso) { return new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }

function render() {
  const completed = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  $('totalCount').textContent = total;
  $('doneCount').textContent = completed;
  $('progressText').textContent = `${percent} %`;
  $('progressBar').style.width = `${percent}%`;
  $('emptyState').hidden = total !== 0;
  $('taskList').innerHTML = tasks.map((task) => `<div class="task-row ${task.done ? 'completed' : ''}" data-id="${task.id}">
    <button class="check" data-action="toggle" aria-label="${task.done ? 'Označit jako nedokončené' : 'Označit jako hotové'}">${task.done ? '✓' : ''}</button>
    <span class="task-title">${escapeHtml(task.title)}</span><span class="task-time">${formatTime(task.createdAt)}</span>
    <button class="delete-button" data-action="delete" aria-label="Smazat úkol">×</button></div>`).join('');
}

function setStatus(text, connected = false) { $('syncStatus').innerHTML = `<i></i> ${text}`; $('syncStatus').classList.toggle('connected', connected); }
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
  await fetch(endpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  return { ok: true };
}
async function sync() {
  if (!endpoint) { setStatus('Demo režim'); $('lastUpdated').textContent = 'Lokálně v prohlížeči'; return; }
  if (isSyncing || isSaving) return;
  isSyncing = true;
  setStatus('Načítám…');
  try { const data = await request('GET'); if (Array.isArray(data.tasks)) { tasks = data.tasks; saveLocal(); render(); } setStatus('Synchronizováno', true); $('lastUpdated').textContent = `Aktualizováno ${formatTime(new Date().toISOString())}`; }
  catch { if (!tasks.length) { tasks = loadLocal(); render(); } setStatus('Offline — lokální kopie'); }
  finally { isSyncing = false; }
}
async function push(change) {
  saveLocal();
  if (!endpoint) return sync();
  if (!change) return;
  isSaving = true;
  try { setStatus('Ukládám…'); await request('POST', change); setStatus('Synchronizováno', true); $('lastUpdated').textContent = `Aktualizováno ${formatTime(new Date().toISOString())}`; }
  catch { setStatus('Neuloženo — zkus znovu'); }
  finally { isSaving = false; }
}

$('addForm').addEventListener('submit', async (event) => { event.preventDefault(); const input = $('taskInput'); const title = input.value.trim(); if (!title) return; const task = { id: makeId(), title, done: false, createdAt: new Date().toISOString() }; tasks.unshift(task); input.value = ''; render(); await push({ action: 'upsert', task }); });
$('taskList').addEventListener('click', async (event) => { const action = event.target.dataset.action; if (!action) return; const row = event.target.closest('.task-row'); const index = tasks.findIndex((task) => task.id === row.dataset.id); if (index < 0) return; if (action === 'toggle') { tasks[index].done = !tasks[index].done; render(); await push({ action: 'upsert', task: tasks[index] }); } if (action === 'delete') { const id = tasks[index].id; tasks.splice(index, 1); render(); await push({ action: 'delete', id }); } });
render(); sync();
setInterval(sync, 2000);
