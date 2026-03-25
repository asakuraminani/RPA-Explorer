<template>
  <template v-if="settingsStore.loggingEnabled">
    <div v-if="isVisible" class="fixed bottom-0 right-0 w-full md:w-1/2 lg:w-1/3 border-t border-slate-700 shadow-xl z-50 flex flex-col max-h-96 bg-gray-900">
      <div class="flex items-center justify-between p-2 border-b border-slate-700">
        <h3 class="text-sm font-semibold text-slate-300">Application Logs</h3>
        <div class="flex items-center space-x-2">
          <button @click="clearLogs" class="text-xs text-slate-400 hover:text-red-400 transition-colors">
            Clear
          </button>
          <button @click="toggleVisibility" class="text-slate-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      <div class="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1" ref="logContainer">
        <div v-if="logs.length === 0" class="text-slate-500 italic text-center py-4">
          No logs recorded.
        </div>
        <div v-else v-for="log in logs" :key="log.id" class="flex space-x-2 break-all rounded px-1 py-0.5">
          <span class="text-slate-500 shrink-0">[{{ log.timestamp }}]</span>
          <span :class="getTypeClass(log.type)" class="font-bold shrink-0 uppercase w-16 text-center text-[10px] leading-4 rounded px-1 self-start mt-0.5">{{ log.type }}</span>
          <span class="text-slate-300">{{ log.message }}</span>
        </div>
      </div>
    </div>

    <!-- Toggle Button (when hidden) -->
    <button v-else @click="toggleVisibility" class="fixed bottom-4 right-4 text-slate-400 hover:text-white p-2 rounded-full shadow-lg border border-slate-700 transition-colors z-40 opacity-50 hover:opacity-100 bg-gray-900" title="Show Logs">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    </button>
  </template>
</template>

<script setup>
import { useLogStore } from '../stores/log';
import { useSettingsStore } from '../stores/settings';
import { storeToRefs } from 'pinia';
import { watch, nextTick, ref } from 'vue';

const logStore = useLogStore();
const settingsStore = useSettingsStore();
const { logs, isVisible } = storeToRefs(logStore);
const { clearLogs, toggleVisibility } = logStore;

const logContainer = ref(null);

// Auto-scroll to bottom when new logs arrive
watch(logs, () => {
  if (isVisible.value) {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    });
  }
}, { deep: true });

// Scroll to bottom when becoming visible
watch(isVisible, (newValue) => {
  if (newValue) {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;
      }
    });
  }
});

function getTypeClass(type) {
  switch (type) {
    case 'error': return 'text-red-200';
    case 'warning': return 'text-yellow-200';
    case 'success': return 'text-green-200';
    default: return 'text-blue-200';
  }
}
</script>
