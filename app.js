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

async function loadLists() {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Error loading lists', error);
    return;
  }
  renderLists(data || []);
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
    card.onclick = () => {
      location.href = `${location.pathname}?list=${l.id}`;
    };

    const h3 = document.createElement('h3');
    h3.textContent = l.name || 'Untitled list';

    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `Updated: ${fmt(l.updated_at)} • Created: ${fmt(l.created_at)}`;

    card.append(h3, meta);
    listsGrid.appendChild(card);
  }
}

async function createList() {
  const name = (newListNameEl?.value || '').trim() || 'My Shopping List';
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('lists')
    .insert({ name, created_at: now, updated_at: now })
    .select('id')
    .single();
  if (error) {
    alert('Error creating list: ' + error.message);
    return;
  }
  newListNameEl.value = '';
  // Navigate to list view
  location.href = `${location.pathname}?list=${data.id}`;
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
  const { data, error } = await supabase
    .from('lists')
    .select('name')
    .eq('id', listId)
    .single();
  if (!error && data) listNameEl.value = data.name || 'Shopping List';
}

async function saveListName() {
  const name = listNameEl.value.trim() || 'Shopping List';
  const { error } = await supabase
    .from('lists')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', listId);
  if (error) console.error('Error saving list name', error);
}

async function loadItemsAndRender() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Error loading items', error);
    return;
  }
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
    list_id: listId,
    text: t,
    done: false,
    quantity: '',
    note: '',
    created_at: now,
    updated_at: now,
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
  // remove ?list=… and show home
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
  // Choose mode by URL
  listId = qs('list');
  if (!listId) {
    showHome();
  } else {
    await showListView();
  }
})();
