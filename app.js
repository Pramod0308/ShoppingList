import { firebaseConfig } from './firebase-config.js';

// Firebase v10 Modular CDN imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, enableIndexedDbPersistence, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Offline persistence (best effort)
enableIndexedDbPersistence(db).catch(() => {});

// Elements
const listEl = document.getElementById('list');
const inputEl = document.getElementById('itemInput');
const addBtn = document.getElementById('addBtn');
const listNameEl = document.getElementById('listName');
const remainingEl = document.getElementById('remaining');
const clearAllBtn = document.getElementById('clearAll');
const clearCompletedBtn = document.getElementById('clearCompleted');
const shareBtn = document.getElementById('shareBtn');
const whoamiEl = document.getElementById('whoami');

// Utilities
const fmt = (ts) => ts?.toDate ? ts.toDate().toLocaleString() : '…';
const qs = (k) => new URLSearchParams(location.search).get(k);

// List identity via URL (?list=ID). If missing, create one.
async function ensureList() {
  let listId = qs('list');
  if (!listId) {
    // Create a new list and redirect with its id (personal scratch list).
    const docRef = await addDoc(collection(db, 'lists'), {
      name: 'My Shopping List',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    listId = docRef.id;
    history.replaceState(null, '', `?list=${listId}`);
  }
  return listId;
}

let listId = null;
let unsubItems = null;

// Auth: anonymous (auto)
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    await signInAnonymously(auth);
    return;
  }
  whoamiEl.textContent = `Signed in as ${user.uid.substring(0,6)}… (anonymous)`;
  listId = await ensureList();
  initList(listId);
});

async function initList(listId) {
  // Listen to list doc for name
  const listDocRef = doc(db, 'lists', listId);
  const listSnap = await getDoc(listDocRef);
  if (listSnap.exists()) {
    listNameEl.value = listSnap.data().name || 'Shopping List';
  }
  // Save name on blur
  listNameEl.addEventListener('blur', async () => {
    await updateDoc(listDocRef, { name: listNameEl.value.trim() || 'Shopping List', updatedAt: serverTimestamp() });
  });

  // Real-time items
  const itemsRef = collection(db, 'lists', listId, 'items');
  if (unsubItems) unsubItems();
  unsubItems = onSnapshot(query(itemsRef, orderBy('createdAt', 'asc')), (snap) => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render(items);
  });

  // Add item
  addBtn.onclick = async () => {
    const t = inputEl.value.trim();
    if (!t) return;
    await addDoc(itemsRef, {
      text: t, done: false, quantity: '', note: '',
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || null,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || null
    });
    inputEl.value = '';
    inputEl.focus();
  };
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtn.click(); });

  // Clear completed
  clearCompletedBtn.onclick = async () => {
    const checkboxes = document.querySelectorAll('.checkbox');
    const deletions = [];
    checkboxes.forEach((cb) => {
      if (cb.checked) {
        const id = cb.dataset.id;
        deletions.push(deleteDoc(doc(db, 'lists', listId, 'items', id)));
      }
    });
    await Promise.all(deletions);
  };

  // Clear all
  clearAllBtn.onclick = async () => {
    if (!confirm('Clear all items?')) return;
    // naive: fetch current set and delete
    const snapshot = await (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')).getDocs(itemsRef);
    const batch = (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')).writeBatch(db);
    snapshot.forEach(docu => batch.delete(doc(db, 'lists', listId, 'items', docu.id)));
    await batch.commit();
  };

  // Share link
  shareBtn.onclick = async () => {
    const url = location.origin + location.pathname + `?list=${listId}`;
    await navigator.clipboard.writeText(url);
    alert('Shareable link copied to clipboard. Anyone with the link can edit this list.');
  };
}

function render(items) {
  // Remaining
  const remaining = items.filter(i => !i.done).length;
  remainingEl.textContent = `${remaining} remaining`;

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
    cb.dataset.id = item.id;
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
    meta.innerHTML = `<div>Added: ${fmt(item.createdAt)}</div><div>Updated: ${fmt(item.updatedAt)}</div>`;

    li.append(row, meta);
    listEl.appendChild(li);
  }
}

async function toggleDone(item) {
  const ref = doc(db, 'lists', listId, 'items', item.id);
  await updateDoc(ref, {
    done: !item.done,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null
  });
}

async function editItem(item, newText) {
  const ref = doc(db, 'lists', listId, 'items', item.id);
  await updateDoc(ref, {
    text: newText,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid || null
  });
}

async function removeItem(item) {
  const ref = doc(db, 'lists', listId, 'items', item.id);
  await deleteDoc(ref);
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' });
  });
}
