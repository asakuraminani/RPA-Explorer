<template>
  <div v-if="isOpen" class="fixed inset-0 flex items-center justify-center z-[100] backdrop-blur-sm" @click.self="close">
    <div class="shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden transform transition-all bg-gray-900">
      
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
        </h2>
        <button @click="close" class="text-slate-400 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-6">
        
        <!-- General Settings -->
        <div class="space-y-4">
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider">General</h3>

            <div class="space-y-2">
                <div>
                    <div class="text-white font-medium">Default Startup Page</div>
                </div>
                <CustomSelect
                    v-model="startupPage"
                    :options="startupPageOptions"
                    placeholder="Select a startup page"
                />
            </div>

            <!-- Logging Toggle -->
            <div class="flex items-center justify-between">
                <div>
                    <div class="text-white font-medium">Enable Logging</div>
                </div>
                <button
                    @click="toggleLogging"
                    class="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full border transition-colors focus:outline-none"
                    :class="loggingEnabled ? 'border-emerald-500' : 'border-slate-600'"
                >
                    <span
                        class="inline-block h-4 w-4 transform rounded-full border transition-transform"
                        :class="loggingEnabled ? 'translate-x-6 border-emerald-500' : 'translate-x-1 border-slate-500'"
                    />
                </button>
            </div>
        </div>

        <hr class="border-slate-700" />

        <!-- Storage Management -->
        <div class="space-y-4">
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider">Data Management</h3>

            <!-- Clear Actions -->
            <div class="space-y-2">
                <button @click="clearRecentHistory" class="w-full flex cursor-pointer items-center justify-between px-4 py-2 border border-slate-700 text-white transition-colors text-sm hover:border-slate-600">
                    <span>Clear Recent History</span>
                    <span class="text-xs text-slate-400">Removes file history</span>
                </button>

                <button @click="clearMusicPlaylists" class="w-full flex cursor-pointer items-center justify-between px-4 py-2 border border-slate-700 text-white transition-colors text-sm hover:border-slate-600">
                    <span>Clear Music Playlists</span>
                    <span class="text-xs text-slate-400">Removes saved playlists</span>
                </button>
            </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="px-6 py-3 text-xs text-center text-slate-500 border-t border-slate-700">
        RPA Web Viewer v0.1.0
      </div>

    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useNavigationStore } from '../stores/navigation';
import { useFileStore } from '../stores/file';
import { usePersistenceStore } from '../stores/persistence';
import { useMusicStore } from '../stores/music';
import { storeToRefs } from 'pinia';
import { clearAllArchives, clearAllPlaylists } from '../utils/db';
import logger from '../utils/logger';
import CustomSelect from './CustomSelect.vue';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close']);

const settingsStore = useSettingsStore();
const navigationStore = useNavigationStore();
const fileStore = useFileStore();
const persistenceStore = usePersistenceStore();
const musicStore = useMusicStore();
const { loggingEnabled, startupPage } = storeToRefs(settingsStore);

const startupPageOptions = [
  { label: 'Project Page', value: 'home' },
  { label: 'Browse Page', value: 'browse' }
];

onMounted(async () => {
    await settingsStore.loadSettings();
});

function close() {
  emit('close');
}

function toggleLogging() {
    settingsStore.loggingEnabled = !settingsStore.loggingEnabled;
    logger.info(`Logging ${settingsStore.loggingEnabled ? 'enabled' : 'disabled'}`);
}

async function clearRecentHistory() {
    try {
        await clearAllArchives();
        persistenceStore.clearRuntimeState();
        fileStore.clearFile();
        musicStore.resetRuntimeState();
        navigationStore.setView('home');
        logger.success('Recent history cleared.');
    } catch (e) {
        logger.error(`Failed to clear data: ${e.message}`);
    }
}

async function clearMusicPlaylists() {
    try {
        await clearAllPlaylists();
        musicStore.resetRuntimeState();
        logger.success('Music playlists cleared.');
    } catch (e) {
        logger.error(`Failed to clear data: ${e.message}`);
    }
}
</script>
