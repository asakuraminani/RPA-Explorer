import { openDB } from 'idb';

const DB_NAME = 'rpa_viewer_db';
const DB_VERSION = 2; 

export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // Store for RPA archives metadata
      if (!db.objectStoreNames.contains('archives')) {
        const store = db.createObjectStore('archives', { keyPath: 'id' });
        store.createIndex('lastOpened', 'lastOpened');
      }
      
      // Store for music playlists
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'archiveId' });
      }

      // Store for global settings (simple key-value store)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });
}

// Archive Operations
export async function saveArchive(archive) {
  const db = await initDB();
  return db.put('archives', archive);
}

export async function getArchive(id) {
  const db = await initDB();
  return db.get('archives', id);
}

export async function getAllArchives() {
  const db = await initDB();
  return db.getAllFromIndex('archives', 'lastOpened');
}

export async function deleteArchive(id) {
  const db = await initDB();
  await db.delete('archives', id);
  // Also delete associated playlist
  await db.delete('playlists', id);
}

export async function clearAllArchives() {
  const db = await initDB();
  const tx = db.transaction(['archives', 'playlists'], 'readwrite');
  await Promise.all([
    tx.objectStore('archives').clear(),
    tx.objectStore('playlists').clear()
  ]);
  await tx.done;
}

// Playlist Operations
export async function getPlaylist(archiveId) {
  const db = await initDB();
  return db.get('playlists', archiveId);
}

export async function getAllPlaylists() {
  const db = await initDB();
  return db.getAll('playlists');
}

export async function savePlaylist(archiveId, data) {
  const db = await initDB();
  return db.put('playlists', { archiveId, ...data });
}

export async function deletePlaylist(archiveId) {
  const db = await initDB();
  return db.delete('playlists', archiveId);
}

export async function clearAllPlaylists() {
  const db = await initDB();
  return db.clear('playlists');
}

// Settings Operations
export async function getSetting(key) {
  const db = await initDB();
  return db.get('settings', key);
}

export async function saveSetting(key, value) {
  const db = await initDB();
  return db.put('settings', value, key);
}

// Storage Stats
export async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage,
      quota: estimate.quota
    };
  }
  return { usage: 0, quota: 0 };
}

export async function clearAllData() {
    const db = await initDB();
    const tx = db.transaction(['archives', 'playlists', 'settings'], 'readwrite');
    await Promise.all([
        tx.objectStore('archives').clear(),
        tx.objectStore('playlists').clear(),
        tx.objectStore('settings').clear()
    ]);
    await tx.done;
}
