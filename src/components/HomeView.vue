<template>
  <div class="flex min-h-full flex-col items-center justify-start p-6 text-white">
    <div class="flex w-full max-w-4xl flex-col gap-8">
      <div
        class="flex h-80 w-full cursor-pointer flex-col items-center justify-center border-2 border-dashed p-8 text-center shadow-2xl transition-colors duration-300"
        :class="isDragging ? 'border-emerald-500' : 'border-gray-600 hover:border-emerald-500'"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
        @click="pickFile"
      >
        <h1 class="mb-4 text-3xl font-bold">Ren'Py Archive Explorer</h1>
        <p class="mb-4 text-gray-400">Drop a .rpa, .rpy, .rpyc, game folder, or macOS .app bundle here.</p>
        <p class="text-gray-400">
          Since browser security restrictions, you need to re-add the file or folder after refreshing or reopening the page.
        </p>

        <input
          ref="fileInputRef"
          type="file"
          accept=".rpa,.rpy,.rpyc"
          class="hidden"
          webkitdirectory="true"
          @change="onFileInputChange"
        />
      </div>

      <div
        v-if="localTip"
        class="flex items-start justify-between gap-4 border px-4 py-3 text-sm"
        :class="localTip.type === 'error'
          ? 'border-red-500/40 text-red-200'
          : localTip.type === 'success'
            ? 'border-green-500/40 text-green-200'
            : 'border-yellow-500/40 text-yellow-200'"
      >
        <span>{{ localTip.message }}</span>
        <button
          class="shrink-0 border border-current/30 px-2 py-1 text-xs transition hover:border-current/60"
          @click="clearLocalTip"
        >
          Dismiss
        </button>
      </div>

      <div v-if="isLoading || archives.length > 0" class="w-full">
        <h2 class="mb-4 px-1 text-xl font-bold text-gray-300">Recent</h2>

        <div v-if="isLoading" class=" border border-gray-700 px-5 py-8 text-center text-sm text-gray-400">
          Loading recent archives...
        </div>

        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="archive in archives"
            :key="archive.id"
            class="group relative overflow-hidden border border-gray-700 bg-gray-900 transition-colors hover:border-emerald-500"
          >
            <div
              class="absolute left-3 top-3 z-10 h-3 w-3 rounded-full"
              :class="canOpenArchive(archive) ? 'bg-green-400' : 'bg-yellow-400'"
              :title="canOpenArchive(archive) ? 'Available' : 'Needs reconnect'"
            />

            <div class="relative flex h-32 items-center justify-center overflow-hidden">
              <img
                v-if="archive.thumbnail"
                :src="getThumbnailUrl(archive)"
                class="h-full w-full object-cover opacity-70 transition duration-300 group-hover:scale-105 group-hover:opacity-100"
              />
              <div v-else class="text-gray-600 transition duration-300 group-hover:scale-105 group-hover:text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            <div class="space-y-2 p-4 text-xs">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1 truncate font-bold text-white" :title="archive.title || archive.name">{{ archive.title || archive.name }}</div>
                <span class="shrink-0 text-gray-400">{{ humanSize(archive.size) }}</span>
              </div>
              <div class="flex items-center justify-between gap-3 text-gray-500">
                <span class="min-w-0 flex-1 truncate">{{ archive.name }}</span>
                <span class="shrink-0">{{ new Date(archive.lastOpened).toLocaleDateString() }}</span>
              </div>
            </div>

            <div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-3 bg-gray-950/35 p-3 opacity-0 backdrop-blur-sm transition duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
              <template v-if="canOpenArchive(archive)">
                <button
                  class="flex h-10 w-10 cursor-pointer items-center justify-center border border-green-500/40 bg-gray-950/85 text-green-300 transition hover:border-green-400"
                  aria-label="Browse"
                  title="Browse"
                  @click="openArchive(archive, 'browse')"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3.75 7.5h4.5l1.5 2.25h10.5v6.75A2.25 2.25 0 0118 18.75H6A2.25 2.25 0 013.75 16.5V7.5z" />
                  </svg>
                </button>
                <button
                  class="flex h-10 w-10 cursor-pointer items-center justify-center border border-blue-500/40 bg-gray-950/85 text-blue-300 transition hover:border-blue-400"
                  aria-label="Extract"
                  title="Extract"
                  @click="openArchive(archive, 'extract')"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3.75v10.5m0 0l4.5-4.5m-4.5 4.5l-4.5-4.5M4.5 15.75v1.5A2.25 2.25 0 006.75 19.5h10.5A2.25 2.25 0 0019.5 17.25v-1.5" />
                  </svg>
                </button>
              </template>
              <button
                v-else
                class="flex h-10 w-10 cursor-pointer items-center justify-center border border-yellow-500/40 bg-gray-950/85 text-yellow-200 transition hover:border-yellow-400"
                aria-label="Reconnect"
                title="Reconnect"
                @click="reconnectArchive(archive)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16.023 9.348h4.992V4.356m-1.636 5.001a9 9 0 10.706 8.34" />
                </svg>
              </button>
              <button
                class="flex h-10 w-10 cursor-pointer items-center justify-center border border-red-500/40 bg-gray-950/85 text-red-300 transition hover:border-red-400"
                aria-label="Remove"
                title="Remove"
                @click="removeArchive(archive)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 7.5h12m-9.75 0V6A2.25 2.25 0 0110.5 3.75h3A2.25 2.25 0 0115.75 6v1.5m-8.25 0v10.125A2.625 2.625 0 0010.125 20.25h3.75A2.625 2.625 0 0016.5 17.625V7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useFileStore } from '../stores/file';
