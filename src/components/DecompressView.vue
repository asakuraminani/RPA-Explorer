<template>
  <div class="flex min-h-full items-center justify-center p-6 text-white">
    <div class="w-full max-w-2xl border border-gray-700 p-8 shadow-2xl">
      <div class="mb-8 text-center">
        <h2 class="mb-2 text-3xl font-bold">{{ archive?.title || extractionStore.currentArchiveName || archiveName || 'Extract Archive' }}</h2>

        <div v-if="fileStore.currentProject?.type === 'game_project'" class="mx-auto mb-4 max-w-xs text-left">
          <CustomSelect
            :model-value="file?.name"
            :options="rpaOptions"
            @change="onRpaSwitch"
          />
        </div>

        <p v-if="file" class="break-all text-sm text-gray-400">{{ file.name }} ({{ humanSize(file.size || 0) }})</p>
        <p v-else class="text-sm text-gray-500">No archive selected.</p>
      </div>

      <div v-if="extractionStore.error" class="mb-6 flex items-center justify-between border border-red-700 p-4 text-sm text-red-200">
        <span>{{ extractionStore.error }}</span>
        <button @click="extractionStore.reset()" class=" border border-red-700 px-2 py-1 text-xs transition-colors hover:border-red-600">Clear</button>
      </div>

      <div v-if="!file && !extractionStore.isProcessing && !extractionStore.isComplete" class="space-y-6 py-6 text-center">
        <div class="border border-gray-700 p-6">
          <h3 class="mb-2 text-lg font-semibold">No archive ready</h3>
          <p class="text-sm text-gray-400">Open a recent archive from Home first, or reconnect it there if browser access was lost.</p>
        </div>

        <div class="flex justify-center gap-4">
          <button
            @click="goHome"
            class="border border-gray-700 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:border-gray-600"
          >
            Back to Home
          </button>
        </div>
      </div>

      <div v-else-if="isPreparing && !extractionStore.isProcessing" class="py-10 text-center">
        <div class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-400"></div>
        <p class="text-sm text-gray-400">Preparing archive data...</p>
      </div>

      <div v-else-if="!extractionStore.isProcessing && !extractionStore.isComplete" class="space-y-6">
  
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div class="flex flex-col gap-3 border border-gray-600 p-4">
              <div class="flex items-center gap-2 font-bold text-blue-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Extract to Folder
              </div>
              <p class="flex-1 text-xs text-gray-400">
                Directly extracts files into a folder.
                <span class="mt-1 block text-emerald-500">Recommended for Chrome / Edge</span>
              </p>
              <button
                @click="startExtraction('folder')"
                class="w-full border cursor-pointer border-gray-700 px-4 py-2 text-sm font-bold text-white shadow-lg transition-colors duration-200 hover:border-gray-600"
              >
                Select Folder
              </button>
            </div>

            <div class="flex flex-col gap-3 border border-gray-600 p-4">
              <div class="flex items-center gap-2 font-bold text-yellow-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download as ZIP
              </div>
              <p class="flex-1 text-xs text-gray-400">
                Streams files into a single ZIP archive.
                <span class="mt-1 block text-yellow-500">For Firefox / Safari</span>
              </p>
              <button
                @click="startExtraction('zip')"
                class="w-full border cursor-pointer border-gray-700 px-4 py-2 text-sm font-bold text-white shadow-lg transition-colors duration-200 hover:border-gray-600"
              >
                Download ZIP
              </button>
            </div>
          </div>

        <div class="flex justify-center gap-4">
          <button
            @click="goHome"
            class="flex-1 border cursor-pointer border-gray-700 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:border-gray-600"
          >
            Back to Home
          </button>
          <button
            @click="goToBrowse"
            class="flex flex-1 cursor-pointer items-center justify-center gap-2 border border-gray-700 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:border-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Browse Files
          </button>
        </div>
      </div>

      <div v-else-if="extractionStore.isProcessing" class="space-y-6 py-8 text-center">
        <div class="relative pt-1">
          <div class="mb-2 flex items-center justify-between">
            <div>
              <span class="inline-block rounded-full px-2 py-1 text-xs font-semibold uppercase text-blue-200">Extracting</span>
            </div>
            <div class="text-right">
              <span class="inline-block text-xs font-semibold text-blue-200">{{ extractionStore.progress }}%</span>
            </div>
          </div>
          <div class="mb-4 flex h-4 overflow-hidden rounded text-xs">
            <div :style="{ width: extractionStore.progress + '%' }" class="flex flex-col justify-center whitespace-nowrap text-center text-white shadow-none transition-all duration-300"></div>
          </div>
          <p class="mb-4 truncate text-sm text-gray-400 animate-pulse">{{ extractionStore.statusMessage }}</p>
          <p class="text-xs italic text-gray-500">You can safely navigate to other pages; extraction will continue in the background.</p>
        </div>

        <div class="mt-8 flex justify-center gap-6">
          <button
            @click="extractionStore.isPaused ? extractionStore.resume() : extractionStore.pause()"
            class="flex items-center justify-center rounded-full p-5 text-white shadow-lg transition-all duration-200 hover:scale-110"
            :title="extractionStore.isPaused ? 'Resume' : 'Pause'"
          >
            <svg v-if="!extractionStore.isPaused" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>

          <button
            @click="extractionStore.stop()"
            class="flex items-center justify-center rounded-full p-5 text-white shadow-lg transition-all duration-200 hover:scale-110"
            title="Stop"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        </div>

        <div class="mt-4 flex justify-center gap-4">
          <button
            @click="goHome"
            class="flex-1 rounded-lg border border-gray-700 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:border-gray-600"
          >
            Back to Home
          </button>
          <button
            @click="goToBrowse"
            class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-700 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:border-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Browse Files
          </button>
        </div>
      </div>

      <div v-else-if="extractionStore.isComplete" class="py-8 text-center">
        <div class="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-green-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 class="mb-2 text-2xl font-bold text-white">Extraction Complete!</h3>
        <p class="mb-8 text-gray-400">All files from <strong>{{ extractionStore.currentArchiveName }}</strong> have been successfully extracted.</p>

        <div class="flex justify-center gap-4">
          <button
            @click="goHome"
            class="cursor-pointer border border-gray-700 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:border-gray-600"
          >
            Back to Home
          </button>
          <button
            @click="goToBrowse"
            class="flex items-center gap-2 cursor-pointer border border-gray-700 px-6 py-2 font-semibold text-white transition-colors duration-200 hover:border-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Browse Files
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useFileStore } from '../stores/file';
import { useNavigationStore } from '../stores/navigation';
import { usePersistenceStore } from '../stores/persistence';
import { useExtractionStore } from '../stores/extraction';
import { createFileArchiveId, getOrParseArchiveData, resolveProjectRpaFile } from '../utils/archive';
import CustomSelect from './CustomSelect.vue';

