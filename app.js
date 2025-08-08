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
const clearCompletedBtn = document.getElementById('clearCompleted'); // <- wire this
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
  console.log('add clicked');
  const t = inputEl.value.trim();
  if (!t) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('items').insert({
    list_id: listId,
