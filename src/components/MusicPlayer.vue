<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useMusicStore } from '../stores/music';
import { useFileStore } from '../stores/file';
import { getRpaFileData, detectFileType } from '../utils/rpaFileHelper';
import { usePersistenceStore } from '../stores/persistence';
import { useNavigationStore } from '../stores/navigation';
import { getArchiveSelectionId, getOrParseArchiveData, resolveFileSource, resolveProjectRpaFile } from '../utils/archive';
import logger from '../utils/logger';
import CustomSelect from './CustomSelect.vue';

const store = useMusicStore();
const fileStore = useFileStore();
const persistenceStore = usePersistenceStore();
const navigationStore = useNavigationStore();

const expanded = ref(false);
const loading = ref(false);
const expandedPlaylistId = ref(null);
const localFile = ref(fileStore.selectedFile);

const pageSelectionId = computed(() => {
  if (!fileStore.selectedFile) {
    return null;
  }

  return getArchiveSelectionId(fileStore.selectedFile, fileStore.currentProject);
});

const scanTargetArchiveId = computed(() => {
  if (!localFile.value) {
    return null;
  }

  return getArchiveSelectionId(localFile.value, fileStore.currentProject);
});

const toggleExpanded = () => {
  expanded.value = !expanded.value;
};

const goToExtraction = () => {
  navigationStore.setView('decompress');
};

const audio = new Audio();

watch(() => fileStore.selectedFile, (newFile) => {
  localFile.value = newFile;
});

watch(pageSelectionId, async (archiveId) => {
  expandedPlaylistId.value = archiveId;

  if (!archiveId) {
    return;
  }

  if (store.currentArchiveId === archiveId && store.playlist.length > 0) {
    return;
  }

  if (store.playlist.length > 0) {
    return
  }

}, { immediate: true });

onMounted(async () => {
  await store.loadAllPlaylists();
  audio.addEventListener('timeupdate', handleTimeUpdate);
  audio.addEventListener('loadedmetadata', handleLoadedMetadata);
  audio.addEventListener('ended', handleEnded);
});

