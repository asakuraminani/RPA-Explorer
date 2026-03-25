<script setup>
import { useExtractionStore } from '../stores/extraction';
import { useNavigationStore } from '../stores/navigation';

const extractionStore = useExtractionStore();
const navigationStore = useNavigationStore();

const Icons = {
  Extract: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  Check: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
};

const goToExtraction = () => {
    navigationStore.setView('decompress');
};
</script>

<template>
  <div
    v-if="extractionStore.isProcessing || extractionStore.isComplete"
    class="flex items-center"
  >
    <button
      @click="goToExtraction"
      class="p-2 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center justify-center w-10 h-10 relative group"
      :title="extractionStore.isProcessing ? `Extracting: ${extractionStore.progress}%` : 'Extraction Complete!'"
    >
      <div class="relative pointer-events-none">
        <span v-if="extractionStore.isProcessing" v-html="Icons.Extract" class="text-blue-400 animate-bounce"></span>
        <span v-else v-html="Icons.Check" class="text-emerald-400"></span>

        <span v-if="extractionStore.isProcessing" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-gray-900 bg-blue-400"></span>
      </div>

      <div v-if="extractionStore.isProcessing" class="absolute top-full right-0 mt-2 border border-slate-700 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 z-50">
        {{ extractionStore.progress }}%
      </div>
    </button>
  </div>
</template>
