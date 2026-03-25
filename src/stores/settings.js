import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { saveSetting, getSetting } from '../utils/db';

export const useSettingsStore = defineStore('settings', () => {
  // Settings
  const loggingEnabled = ref(false);
  const showLineNumbers = ref(true);
  const wordWrap = ref(true);
  const fontSize = ref(16);
  const startupPage = ref('home');

  // Initial load
  async function loadSettings() {
    try {
      const savedLogging = await getSetting('loggingEnabled');
      if (savedLogging !== undefined) {
        loggingEnabled.value = savedLogging;
      }
      const savedLineNumbers = await getSetting('showLineNumbers');
      if (savedLineNumbers !== undefined) {
        showLineNumbers.value = savedLineNumbers;
      }
      const savedWordWrap = await getSetting('wordWrap');
      if (savedWordWrap !== undefined) {
        wordWrap.value = savedWordWrap;
      }
      const savedFontSize = await getSetting('fontSize');
      if (savedFontSize !== undefined) {
        fontSize.value = savedFontSize;
      }
      const savedStartupPage = await getSetting('startupPage');
      if (savedStartupPage === 'home' || savedStartupPage === 'browse') {
        startupPage.value = savedStartupPage;
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  }

  // Watchers to persist changes
  watch(loggingEnabled, (newValue) => {
    saveSetting('loggingEnabled', newValue);
  });

  watch(showLineNumbers, (newValue) => {
    saveSetting('showLineNumbers', newValue);
  });

  watch(wordWrap, (newValue) => {
    saveSetting('wordWrap', newValue);
  });

  watch(fontSize, (newValue) => {
    saveSetting('fontSize', newValue);
  });

  watch(startupPage, (newValue) => {
    saveSetting('startupPage', newValue);
  });

  return {
    loggingEnabled,
    showLineNumbers,
    wordWrap,
    fontSize,
    startupPage,
    loadSettings
  };
});