const Icons = {
  Music: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  Play: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg>`,
  Pause: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  Next: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
  Prev: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/></svg>`,
  Close: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  Folder: `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  Trash: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  Extract: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  Check: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
};

const deletePlaylist = async (archiveId) => {
  await store.deletePlaylist(archiveId);

  if (expandedPlaylistId.value === archiveId) {
    expandedPlaylistId.value = null;
  }
};

const currentTrack = computed(() => {
  if (store.playlist.length === 0) return null;
  return store.playlist[store.currentIndex];
});

const formatTime = (seconds) => {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const togglePlaylist = (id) => {
  if (expandedPlaylistId.value === id) {
    expandedPlaylistId.value = null;
  } else {
    expandedPlaylistId.value = id;
  }
};

const isArchiveLoaded = (archiveId) => {
  persistenceStore.activeHandleVersion;

  if (pageSelectionId.value === archiveId) {
    return true;
  }

  return persistenceStore.getActiveFile(archiveId) !== undefined;
};

const rpaOptions = computed(() => {
  if (!fileStore.currentProject?.rpaFiles) return [];
  return fileStore.currentProject.rpaFiles.map((rpa) => ({
    label: `${rpa.name}`,
    value: rpa.name
  }));
});

const playTrack = async (list, index) => {
  if (!isArchiveLoaded(list.archiveId)) {
    logger.warn('Tried to play music from an unavailable archive.');
    return;
  }

  if (store.currentArchiveId !== list.archiveId) {
    store.playlist = list.tracks;
    store.currentArchiveId = list.archiveId;
  }

  store.setCurrentIndex(index);
};

const onRpaSwitch = async (filename) => {
  if (filename === localFile.value?.name) {
    return;
  }

  try {
    loading.value = true;
    const project = fileStore.currentProject;
    const { file } = await resolveProjectRpaFile({
      project,
      filename,
      persistenceStore
    });

    localFile.value = file;
  } catch (err) {
    logger.error(`Failed to switch RPA for music scan: ${err.message}`);
  } finally {
    loading.value = false;
  }
};

const scanMusic = async () => {
  const file = localFile.value;
  if (!file) {
    return;
  }

  loading.value = true;
  store.clearPlaylist();

  try {
    const archiveId = scanTargetArchiveId.value || getArchiveSelectionId(file, fileStore.currentProject);
    const archiveName = file.name;
    const { data } = await getOrParseArchiveData(file, persistenceStore);
    const audioEntries = data.entries.filter((entry) => {
      const ext = entry.path.split('.').pop().toLowerCase();
      return ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'opus'].includes(ext);
    });

    const validTracks = [];

    for (const entry of audioEntries) {
      try {
        const buffer = await getRpaFileData(file, entry, data.key);
        let ext = entry.path.split('.').pop().toLowerCase();
        const detectedExt = await detectFileType(buffer);

        if (detectedExt) {
          ext = detectedExt;
        }

        let mime = 'audio/mpeg';
        if (ext === 'ogg') mime = 'audio/ogg';
        if (ext === 'wav') mime = 'audio/wav';
        if (ext === 'flac') mime = 'audio/flac';
        if (ext === 'mp3') mime = 'audio/mpeg';

        const blob = new Blob([buffer], { type: mime });
        const url = URL.createObjectURL(blob);
        const duration = await getAudioDuration(url);

        if (duration > 30) {
          validTracks.push({
            name: entry.path,
            entry,
            duration
          });
        }

        URL.revokeObjectURL(url);
      } catch (err) {
        logger.warn(`Error processing audio file ${entry.path}: ${err.message}`);
      }
    }

    store.currentArchiveId = archiveId;
    expandedPlaylistId.value = archiveId;

    if (validTracks.length > 0) {
      store.addTracks(validTracks);
      await store.persistPlaylist({ archiveName });
      await store.loadAllPlaylists();
    } else {
      await store.loadAllPlaylists();
    }
  } catch (err) {
    logger.error(`Failed to scan music: ${err.message}`);
  } finally {
    loading.value = false;
  }
};

const getAudioDuration = (url) => {
  return new Promise((resolve, reject) => {
    const tempAudio = new Audio();
    tempAudio.preload = 'metadata';
    tempAudio.onloadedmetadata = () => {
      resolve(tempAudio.duration);
    };
    tempAudio.onerror = () => {
      reject(new Error('Error loading metadata'));
    };
    tempAudio.src = url;
  });
};

const handleTimeUpdate = () => {
  store.currentTime = audio.currentTime;
};

const handleLoadedMetadata = () => {
  store.duration = audio.duration;
};

const handleEnded = () => {
  store.next();
};

let currentObjectUrl = null;

onUnmounted(() => {
  audio.removeEventListener('timeupdate', handleTimeUpdate);
  audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
  audio.removeEventListener('ended', handleEnded);
  audio.pause();
  audio.src = '';
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }
});

watch(() => store.isPlaying, (isPlaying) => {
  if (isPlaying) {
    audio.play().catch((err) => logger.error(`Play error: ${err.message}`));
  } else {
    audio.pause();
  }
});

watch(currentTrack, async (track) => {
  if (!track) {
    audio.pause();
    audio.src = '';
    store.currentTime = 0;
    store.duration = 0;

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    return;
  }

  const wasPlaying = store.isPlaying;

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  try {
    let src = track.url;

    if (track.entry) {
      let archiveFile = localFile.value;

      if (!archiveFile || scanTargetArchiveId.value !== store.currentArchiveId) {
        archiveFile = await resolveFileSource(persistenceStore.getActiveFile(store.currentArchiveId));
      }

      if (!archiveFile) {
        logger.warn('No archive file available for playback.');
        return;
      }

      const { data } = await getOrParseArchiveData(archiveFile, persistenceStore);
      const buffer = await getRpaFileData(archiveFile, track.entry, data.key);
      const ext = track.entry.path.split('.').pop().toLowerCase();

      let mime = 'audio/mpeg';
      if (ext === 'ogg') mime = 'audio/ogg';
      if (ext === 'wav') mime = 'audio/wav';
      if (ext === 'flac') mime = 'audio/flac';

      const blob = new Blob([buffer], { type: mime });
      currentObjectUrl = URL.createObjectURL(blob);
      src = currentObjectUrl;
    }

    audio.src = src;
    audio.load();
    if (wasPlaying) {
      audio.play().catch((err) => logger.error(`Play error: ${err.message}`));
    }
  } catch (err) {
    logger.error(`Failed to load track: ${err.message}`);
  }
});

const seek = (e) => {
  const time = parseFloat(e.target.value);
  audio.currentTime = time;
  store.currentTime = time;
};

const togglePlay = () => {
  if (store.isPlaying) store.pause();
  else store.play();
};
</script>

<template>
  <div class="relative flex flex-col items-end">
    <div class="flex flex-col items-end">
        <button
            @click="toggleExpanded"
            class="p-2 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center justify-center w-10 h-10 group"
            :class="{'text-white': expanded}"
            title="Music Player"
        >
            <div class="relative pointer-events-none flex items-center justify-center">
                <span v-html="Icons.Music" class="group-hover:text-emerald-400 transition-colors w-5 h-5"></span>
                <span v-if="store.isPlaying" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-pulse border-2 border-emerald-500 bg-emerald-500"></span>
            </div>
        </button>

        <div
            v-if="expanded"
            class="absolute top-12 right-0 backdrop-blur-md border border-slate-700 flex flex-col w-72 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 z-50 bg-gray-900"
        >
            <div
                class="flex items-start justify-between gap-2 p-4 pb-2 select-none"
            >
                <div class="flex flex-col overflow-hidden pointer-events-none">
                    <span class="text-xs font-bold text-slate-200 truncate leading-tight">
                        {{ currentTrack?.name || 'No Music Selected' }}
                    </span>
                    <span class="text-[10px] text-slate-500 font-mono mt-0.5">
                        {{ store.playlist.length }} tracks loaded
                    </span>
                </div>
                <button @click="toggleExpanded" class="text-slate-500 hover:text-slate-300 transition-colors p-1 -mr-1 -mt-1 rounded-md">
                    <span v-html="Icons.Close"></span>
                </button>
            </div>

            <div class="p-4 pt-1 flex flex-col gap-3">
            <div class="space-y-1">
                <input
                    type="range"
                    min="0"
                    :max="store.duration || 0"
                    :value="store.currentTime"
                    :disabled="!currentTrack"
                    @input="seek"
                    class="w-full h-3 appearance-none cursor-pointer bg-transparent focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                <div class="flex justify-between text-[10px] text-slate-500 font-mono px-0.5">
                    <span>{{ formatTime(store.currentTime) }}</span>
                    <span>{{ formatTime(store.duration) }}</span>
                </div>
            </div>

            <div class="flex items-center justify-center gap-6 py-1">
                <button
                    @click="store.prev()"
                    class="text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    :disabled="!currentTrack"
                    title="Previous"
                >
                    <span v-html="Icons.Prev"></span>
                </button>

                <button
                    @click="togglePlay"
                    class="w-10 h-10 flex items-center justify-center text-white rounded-full border border-emerald-500 shadow-lg hover:text-emerald-400 hover:border-emerald-400 hover:shadow-emerald-500/20 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                    :disabled="!currentTrack"
                >
                    <span v-if="!store.isPlaying" v-html="Icons.Play" class="ml-0.5"></span>
                    <span v-else v-html="Icons.Pause"></span>
                </button>

                <button
                    @click="store.next()"
                    class="text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    :disabled="!currentTrack"
                    title="Next"
                >
                    <span v-html="Icons.Next"></span>
                </button>
            </div>

            <div class="border-t border-slate-800 pt-3 mt-1">
                <div v-if="fileStore.currentProject?.type === 'game_project'" class="mb-2">
                     <CustomSelect
                        :model-value="localFile?.name"
                        :options="rpaOptions"
                        @change="onRpaSwitch"
                    />
                </div>

                <button
                    @click="scanMusic"
                    class="flex items-center justify-center gap-2 w-full py-2 px-3 text-xs text-slate-300 hover:text-white cursor-pointer transition-colors border border-slate-700/50 hover:border-slate-600"
                    :class="{ 'opacity-50 pointer-events-none': loading || !localFile }"
                    :title="!localFile ? 'Please load an RPA file first' : ''"
                >
                    <span v-html="Icons.Folder" :class="{ 'animate-pulse': loading }"></span>
                    <span>{{ loading ? 'Scanning RPA...' : (localFile ? 'Scan RPA Music (>30s)' : 'Load RPA First') }}</span>
                </button>
            </div>

            <div class="border-t border-slate-800 pt-3 mt-1 max-h-64 overflow-y-auto">
                <div v-if="store.allPlaylists.length === 0" class="text-center text-[10px] text-slate-500 py-2">
                    No playlists cached
                </div>

                <div v-for="list in store.allPlaylists" :key="list.archiveId" class="mb-2 relative">
                    <div
                        @click="togglePlaylist(list.archiveId)"
                        class="flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors group"
                        :class="{'text-white': list.archiveId === expandedPlaylistId}"
                    >
                        <div class="flex items-center gap-2 overflow-hidden flex-1">
                            <span
                                class="w-2 h-2 rounded-full flex-shrink-0 border"
                                :class="isArchiveLoaded(list.archiveId) ? 'border-emerald-500' : 'border-slate-600'"
                                :title="isArchiveLoaded(list.archiveId) ? 'RPA Loaded' : 'RPA Not Loaded'"
                            ></span>
                            <div class="flex items-baseline justify-between flex-1 overflow-hidden gap-2">
                                <span class="text-[11px] font-bold text-slate-300 truncate">{{ list.archiveName || list.title }}</span>
                                <span class="text-[9px] text-slate-500 truncate flex-shrink-0" v-if="list.title && list.archiveName && list.title !== list.archiveName">{{ list.title }}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button @click.stop="deletePlaylist(list.archiveId)" class="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-sm" title="Delete Playlist">
                                <span v-html="Icons.Trash"></span>
                            </button>
                            <span class="text-[10px] text-slate-500 group-hover:text-slate-400">
                                {{ list.archiveId === expandedPlaylistId ? '▼' : '▶' }}
                            </span>
                        </div>
                    </div>

                    <ul v-if="list.archiveId === expandedPlaylistId" class="pl-2 mt-1 space-y-0.5 border-l border-slate-800 ml-3 max-h-32 overflow-y-auto">
                        <li
                            v-for="(track, index) in list.tracks"
                            :key="index"
                            @click="playTrack(list, index)"
                            class="flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors text-[10px]"
                            :class="[
                                (store.currentArchiveId === list.archiveId && index === store.currentIndex)
                                    ? 'text-emerald-400'
                                    : (isArchiveLoaded(list.archiveId) ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 cursor-not-allowed')
                            ]"
                        >
                            <div class="flex items-center gap-2 overflow-hidden">
                                <span v-if="store.currentArchiveId === list.archiveId && index === store.currentIndex" class="w-1 h-1 rounded-full animate-pulse flex-shrink-0 border border-emerald-500"></span>
                                <span class="truncate font-mono">{{ track.name.split('/').pop() }}</span>
                            </div>
                            <span class="font-mono opacity-50 flex-shrink-0 ml-2 text-[9px]">{{ formatTime(track.duration) }}</span>
                        </li>
                    </ul>
                </div>
            </div>
            </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
input[type=range] {
  -webkit-appearance: none;
  appearance: none;
}

input[type=range]::-webkit-slider-runnable-track {
  height: 1px;
  background: rgb(51 65 85);
  border-radius: 9999px;
}

input[type=range]::-moz-range-track {
  height: 1px;
  background: rgb(51 65 85);
  border-radius: 9999px;
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background: #10b981;
  cursor: pointer;
  margin-top: -5.5px;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

input[type=range]::-moz-range-thumb {
  height: 12px;
  width: 12px;
  border: none;
  border-radius: 50%;
  background: #10b981;
  cursor: pointer;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}
</style>

