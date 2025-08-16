import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- Elements (HOME) ---------- */
const homeSection       = document.getElementById('home');
const listsGrid         = document.getElementById('listsGrid');
const newListNameEl     = document.getElementById('newListName');
const createListBtn     = document.getElementById('createListBtn');
const themeToggle       = document.getElementById('themeToggle');

/* ---------- Elements (LIST VIEW) ---------- */
const listView          = document.getElementById('listView');
const backHomeBtn       = document.getElementById('backHome');
const listNameEl        = document.getElementById('listName');
const shareBtn          = document.getElementById('shareBtn');
const themeToggle2      = document.getElementById('themeToggle2');
const toggleDatesBtn    = document.getElementById('toggleDates');
const inputEl           = document.getElementById('itemInput');
const addBtn            = document.getElementById('addBtn');
const remainingEl       = document.getElementById('remaining');
const clearAllBtn       = document.getElementById('clearAll');
const clearCompletedBtn = document.getElementById('clearCompleted');
const listEl            = document.getElementById('list');

/* ---------- Helpers ---------- */
const qs  = (k) => new URLSearchParams(location.search).get(k);
const fmt = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleString() : '…';
};
const root = document.documentElement;

let listId = qs('list');
let itemsChannel = null;
let listsChannel = null;

/* ============================================================
   THEME (dark / light)
   ============================================================ */
function applyTheme(t) {
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  localStorage.setItem('theme', t);
}
const storedTheme = localStorage.getItem('theme')
  || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(storedTheme);
[themeToggle, themeToggle2].forEach(b => b && (b.onclick = () => {
  applyTheme(root.classList.contains('dark') ? 'light' : 'dark');
}));

/* ============================================================
   TIMESTAMPS TOGGLE (show/hide)
   ============================================================ */
let showTimestamps = localStorage.getItem('showTimestamps') !== '0'; // default ON
function applyTimestampPref() {
  document.body.classList.toggle('hide-meta', !showTimestamps);
  if (toggleDatesBtn) {
    toggleDatesBtn.title = showTimestamps ? 'Hide timestamps' : 'Show timestamps';
    toggleDatesBtn.innerHTML = showTimestamps
      ? '<span class="material-symbols-outlined">schedule</span>'
      : '<span class="material-symbols-outlined">visibility_off</span>';
  }
}
applyTimestampPref();
if (toggleDatesBtn) {
  toggleDatesBtn.onclick = () => {
    showTimestamps = !showTimestamps;
    localStorage.setItem('showTimestamps', showTimestamps ? '1' : '0');
    applyTimestampPref();
  };
}

/* ============================================================
   HOME (lists)
   ============================================================ */
async function createList() {
  const name  = (newListNameEl?.value || '').trim() || 'My Shopping List';
  const now   = new Date().toISOString();
  const order = Date.now(); // newest on top
  const { data, error } = await supabase
    .from('lists')
    .insert({ name, created_at: now, updated_at: now, order_index: order })
    .select('id')
    .single();
  if (error) return alert('Error creating list: ' + error.message);
  newListNameEl.value = '';
  location.href = `${location.pathname}?list=${data.id}`;
}

async function loadLists() {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .order('order_index', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) return console.error('Error loading lists', error);
  renderLists(data || []);
}

function shareList(id) {
  const url = `${location.origin}${location.pathname}?list=${id}`;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url)
      .then(() => alert('Shareable link copied'))
      .catch(() => alert('Copy failed. Long-press/copy the URL.'));
  } else {
    prompt('Copy this link:', url);
  }
}

async function deleteList(id) {
  if (!confirm('Delete this list (and all its items)?')) return;
  const { error } = await supabase.from('lists').delete().eq('id', id);
  if (error) alert('Error deleting list: ' + error.message);
}

async function renameList(id, newName) {
  const name = (newName || '').trim() || 'Untitled list';
  const { error } = await supabase
    .from('lists')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) alert('Error renaming list: ' + error.message);
}

