import { defineStore } from 'pinia';
import { ref, watch, toRaw, computed } from 'vue';
import { savePlaylist, getPlaylist, getAllPlaylists, deletePlaylist as dbDeletePlaylist } from '../utils/db';
import { usePersistenceStore } from './persistence';
import { createFileArchiveId } from '../utils/archive';

export const useMusicStore = defineStore('music', () => {
  const persistenceStore = usePersistenceStore();
  const isPlaying = ref(false);
  const isPausedByPreview = ref(false);
  const playlist = ref([]);
  const currentIndex = ref(0);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(0.5);
  const currentArchiveId = ref(null);
  const allPlaylists = ref([]); // Store all loaded playlists meta

  function resolveArchiveName(archiveId) {
    const directArchive = persistenceStore.archives.find((archive) => archive.id === archiveId);
    if (directArchive?.name) {
      return directArchive.name;
    }

    for (const archive of persistenceStore.archives) {
      if (archive.type !== 'game_project' || !archive.rpaFiles) {
        continue;
      }

      const rpa = archive.rpaFiles.find((entry) => createFileArchiveId(entry) === archiveId);
      if (rpa?.name) {
        return rpa.name;
      }
    }

    const activeFile = persistenceStore.getActiveFile(archiveId);
    if (activeFile?.name) {
      return activeFile.name;
    }

    return '';
  }

  // Load all playlists (meta only if possible, but IDB returns full objects)
  async function loadAllPlaylists() {
    try {
      const lists = await getAllPlaylists();
      // Enrich with archive metadata (title, name)
      // We need persistence store loaded
      if (persistenceStore.archives.length === 0) {
        await persistenceStore.loadArchives();
      }
      
      allPlaylists.value = lists.map(list => {
        const archive = persistenceStore.archives.find(a => a.id === list.archiveId);
        const archiveName = list.archiveName || resolveArchiveName(list.archiveId);
        return {
          ...list,
          title: archive ? (archive.title || archive.name) : archiveName || list.archiveId,
          archiveName,
          isLoaded: persistenceStore.getActiveFile(list.archiveId) !== undefined
        };
      });
    } catch (e) {
      console.error('Failed to load all playlists:', e);
    }
  }

  // Load playlist from DB for a specific archive
  async function loadPlaylist(archiveId) {
    if (!archiveId) return;
    try {
      // First check if we already have it in allPlaylists to avoid DB hit if possible?
      // But we need to set the ACTIVE playlist.
      
      const data = await getPlaylist(archiveId);
      if (data && data.tracks && data.tracks.length > 0) {
        playlist.value = data.tracks;
        currentArchiveId.value = archiveId;
        currentIndex.value = data.lastPlayedIndex || 0;
        
        // Refresh all playlists list to ensure this one is up to date or added
        await loadAllPlaylists();
      } else {
        // No playlist found
      }
    } catch (e) {
      console.error('Failed to load playlist:', e);
    }
  }

  // Save current playlist to DB
  async function persistPlaylist(options = {}) {
    if (!currentArchiveId.value) return;
    try {
      const rawPlaylist = toRaw(playlist.value);
      const existing = await getPlaylist(currentArchiveId.value);
      const archiveName = options.archiveName || existing?.archiveName || resolveArchiveName(currentArchiveId.value);

      await savePlaylist(currentArchiveId.value, {
        tracks: rawPlaylist,
        lastPlayedIndex: currentIndex.value,
        archiveName
      });
    } catch (e) {
      console.error('Failed to save playlist:', e);
    }
  }

  // Watch for changes to persist
  watch([playlist, currentIndex], () => {
    if (currentArchiveId.value) {
      persistPlaylist();
    }
  }, { deep: true });

  function setPreviewPlaying(isPreviewPlaying) {
    if (isPreviewPlaying) {
      if (isPlaying.value) {
        isPlaying.value = false;
        isPausedByPreview.value = true;
      }
    } else {
      if (isPausedByPreview.value) {
        isPlaying.value = true;
        isPausedByPreview.value = false;
      }
    }
  }

  function play() {
    isPlaying.value = true;
    isPausedByPreview.value = false; 
  }

  function pause() {
    isPlaying.value = false;
    isPausedByPreview.value = false; 
  }

  function next() {
    if (playlist.value.length === 0) return;
    currentIndex.value = (currentIndex.value + 1) % playlist.value.length;
    isPlaying.value = true;
    isPausedByPreview.value = false;
  }

  function prev() {
    if (playlist.value.length === 0) return;
    currentIndex.value = (currentIndex.value - 1 + playlist.value.length) % playlist.value.length;
    isPlaying.value = true;
    isPausedByPreview.value = false;
  }

  function addTracks(files) {
    playlist.value.push(...files);
    if (playlist.value.length === files.length) {
        currentIndex.value = 0;
    }
  }
  
  function clearPlaylist() {
      playlist.value = [];
      currentIndex.value = 0;
      currentTime.value = 0;
      duration.value = 0;
      isPlaying.value = false;
      isPausedByPreview.value = false;
  }

  function resetRuntimeState() {
    clearPlaylist();
    currentArchiveId.value = null;
    allPlaylists.value = [];
  }

  function setCurrentIndex(index) {
    if (index >= 0 && index < playlist.value.length) {
      currentIndex.value = index;
      isPlaying.value = true;
      isPausedByPreview.value = false;
    }
  }

  async function deletePlaylist(archiveId) {
    if (!archiveId) return;
    try {
      await dbDeletePlaylist(archiveId);
      
      // If we are currently playing this playlist, clear it
      if (currentArchiveId.value === archiveId) {
        clearPlaylist();
        currentArchiveId.value = null;
      }
      
      // Refresh list
      await loadAllPlaylists();
    } catch (e) {
      console.error('Failed to delete playlist:', e);
    }
  }

  return {
    isPlaying,
    isPausedByPreview,
    playlist,
    currentIndex,
    currentTime,
    duration,
    volume,
    currentArchiveId,
    setPreviewPlaying,
    play,
    pause,
    next,
    prev,
    addTracks,
    clearPlaylist,
    setCurrentIndex,
    loadPlaylist,
    persistPlaylist,
    allPlaylists,
    loadAllPlaylists,
    deletePlaylist,
    resetRuntimeState
  };
});