import { useNavigationStore } from '../stores/navigation';
import { usePersistenceStore } from '../stores/persistence';
import { useMusicStore } from '../stores/music';
import { createHandleFromEntry } from '../utils/fileSystemAdapter';
import { createFileArchiveId, getArchiveSelectionId, resolveFileSource, resolveProjectRpaFile } from '../utils/archive';
import { detectGameStructure } from '../utils/directoryParser';
import logger from '../utils/logger';

const fileStore = useFileStore();
const navigationStore = useNavigationStore();
const persistenceStore = usePersistenceStore();
const musicStore = useMusicStore();
const { archives, isLoading } = storeToRefs(persistenceStore);

const fileInputRef = ref(null);
const isDragging = ref(false);
const thumbnailCache = new Map();
const localTip = ref(null);
const SUPPORTED_DIRECT_FILE_EXTENSIONS = ['.rpa', '.rpy', '.rpyc'];

onMounted(() => {
  persistenceStore.loadArchives();
});

onUnmounted(() => {
  revokeAllThumbnailUrls();
});

watch(archives, (nextArchives) => {
  const validIds = new Set(nextArchives.filter((archive) => archive.thumbnail).map((archive) => archive.id));

  for (const [id, entry] of thumbnailCache.entries()) {
    if (!validIds.has(id)) {
      URL.revokeObjectURL(entry.url);
      thumbnailCache.delete(id);
    }
  }
});

function onDragOver() {
  isDragging.value = true;
}

function onDragLeave() {
  isDragging.value = false;
}

function setLocalTip(message, type = 'error') {
  localTip.value = { message, type };
}

function clearLocalTip() {
  localTip.value = null;
}

