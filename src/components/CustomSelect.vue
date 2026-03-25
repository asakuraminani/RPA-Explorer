<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: [String, Number],
    required: true
  },
  options: {
    type: Array,
    required: true,
    // Expects array of objects: { label: String, value: String|Number }
  },
  placeholder: {
    type: String,
    default: 'Select an option'
  }
});

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);
const dropdownRef = ref(null);

const selectedOption = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue);
});

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const selectOption = (option) => {
  emit('update:modelValue', option.value);
  emit('change', option.value);
  isOpen.value = false;
};

const handleClickOutside = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="relative w-full" ref="dropdownRef">
    <!-- Trigger Button -->
    <button 
      type="button"
      @click="toggleDropdown"
      class="w-full flex items-center cursor-pointer justify-between h-10  text-slate-300 border-b border-slate-800 hover:border-slate-600 focus:border-emerald-500 focus:outline-none px-3 py-2 transition-colors duration-200"
      :class="{'border-emerald-500': isOpen}"
    >
      <span class="truncate pr-2">
        {{ selectedOption ? selectedOption.label : placeholder }}
      </span>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        class="h-4 w-4 text-slate-500 transition-transform duration-200 shrink-0" 
        :class="{'rotate-180': isOpen}"
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown Menu -->
    <transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <div
        v-if="isOpen"
        class="absolute z-50 w-full mt-1 border border-slate-700 shadow-lg max-h-60 overflow-y-auto bg-gray-900"
      >
        <ul class="py-1">
          <li
            v-for="option in options"
            :key="option.value"
            @click="selectOption(option)"
            class="px-3 py-2 cursor-pointer transition-colors duration-150 flex items-center justify-between"
            :class="[
              option.value === modelValue
                ? 'text-emerald-400 font-medium'
                : 'text-slate-300 hover:text-white'
            ]"
          >
            <span class="truncate">{{ option.label }}</span>
            <svg 
              v-if="option.value === modelValue"
              xmlns="http://www.w3.org/2000/svg" 
              class="h-3 w-3 text-emerald-500 shrink-0 ml-2" 
              viewBox="0 0 20 20" 
              fill="currentColor"
            >
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </li>
          
          <li v-if="options.length === 0" class="px-3 py-2 text-slate-500 text-center">
            No options available
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>
