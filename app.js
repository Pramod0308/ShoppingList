import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elements (home)
const homeSection = document.getElementById('home');
const listsGrid = document.getElementById('listsGrid');
const newListNameEl = document.getElementById('newListName');
const createListBtn = document.getElementById('createListBtn');

// Elements (list view)
const listView = document.getElementById('listView');
const backHomeBtn = document.getElementById('backHome');
const listNameEl = document.getElementById('listName');
const shareBtn = document.getElementById('shareBtn');
const inputEl = document.getElementById('itemInput');
const addBtn = document.getElementById('addBtn');
const remainingEl = document.getElementById('remaining');
const clearAllBtn = document.getElementById('clearAll');
const clearCompletedBtn = document.getElementById('clearCompleted');
const listEl = document.getElementById('list');

const qs = (k) => new URLSearchParams(location.search).get(k);
const fmt = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleString() : '…';
};

let listId = qs('list');
let itemsChannel = null;
let listsChannel = null;

/* ----------------------- HOME (lists) ----------------------- */

async function createList() {
  const name = (newListNameEl?.value || '').trim() || 'My Shopping List';
  const now = new Date().toISOString();
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
  if (error) {
    console.error('Error loading lists', error);
    return;
  }
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

  // Render cards
  for (const l of lists) {
    const card = document.createElement('div');
    card.className = 'card-list';
    card.draggable = true;
    card.dataset.id = l.id;
    card.dataset.order = String(l.order_index);

    // drag handle + title (editable)
    const rowTop = document.createElement('div');
    rowTop.className = 'row-top';

    const drag = document.createElement('div');
    drag.className = 'drag';
    drag.title = 'Drag to reorder';
    drag.textContent = '⋮⋮';

    const title = document.createElement('h3');
    title.textContent = l.name || 'Untitled list';
    title.title = 'Click to rename. Press Enter to save.';
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

    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `Updated: ${fmt(l.updated_at)} • Created: ${fmt(l.created_at)}`;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'icon-btn primary';
    openBtn.textContent = 'Open';
    openBtn.onclick = (e) => {
      e.stopPropagation();
      location.href = `${location.pathname}?list=${l.id}`;
    };

    const shareBtn = document.createElement('button');
    shareBtn.className = 'icon-btn';
    shareBtn.textContent = 'Share';
    shareBtn.onclick = (e) => { e.stopPropagation(); shareList(l.id); };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = (e) => { e.stopPropagation(); deleteList(l.id); };

    actions.append(openBtn, shareBtn, deleteBtn);

    // Clicking card (except buttons) opens
    card.onclick = (e) => {
      if (e.target.closest('.actions')) return;
      location.href = `${location.pathname}?list=${l.id}`;
    };

    card.append(rowTop, meta, actions);
    listsGrid.appendChild(card);

    // Drag & drop events
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', l.id);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      persistOrder();
    });
  }

  // Grid drag-over to visually re-order
  listsGrid.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = listsGrid.querySelector('.dragging');
    if (!dragging) return;
    const afterEl = getDragAfterElement(listsGrid, e.clientY);
    if (afterEl == null) {
      listsGrid.appendChild(dragging);
    } else {
      listsGrid.insertBefore(dragging, afterEl);
    }
  }, { once: true }); // reattach each render
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.card-list:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function persistOrder() {
  const cards = [...listsGrid.querySelectorAll('.card-list')];
  const updates = cards.map((c, i) => ({
    id: c.dataset.id,
    order_index: Date.now() + (cards.length - i) // keep current order newest on top feel
  }));
  for (const u of updates) {
    await supabase.from('lists').update({ order_index: u.order_index }).eq('id', u.id);
  }
}

function subscribeListsRealtime() {
  if (listsChannel) supabase.removeChannel(listsChannel);
  listsChannel = supabase
    .channel('lists_all')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lists' },
      () => loadLists()
    )
    .subscribe();
}

/* ----------------------- LIST VIEW (items) ----------------------- */

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
    .from('items').select('*').eq('list_id', listId)
    .order('created_at', { ascending: true });
  if (error) return console.error('Error loading items', error);
  renderItems(data || []);
}

function subscribeItemsRealtime() {
  if (itemsChannel) supabase.removeChannel(itemsChannel);
  itemsChannel = supabase
    .channel(`list_${listId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${listId}` },
      () => loadItemsAndRender()
    )
    .subscribe();
}

function renderItems(items) {
  remainingEl.textContent = `${items.filter(i => !i.done).length} remaining`;
  listEl.innerHTML = '';

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'card';

    const row = document.createElement('div');
    row.className = 'row';

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

    row.append(cb, text, del);

    const meta = document.createElement('div');
    meta.className = 'metaRow';
    meta.innerHTML = `<div>Added: ${fmt(item.created_at)}</div><div>Updated: ${fmt(item.updated_at)}</div>`;

    li.append(row, meta);
    listEl.appendChild(li);
  }
}

/* ----------------------- Item ops ----------------------- */

async function addItem() {
  const t = inputEl.value.trim();
  if (!t) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('items').insert({
    list_id: listId, text: t, done: false, quantity: '', note: '',
    created_at: now, updated_at: now,
  });
  if (error) return alert('Error adding item: ' + error.message);
  inputEl.value = ''; inputEl.focus();
}
async function toggleDone(item) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('items').update({ done: !item.done, updated_at: now }).eq('id', item.id);
  if (error) alert('Error updating: ' + error.message);
}
async function editItem(item, newText) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('items').update({ text: newText, updated_at: now }).eq('id', item.id);
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
  const { error } = await supabase.from('items').delete().eq('list_id', listId).eq('done', true);
  if (error) alert('Error clearing completed: ' + error.message);
}

/* ----------------------- Share / Nav ----------------------- */

function share() {
  const url = location.href;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url)
      .then(() => alert('Shareable link copied to clipboard'))
      .catch(() => alert('Copy failed. Long-press and copy the URL.'));
  } else {
    prompt('Copy this link:', url);
  }
}
function goHome() {
  history.pushState({}, '', location.pathname);
  showHome();
}

/* ----------------------- Mode switch ----------------------- */

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

/* ----------------------- Wire UI ----------------------- */

if (createListBtn) createListBtn.onclick = createList;
if (backHomeBtn) backHomeBtn.onclick = goHome;

if (addBtn) addBtn.onclick = addItem;
if (clearAllBtn) clearAllBtn.onclick = clearAll;
if (clearCompletedBtn) clearCompletedBtn.onclick = clearCompleted;
if (shareBtn) shareBtn.onclick = share;
if (listNameEl) listNameEl.addEventListener('blur', saveListName);

/* ----------------------- Init ----------------------- */

(async function init() {
  listId = qs('list');
  if (!listId) showHome();
  else await showListView();
})();