function isSupportedLooseFile(name) {
  const lower = name.toLowerCase();
  return SUPPORTED_DIRECT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function createFilesystemDirectorySession(handle) {
  return {
    id: `fs-dir:${handle.name}`,
    name: handle.name,
    title: handle.name,
    handle,
    browseMode: 'transient'
  };
}

async function createFilesystemFileSession(source) {
  const file = await resolveFileSource(source);
  if (!file) {
    throw new Error('Unable to read dropped file.');
  }

  return {
    id: `fs-file:${createFileArchiveId(file)}`,
    name: file.name,
    title: file.name,
    file,
    handle: source?.kind === 'file' ? source : null,
    browseMode: 'transient'
  };
}

async function openFilesystemDirectory(handle) {
  fileStore.setFilesystemDirectory(createFilesystemDirectorySession(handle));
  navigationStore.setView('browse');
}

async function openFilesystemFile(source) {
  const session = await createFilesystemFileSession(source);
  fileStore.setFilesystemFile(session);
  navigationStore.setView('browse');
}

async function handleDroppedDirectory(handle) {
  clearLocalTip();

  try {
    await detectGameStructure(handle);
    await persistenceStore.addArchive(handle);
  } catch (error) {
    if (error?.message?.includes('Valid Ren\'Py game structure not found') || error?.message?.includes('Could not find "game" directory inside the .app bundle.')) {
      await openFilesystemDirectory(handle);
      return;
    }

    logger.error(`Failed to add game project: ${error.message}`);
    setLocalTip(`Failed to add game project: ${error.message}`);
  }
}

async function onDrop(e) {
  isDragging.value = false;

  const items = [...e.dataTransfer.items];
  if (items.length > 0) {
    const item = items[0];
    try {
      if (item.getAsFileSystemHandle) {
        const handle = await item.getAsFileSystemHandle();
        if (handle) {
          if (handle.kind === 'directory') {
            await handleDroppedDirectory(handle);
            return;
          }

          if (handle.kind === 'file' && isSupportedLooseFile(handle.name)) {
            if (handle.name.toLowerCase().endsWith('.rpa')) {
              await handleFileWithHandle(handle);
            } else {
              await openFilesystemFile(handle);
            }
            return;
          }
        }
      }

      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) {
            await handleDroppedDirectory(createHandleFromEntry(entry));
            return;
          }

          if (entry.isFile && isSupportedLooseFile(entry.name)) {
            const handle = createHandleFromEntry(entry);
            if (entry.name.toLowerCase().endsWith('.rpa')) {
              await handleFileWithHandle(handle);
            } else {
              await openFilesystemFile(handle);
            }
            return;
          }
        }
      }
    } catch (err) {
      logger.warn(`File System Access API failed, falling back to File API: ${err.message}`);
    }
  }

  const files = e.dataTransfer.files;
  if (!files?.length) {
    return;
  }

  const file = files[0];
  if (file.name.toLowerCase().endsWith('.rpa')) {
    logger.info(`File dropped: ${file.name}`);
    await handleFile(file);
    return;
  }

  if (isSupportedLooseFile(file.name)) {
    await openFilesystemFile(file);
    return;
  }

  logger.error('Invalid file type. Please drop a .rpa, .rpy, .rpyc file, game folder, or .app bundle.');
  setLocalTip('Drop a .rpa, .rpy, .rpyc file, game folder, or macOS .app bundle.');
}

async function handleFileWithHandle(handle) {
  clearLocalTip();

  try {
    await persistenceStore.addArchive(handle);
  } catch (e) {
    logger.error(`Failed to add archive: ${e.message}`);
    setLocalTip(`Failed to add archive: ${e.message}`);
  }
}

function pickFile() {
  fileInputRef.value?.click();
}

async function onFileInputChange(e) {
  const file = e.target.files[0];
  if (!file) {
    return;
  }

  if (file.name.toLowerCase().endsWith('.rpa')) {
    await handleFile(file);
  } else if (isSupportedLooseFile(file.name)) {
    await openFilesystemFile(file);
  } else {
    setLocalTip('Please select a valid .rpa, .rpy, or .rpyc file.');
  }

  e.target.value = '';
}

