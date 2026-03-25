import { useLogStore } from '../stores/log';
import { useSettingsStore } from '../stores/settings';

// Global logger helper
export const logger = {
  info: (message) => {
    const settings = useSettingsStore();
    if (!settings.loggingEnabled) return;
    
    const store = useLogStore();
    store.addLog(message, 'info');
    console.log(`[INFO] ${message}`);
  },
  warn: (message) => {
    const settings = useSettingsStore();
    if (!settings.loggingEnabled) return;

    const store = useLogStore();
    store.addLog(message, 'warning');
    console.warn(`[WARN] ${message}`);
  },
  error: (message) => {
    const settings = useSettingsStore();
    if (!settings.loggingEnabled) return;

    const store = useLogStore();
    store.addLog(message, 'error');
    console.error(`[ERROR] ${message}`);
  },
  success: (message) => {
    const settings = useSettingsStore();
    if (!settings.loggingEnabled) return;

    const store = useLogStore();
    store.addLog(message, 'success');
    console.log(`[SUCCESS] ${message}`);
  },
  log: (message, type = 'info') => {
    const settings = useSettingsStore();
    if (!settings.loggingEnabled) return;

    const store = useLogStore();
    store.addLog(message, type);
    console.log(`[LOG:${type}] ${message}`);
  }
};

// Also expose as a global function on window for debugging console usage
if (typeof window !== 'undefined') {
  window.$log = logger;
}

export default logger;
