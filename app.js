import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI elements
const listEl = document.getElementById('list');
const inputEl = document.getElementById('itemInput');
const addBtn = document.getElementById('addBtn');
const listNameEl = document.getElementById('listName');
const remainingEl = document.getElementById('remaining');
const clearAllBtn = document.getElementById('clearAll');
const clearCompletedBtn = document.getElementById('clearCompleted');  // NEW
const shareBtn = document.getElementById('shareBtn');

const fmt = (isoOrDate) => {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return isNaN(d?.getTime?.()) ? '…' : d.toLocaleString();
};
const qs = (k) => new URLSearchParams(location.search).get(k);

let listId = null;
let channel = null;

function logErr(prefix, error) {
  console.error(prefix, error);
  alert(`${prefix}: ${error?.message || error}`);
}

async function ensureList() {
  let id = qs('list');
  if (id) return id;

  const { data, error } = await supabase
    .from('lists')
    .insert({ name: 'My Shopping List' })
    .select('id')
    .single();

  if (error) throw error;
  id = data.id;
  history.replaceState(null, '', `?list=${id}`);
  return id;
}

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
  if (error) logErr('Error saving list name', error);
}

async function loadItemsAndRender() {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: true });
  if (error) return logErr('Error loading items', error);
  render(data || []);
}

function subscribeRealtime() {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel(`list_${listId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${listId}` },
      () => loadItemsAndRender()
    )
    .subscribe();
}

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
  if (error) return logErr('Error adding item', error);
  inputEl.value = '';
  inputEl.focus();
}

async function toggleDone(item) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('items')
    .update({ done: !item.done, updated_at: now })
    .eq('id', item.id);
  if (error) logErr('Error updating item', error);
}

async function editItem(item, newText) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('items')
    .update({ text: newText, updated_at: now })
    .eq('id', item.id);
  if (error) logErr('Error editing item', error);
}

async function removeItem(item) {
  const { error } = await supabase.from('items').delete().eq('id', item.id);
  if (error) logErr('Error deleting item', error);
}

async function clearAll() {
  if (!confirm('Clear all items?')) return;
  const { error } = await supabase.from('items').delete().eq('list_id', listId);
  if (error) logErr('Error clearing all', error);
}

async function clearCompleted() {                       // NEW
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('list_id', listId)
    .eq('done', true);
  if (error) logErr('Error clearing completed', error);
}

function share() {
  const url = location.href;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url)
      .then(() => alert('Shareable link copied to clipboard'))
      .catch(() => alert('Copy failed. Long-press and copy the URL.'));
  } else {
    prompt('Copy this link:', url); // fallback
  }
}

function render(items) {
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

// Wire up events (defensive checks)
if (addBtn) addBtn.onclick = addItem;
if (clearAllBtn) clearAllBtn.onclick = clearAll;
if (clearCompletedBtn) clearCompletedBtn.onclick = clearCompleted;   // NEW
if (shareBtn) shareBtn.onclick = share;
if (listNameEl) listNameEl.addEventListener('blur', saveListName);

// Init
(async function init() {
  try {
    listId = await ensureList();
    await loadListName();
    await loadItemsAndRender();
    subscribeRealtime();
  } catch (e) {
    logErr('Init failed', e);
  }
})();