function renderLists(lists) {
  listsGrid.innerHTML = '';

  if (!lists.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No lists yet. Create your first list.';
    listsGrid.appendChild(empty);
    return;
  }

  for (const l of lists) {
    const card = document.createElement('div');
    card.className = 'card-list';
    card.dataset.id = l.id;

    // Top row: drag handle + editable title
    const rowTop = document.createElement('div');
    rowTop.className = 'row-top';

    const drag = document.createElement('div');
    drag.className = 'drag';
    drag.innerHTML = '<span class="material-symbols-outlined">drag_indicator</span>';
    drag.title = 'Long-press and drag to reorder';

    const title = document.createElement('h3');
    title.textContent = l.name || 'Untitled list';
    title.title = 'Double-click to rename. Enter to save.';
    title.contentEditable = 'false';
    title.addEventListener('dblclick', () => {
      title.contentEditable = 'true';
      title.focus();
      document.execCommand('selectAll', false, null);
    });
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
      if (e.key === 'Escape') { title.contentEditable = 'false'; title.blur(); }
    });
    title.addEventListener('blur', () => {
      if (title.isContentEditable) {
        title.contentEditable = 'false';
        renameList(l.id, title.textContent || '');
      }
    });

    rowTop.append(drag, title);

    // Meta
    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `Updated: ${fmt(l.updated_at)} • Created: ${fmt(l.created_at)}`;

    // Actions
    const actions = document.createElement('div');
    actions.className = 'actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'icon-btn primary';
    openBtn.innerHTML = '<span class="material-symbols-outlined">open_in_new</span> Open';
    openBtn.onclick = (e) => { e.stopPropagation(); location.href = `${location.pathname}?list=${l.id}`; };

    const shareBtn = document.createElement('button');
    shareBtn.className = 'icon-btn';
    shareBtn.innerHTML = '<span class="material-symbols-outlined">share</span> Share';
    shareBtn.onclick = (e) => { e.stopPropagation(); shareList(l.id); };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span> Delete';
    deleteBtn.onclick = (e) => { e.stopPropagation(); deleteList(l.id); };

    actions.append(openBtn, shareBtn, deleteBtn);

    // Open by clicking card (not the buttons)
    card.onclick = (e) => { if (!e.target.closest('.actions')) location.href = `${location.pathname}?list=${l.id}`; };

    card.append(rowTop, meta, actions);
    listsGrid.appendChild(card);
  }

  // Reorder: long-press on the dots only
  enableLongPressReorder(listsGrid, '.card-list', persistListOrder, '.drag');
  attachRipples();
}

async function persistListOrder() {
  const cards = [...listsGrid.querySelectorAll('.card-list')];
  let base = Date.now() + 1000;
  for (let i = 0; i < cards.length; i++) {
    const id = cards[i].dataset.id;
    const order_index = base - i;
    await supabase.from('lists').update({ order_index }).eq('id', id);
  }
}

function subscribeListsRealtime() {
  if (listsChannel) supabase.removeChannel(listsChannel);
  listsChannel = supabase
    .channel('lists_all')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => loadLists())
    .subscribe();
}

/* ============================================================
   LIST VIEW (items)
   ============================================================ */
async function loadListName() {
  const { data } = await supabase.from('lists').select('name').eq('id', listId).single();
  if (data) listNameEl.value = data.name || 'Shopping List';
}

async function saveListName() {
  const name = listNameEl.value.trim() || 'Shopping List';
  await supabase.from('lists').update({ name, updated_at: new Date().toISOString() }).eq('id', listId);
}

async function loadItemsAndRender() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('list_id', listId)
    .order('order_index', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return console.error('Error loading items', error);
  renderItems(data || []);
}

function subscribeItemsRealtime() {
  if (itemsChannel) supabase.removeChannel(itemsChannel);
  itemsChannel = supabase
    .channel(`list_${listId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${listId}` }, () => loadItemsAndRender())
    .subscribe();
}

function renderItems(items) {
  remainingEl.textContent = `${items.filter(i => !i.done).length} remaining`;
  listEl.innerHTML = '';

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'card';
    li.dataset.id = item.id;

    const row = document.createElement('div');
    row.className = 'row';

    // 6-dot drag handle
    const handle = document.createElement('div');
    handle.className = 'drag handle';
    handle.innerHTML = '<span class="material-symbols-outlined">drag_indicator</span>';
    handle.title = 'Long-press and drag to reorder';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'checkbox';
    cb.checked = !!item.done;
    cb.onchange = () => toggleDone(item);

    const text = document.createElement('input');
    text.className = 'text' + (item.done ? ' strike' : '');
    text.value = item.text || '';
    text.onchange = () => editItem(item, text.value);

    const del = document.createElement('button');
    del.className = 'btn del';
    del.textContent = 'Delete';
    del.onclick = () => removeItem(item);

    row.append(handle, cb, text, del);

    const meta = document.createElement('div');
    meta.className = 'metaRow';
    meta.innerHTML = `<div>Added: ${fmt(item.created_at)}</div><div>Updated: ${fmt(item.updated_at)}</div>`;

    li.append(row, meta);
    listEl.appendChild(li);
  }

  // Reorder items: long-press on the dots only
  enableLongPressReorder(listEl, '.card', persistItemsOrder, '.drag.handle');
  attachRipples();
}

/* ---------- Item Ops ---------- */
async function addItem() {
  const t = inputEl.value.trim();
  if (!t) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('items').insert({
    list_id: listId,
    text: t,
    done: false,
    quantity: '',
    note: '',
    created_at: now,
    updated_at: now,
    order_index: Date.now()
  });
  if (error) return alert('Error adding item: ' + error.message);
  inputEl.value = '';
  inputEl.focus();
}
async function toggleDone(item) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('items')
    .update({ done: !item.done, updated_at: now })
    .eq('id', item.id);
  if (error) alert('Error updating: ' + error.message);
}
async function editItem(item, newText) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('items')
    .update({ text: newText, updated_at: now })
    .eq('id', item.id);
  if (error) alert('Error editing: ' + error.message);
}
async function removeItem(item) {
  const { error } = await supabase.from('items').delete().eq('id', item.id);
  if (error) alert('Error deleting: ' + error.message);
}
async function clearAll() {
  if (!confirm('Clear all items?')) return;
  const { error } = await supabase.from('items').delete().eq('list_id', listId);
  if (error) alert('Error clearing: ' + error.message);
}
async function clearCompleted() {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('list_id', listId)
    .eq('done', true);
  if (error) alert('Error clearing completed: ' + error.message);
}