const fileStore = useFileStore();
const navigationStore = useNavigationStore();
const persistenceStore = usePersistenceStore();
const extractionStore = useExtractionStore();

const archiveInfo = ref({ name: '', size: 0, key: 0 });
const entries = ref([]);
const isPreparing = ref(false);
const localFile = ref(fileStore.selectedFile);

const file = computed(() => localFile.value);
const archive = computed(() => {
  if (fileStore.currentProject?.type === 'game_project') {
    return persistenceStore.archives.find((item) => item.id === fileStore.currentProject.id) || null;
  }

  if (!file.value) {
    return null;
  }

  return persistenceStore.archives.find((item) => item.id === createFileArchiveId(file.value)) || null;
});

const archiveName = computed(() => file.value?.name.replace(/\.rpa$/i, '') || '');

const rpaOptions = computed(() => {
  if (!fileStore.currentProject?.rpaFiles) {
    return [];
  }

  return fileStore.currentProject.rpaFiles.map((rpa) => ({
    label: `${rpa.name} (${humanSize(rpa.size)})`,
    value: rpa.name
  }));
});

watch(() => localFile.value, async (newFile, oldFile) => {
  if (newFile === oldFile || extractionStore.isProcessing) {
    return;
  }

  extractionStore.reset();

  if (!newFile) {
    entries.value = [];
    archiveInfo.value = { name: '', size: 0, key: 0 };
    isPreparing.value = false;
    return;
  }

  await prepare();
}, { immediate: true });

watch(() => fileStore.selectedFile, (newFile, oldFile) => {
  if (newFile === oldFile) {
    return;
  }

  localFile.value = newFile;
});

async function onRpaSwitch(filename) {
  if (filename === file.value?.name) {
    return;
  }

  try {
    const project = fileStore.currentProject;
    const { file: nextFile } = await resolveProjectRpaFile({
      project,
      filename,
      persistenceStore
    });

    extractionStore.reset();
    localFile.value = nextFile;
  } catch (err) {
    extractionStore.setError(`Failed to switch RPA: ${err.message}`);
  }
}

function goHome() {
  if (!extractionStore.isProcessing) {
    extractionStore.reset();
  }
  navigationStore.setView('home');
}

function goToBrowse() {
  if (!extractionStore.isProcessing) {
    extractionStore.reset();
  }
  navigationStore.setView('browse');
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

async function prepare() {
  const currentFile = file.value;
  if (!currentFile) {
    entries.value = [];
    archiveInfo.value = { name: '', size: 0, key: 0 };
    return;
  }

  isPreparing.value = true;

  try {
    const { data } = await getOrParseArchiveData(currentFile, persistenceStore);
    archiveInfo.value = { name: currentFile.name, size: currentFile.size, key: data.metadata.key };
    entries.value = data.entries;
  } catch (err) {
    extractionStore.setError(`Failed to parse RPA file: ${err.message}`);
  } finally {
    isPreparing.value = false;
  }
}

async function startExtraction(mode) {
  if (extractionStore.isProcessing) {
    return;
  }

  if (!file.value || entries.value.length === 0) {
    return;
  }

  const fileId = createFileArchiveId(file.value);

  if (mode === 'folder') {
    if (!window.showDirectoryPicker) {
      extractionStore.setError('Your browser does not support extracting directly to a folder. Please use "Download as ZIP" instead.');
      return;
    }

    try {
      const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const baseName = archiveName.value || 'output';
      let candidateName = baseName;
      let counter = 1;

      while (true) {
        try {
          await parentHandle.getDirectoryHandle(candidateName);
          candidateName = `${baseName}_${counter}`;
          counter++;
        } catch (err) {
          if (err.name === 'NotFoundError') break;
          throw err;
        }
      }

      const rootHandle = await parentHandle.getDirectoryHandle(candidateName, { create: true });
      extractionStore.startTask(fileId, file.value.name, rootHandle);
      extractionStore.runExtraction(file.value, entries.value, archiveInfo.value.key);
    } catch (err) {
      if (err.name !== 'AbortError') {
        extractionStore.setError(`Failed to start extraction: ${err.message}`);
      }
    }

    return;
  }

  extractionStore.startTask(fileId, file.value.name, null);
  extractionStore.runExtraction(file.value, entries.value, archiveInfo.value.key);
}
</script>
