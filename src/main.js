import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/tailwind.css';
import { useSettingsStore } from './stores/settings';
import { useNavigationStore } from './stores/navigation';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);

const settingsStore = useSettingsStore(pinia);
const navigationStore = useNavigationStore(pinia);

await settingsStore.loadSettings();
navigationStore.setView(settingsStore.startupPage === 'browse' ? 'browse' : 'home');

app.mount('#app');