async function handleFile(file) {
  clearLocalTip();

  if (!file.name.toLowerCase().endsWith('.rpa')) {
    setLocalTip('Please select a valid .rpa file.');
    return;
  }

  try {
    await persistenceStore.addArchive(file);
  } catch (e) {
    logger.error(`Failed to add archive: ${e.message}`);
    setLocalTip(`Failed to add archive: ${e.message}`);
  }
}

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(1)} ${units[idx]}`;
}

function getThumbnailUrl(archive) {
  if (!archive.thumbnail) {
    return '';
  }

  const cached = thumbnailCache.get(archive.id);
  if (cached?.blob === archive.thumbnail) {
    return cached.url;
  }

  if (cached) {
    URL.revokeObjectURL(cached.url);
  }

  const url = URL.createObjectURL(archive.thumbnail);
  thumbnailCache.set(archive.id, { blob: archive.thumbnail, url });
  return url;
}

function revokeAllThumbnailUrls() {
  for (const { url } of thumbnailCache.values()) {
    URL.revokeObjectURL(url);
  }
  thumbnailCache.clear();
}

function canOpenArchive(archive) {
  return Boolean(persistenceStore.getActiveFile(archive.id));
}

async function openArchive(archive, mode) {
  clearLocalTip();

  const activeSource = persistenceStore.getActiveFile(archive.id);

  if (!activeSource) {
    setLocalTip('Access was lost after refresh. Use Reconnect to link this item again.');
    return;
  }

  try {
    if (archive.type === 'game_project') {
      if (typeof activeSource.queryPermission === 'function' && typeof activeSource.requestPermission === 'function') {
        const permission = await activeSource.queryPermission({ mode: 'read' });
        if (permission !== 'granted') {
          const requested = await activeSource.requestPermission({ mode: 'read' });
          if (requested !== 'granted') {
            setLocalTip('Permission denied.');
            return;
          }
        }
      }

      const firstRpaName = archive.rpaFiles?.[0]?.name;
      if (!firstRpaName) {
        setLocalTip('No RPA files were found in this project.');
        return;
      }

      const projectContext = {
        type: 'game_project',
        id: archive.id,
        title: archive.title,
        name: archive.name,
        rpaFiles: archive.rpaFiles,
        handle: activeSource
      };

      const { file } = await resolveProjectRpaFile({
        project: projectContext,
        filename: firstRpaName,
        persistenceStore
      });

      fileStore.setFile(file, projectContext);
    } else {
      const file = await resolveFileSource(activeSource);
      if (!file) {
        setLocalTip('Access was lost after refresh. Use Reconnect to link this item again.');
        return;
      }

      fileStore.setFile(file, {
        type: 'archive_file',
        name: archive.name,
        id: archive.id,
        title: archive.title
      });
    }

    if (mode === 'browse') {
      navigationStore.setView('browse');
    } else if (mode === 'extract') {
      navigationStore.setView('decompress');
    }
  } catch (e) {
    logger.error(`Failed to open archive: ${e.message}`);
    setLocalTip(`Failed to open archive: ${e.message}`);
  }
}

async function reconnectArchive(archive) {
  clearLocalTip();

  try {
    let id = null;

    if (archive.type === 'game_project') {
      if (typeof window.showDirectoryPicker !== 'function') {
        setLocalTip('Re-add this project by dragging the game folder or .app bundle onto the page.');
        return;
      }

      const handle = await window.showDirectoryPicker();
      id = await persistenceStore.addArchive(handle);
    } else {
      if (typeof window.showOpenFilePicker !== 'function') {
        setLocalTip('Re-add this archive by dragging the .rpa file onto the page.');
        return;
      }

      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Ren'Py archives",
            accept: {
              'application/octet-stream': ['.rpa']
            }
          }
        ]
      });

      if (!handle) {
        return;
      }

      id = await persistenceStore.addArchive(handle);
    }

    if (id !== archive.id) {
      setLocalTip('Archive was added again as a new recent item.', 'success');
    }
  } catch (e) {
    if (e?.name === 'AbortError') {
      return;
    }

    logger.error(`Failed to reconnect archive: ${e.message}`);
    setLocalTip(`Failed to reconnect archive: ${e.message}`);
  }
}

async function removeArchive(archive) {
  clearLocalTip();

  try {
    const affectedPlaylistIds = archive.type === 'game_project' && archive.rpaFiles
      ? archive.rpaFiles.map((rpa) => createFileArchiveId(rpa))
      : [archive.id];
    const currentSelectionId = fileStore.selectedFile
      ? getArchiveSelectionId(fileStore.selectedFile, fileStore.currentProject)
      : null;
    const isRemovingCurrentContext = archive.id === fileStore.currentProject?.id || (currentSelectionId && affectedPlaylistIds.includes(currentSelectionId));

    await persistenceStore.removeArchive(archive.id);

    if (isRemovingCurrentContext) {
      fileStore.clearFile();
    }

    if (affectedPlaylistIds.includes(musicStore.currentArchiveId)) {
      musicStore.clearPlaylist();
      musicStore.currentArchiveId = null;
    }

    await musicStore.loadAllPlaylists();
  } catch (e) {
    logger.error(`Failed to remove archive: ${e.message}`);
    setLocalTip(`Failed to remove archive: ${e.message}`);
  }
}
</script>
