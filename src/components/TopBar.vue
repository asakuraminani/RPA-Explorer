<script setup>
import { computed } from 'vue';
import { useNavigationStore } from '../stores/navigation';
import { useFileStore } from '../stores/file';
import ExtractionStatus from './ExtractionStatus.vue';
import MusicPlayer from './MusicPlayer.vue';

const navigationStore = useNavigationStore();
const fileStore = useFileStore();

const currentView = computed(() => navigationStore.currentView);
const isHome = computed(() => currentView.value === 'home');

const archiveInfo = computed(() => {
    if (fileStore.selectedFile) {
        return {
            name: fileStore.selectedFile.name,
            size: fileStore.selectedFile.size
        };
    }
    return null;
});

function goBack() {
    navigationStore.setView('home');
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

defineEmits(['openSettings']);
</script>

<template>
  <header class="h-14 flex items-center justify-between px-4 border-b border-slate-800 z-40 shrink-0 bg-gray-900">
    <div class="flex items-center gap-4">
      <div class="w-8 flex items-center justify-center shrink-0">
        <button 
          v-if="!isHome"
          @click="goBack"
          class="text-slate-400 hover:text-white transition-colors"
          title="Back to Home"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div v-else class="text-emerald-500">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
           </svg>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-mono text-slate-300 font-bold"> Ren'Py Archive Explorer </span>
      </div>
    </div>
    
    <div class="flex items-center gap-2">
      <ExtractionStatus />
      <MusicPlayer />

      <button
        @click="$emit('openSettings')" 
        class="p-2 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center justify-center w-10 h-10"
        title="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </header>
</template>