async function persistItemsOrder() {
  const cards = [...listEl.querySelectorAll('.card')];
  let base = Date.now() + 1000;
  for (let i = 0; i < cards.length; i++) {
    const id = cards[i].dataset.id;
    const order_index = base - i;
    await supabase.from('items').update({ order_index }).eq('id', id);
  }
}

/* ---------- Share & Nav ---------- */
function share() {
  const url = location.href;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url)
      .then(() => alert('Shareable link copied to clipboard'))
      .catch(() => alert('Copy failed. Long-press/copy the URL.'));
  } else {
    prompt('Copy this link:', url);
  }
}
function goHome() {
  history.pushState({}, '', location.pathname);
  showHome();
}

/* ============================================================
   Mode switch
   ============================================================ */
function showHome() {
  homeSection.style.display = '';
  listView.style.display = 'none';
  loadLists();
  subscribeListsRealtime();
}
async function showListView() {
  homeSection.style.display = 'none';
  listView.style.display = '';
  await loadListName();
  await loadItemsAndRender();
  subscribeItemsRealtime();
}

/* ============================================================
   Long-press reorder helper (touch & mouse, optional handle)
   ============================================================ */
function enableLongPressReorder(container, itemSelector, onDrop, handleSelector = null) {
  if (!container) return;

  let pressTimer = null;
  let dragging = null;
  let startY = 0;
  let moved = false;

  const isInteractive = (el) =>
    el.closest('button, input, textarea, select, a, [contenteditable="true"]');

  const pointerDown = (e) => {
    const item = e.target.closest(itemSelector);
    if (!item) return;

    // If a handle is specified, only start from the handle
    if (handleSelector && !e.target.closest(handleSelector)) return;
    if (isInteractive(e.target)) return;

    startY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    moved = false;

    pressTimer = setTimeout(() => {
      dragging = item;
      dragging.classList.add('dragging');
      // optional haptic on mobile
      if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
      container.addEventListener('touchmove', preventScroll, { passive: false });
    }, 300); // long-press threshold
  };

  const pointerMove = (e) => {
    if (!pressTimer && !dragging) return;

    const y = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    if (!dragging) {
      // treat as scroll if moved before long-press triggers
      if (Math.abs(y - startY) > 8) { clearTimeout(pressTimer); pressTimer = null; }
      return;
    }

    moved = true;
    e.preventDefault();
    const afterEl = getDragAfterElement(container, y, itemSelector);
    if (!afterEl) container.appendChild(dragging);
    else container.insertBefore(dragging, afterEl);
  };

  const pointerUp = async () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (dragging) {
      dragging.classList.remove('dragging');
      container.removeEventListener('touchmove', preventScroll);
      dragging = null;
      if (moved && typeof onDrop === 'function') await onDrop();
      moved = false;
    }
  };

  container.addEventListener('mousedown', pointerDown);
  container.addEventListener('touchstart', pointerDown, { passive: true });
  container.addEventListener('mousemove', pointerMove);
  container.addEventListener('touchmove', pointerMove, { passive: false });
  container.addEventListener('mouseup', pointerUp);
  container.addEventListener('mouseleave', pointerUp);
  container.addEventListener('touchend', pointerUp);
  container.addEventListener('touchcancel', pointerUp);
}

function preventScroll(e) { e.preventDefault(); }

function getDragAfterElement(container, y, itemSelector) {
  const els = [...container.querySelectorAll(`${itemSelector}:not(.dragging)`)];

  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/* ---------- Ripples (material-ish) ---------- */
function attachRipples() {
  document.querySelectorAll('button.btn, button.icon-btn').forEach(btn => {
    if (btn.dataset.rippleAttached) return;
    btn.dataset.rippleAttached = '1';
    btn.addEventListener('click', function (e) {
      const rect = this.getBoundingClientRect();
      const circle = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      circle.style.width = circle.style.height = size + 'px';
      circle.style.left = (e.clientX - rect.left - size/2) + 'px';
      circle.style.top  = (e.clientY - rect.top  - size/2) + 'px';
      circle.className = 'ripple';
      this.appendChild(circle);
      setTimeout(() => circle.remove(), 550);
    });
  });
}

/* ---------- Wire UI ---------- */
if (createListBtn)      createListBtn.onclick = createList;
if (backHomeBtn)        backHomeBtn.onclick = goHome;

if (addBtn)             addBtn.onclick = addItem;
if (clearAllBtn)        clearAllBtn.onclick = clearAll;
if (clearCompletedBtn)  clearCompletedBtn.onclick = clearCompleted;
if (shareBtn)           shareBtn.onclick = share;
if (listNameEl)         listNameEl.addEventListener('blur', saveListName);

/* ---------- Init ---------- */
(async function init() {
  listId = qs('list');
  if (!listId) showHome();
  else await showListView();
})();
