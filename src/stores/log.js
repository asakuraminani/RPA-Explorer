import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLogStore = defineStore('log', () => {
  const logs = ref([]);
  const isVisible = ref(false);
  const maxLogs = 1000; // Limit the number of logs to prevent memory issues

  /**
   * Add a new log entry
   * @param {string} message - The log message
   * @param {string} type - The type of log (info, warning, error, success)
   */
  function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    logs.value.push({
      id: Date.now() + Math.random(),
      timestamp,
      message,
      type
    });

    // Trim logs if they exceed the limit
    if (logs.value.length > maxLogs) {
      logs.value = logs.value.slice(logs.value.length - maxLogs);
    }
    
    // Auto-show on error? Optional, maybe user configurable.
    if (type === 'error') {
      isVisible.value = true;
    }
  }

  function clearLogs() {
    logs.value = [];
  }

  function toggleVisibility() {
    isVisible.value = !isVisible.value;
  }

  return {
    logs,
    isVisible,
    addLog,
    clearLogs,
    toggleVisibility
  };
});
