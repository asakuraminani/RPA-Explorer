<script setup>
import { ref } from 'vue';
import TopBar from './components/TopBar.vue';
import HomeView from './components/HomeView.vue';
import DecompressView from './components/DecompressView.vue';
import BrowseView from './components/BrowseView.vue';
import LogViewer from './components/LogViewer.vue';
import SettingsModal from './components/SettingsModal.vue';
import { useNavigationStore } from './stores/navigation';
import { storeToRefs } from 'pinia';

const navigationStore = useNavigationStore();
const { currentView } = storeToRefs(navigationStore);

const isSettingsOpen = ref(false);
</script>

<template>
  <div class="h-screen text-slate-100 flex flex-col overflow-hidden">
    <TopBar @open-settings="isSettingsOpen = true" />

    <LogViewer />
    <SettingsModal
      v-if="isSettingsOpen"
      :is-open="isSettingsOpen"
      @close="isSettingsOpen = false"
    />

    <main class="flex-1 overflow-hidden relative">
      <HomeView
        v-if="currentView === 'home'"
        class="absolute inset-0 overflow-y-auto"
      />

      <DecompressView
        v-if="currentView === 'decompress'"
        class="absolute inset-0 overflow-y-auto"
      />

      <BrowseView
        v-if="currentView === 'browse'"
        class="absolute inset-0"
      />
    </main>
  </div>
</template>
