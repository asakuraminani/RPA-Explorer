import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useNavigationStore = defineStore('navigation', () => {
  const currentView = ref('home');

  function setView(view) {
    currentView.value = view;
  }

  return { currentView, setView };
});
