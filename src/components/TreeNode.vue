<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  node: { type: Object, required: true },
  level: { type: Number, required: true },
  selectedId: { type: String, default: null }
});

const emit = defineEmits(['select', 'remove']);

const isOpen = ref(props.node.expanded ?? false);
const ROW_HEIGHT = 22;
const canRemoveRoot = computed(() => props.level === 0 && props.node.removable);

watch(() => props.node.expanded, (newVal) => {
  if (newVal !== undefined) {
    isOpen.value = newVal;
  } else {
    isOpen.value = false;
  }
});
const isFolder = computed(() => props.node.type === 'dir');
const rowStyle = computed(() => ({
  paddingLeft: `${4 + props.level * 12}px`,
  minHeight: `${ROW_HEIGHT}px`,
  ...(isFolder.value
    ? {
        position: 'sticky',
        top: `${props.level * ROW_HEIGHT}px`,
        zIndex: String(40 - props.level)
      }
    : {})
}));
const fileCategory = computed(() => {
  if (isFolder.value) return 'folder';

  const lower = props.node.path?.toLowerCase() || '';

  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.svg'].some((ext) => lower.endsWith(ext))) {
    return 'image';
  }

  if (['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac'].some((ext) => lower.endsWith(ext))) {
    return 'audio';
  }

  if (['.mp4', '.webm', '.mkv', '.avi', '.mov'].some((ext) => lower.endsWith(ext))) {
    return 'video';
  }

  if (['.ttf', '.otf', '.woff', '.woff2'].some((ext) => lower.endsWith(ext))) {
    return 'font';
  }

  if (['.txt', '.rpy', '.py', '.json', '.xml', '.csv', '.log', '.md', '.cfg', '.ini', '.yaml', '.yml', '.html', '.js', '.rpyc'].some((ext) => lower.endsWith(ext))) {
    return 'text';
  }

  return 'other';
});

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

function toggle() {
  if (isFolder.value) isOpen.value = !isOpen.value;
  else emit('select', props.node);
}

function onClickLabel() {
  if (isFolder.value) isOpen.value = !isOpen.value;
  else emit('select', props.node);
}

function onRemoveClick() {
  emit('remove', props.node);
}
</script>

<template>
  <div>
    <div
      class="group relative flex cursor-pointer select-none items-center gap-1 px-1 py-0.5"
      :class="{
        'rounded border border-emerald-500/70 bg-emerald-500/10 text-slate-50': node.id === selectedId && node.type === 'file',
        'rounded border border-transparent hover:border-slate-700': node.type === 'file' && node.id !== selectedId,
        'bg-gray-900 hover:bg-slate-900/80': node.type === 'dir'
      }"
      :style="rowStyle"
      @click="onClickLabel"
    >

      <span
        v-if="isFolder"
        class="w-3 text-center text-slate-500"
        @click.stop="toggle"
      >
        {{ isOpen ? '▾' : '▸' }}
      </span>
      <span v-else class="w-3"></span>
      <span class="flex-1 min-w-0 flex items-center gap-1.5">
        <svg
          v-if="isFolder"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-6 h-6 shrink-0"
          :class="isOpen ? 'text-amber-300' : 'text-amber-400'"
        >
          <path v-if="isOpen" d="M3 7.5A1.5 1.5 0 0 1 4.5 6H10l2 2h7.5A1.5 1.5 0 0 1 21 9.5V10H8.5A1.5 1.5 0 0 0 7.1 11l-1.3 5A1.5 1.5 0 0 0 7.2 18H18a1.5 1.5 0 0 0 1.44-1.09L21 11.5" />
          <path v-else d="M3 7.5A1.5 1.5 0 0 1 4.5 6H10l2 2h7.5A1.5 1.5 0 0 1 21 9.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5z" />
        </svg>
        <svg
          v-else-if="fileCategory === 'image'"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-6 h-6 shrink-0 text-sky-400"
        >
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m20 16-4.5-4.5L8 19" />
        </svg>
        <svg
          v-else-if="fileCategory === 'audio'"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-6 h-6 shrink-0 text-emerald-400"
        >
          <path d="M9 18V7l9-2v11" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="16" r="2" />
        </svg>
        <svg
          v-else-if="fileCategory === 'video'"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-6 h-6 shrink-0 text-rose-400"
        >
          <rect x="3.5" y="5" width="17" height="14" rx="2" />
          <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
        </svg>
        <svg
          v-else-if="fileCategory === 'font'"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-6 h-6 shrink-0 text-violet-400"
        >
          <path d="M6 7h12" />
          <path d="M12 7v10" />
          <path d="M9 17h6" />
        </svg>
        <svg
          v-else-if="fileCategory === 'text'"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-6 h-6 shrink-0 text-cyan-400"
        >
          <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-6 h-6 shrink-0 text-slate-400"
        >
          <path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V8z" />
          <path d="M14 3v5h5" />
        </svg>
        <span class="truncate">{{ node.name }}</span>
      </span>
      <span v-if="!isFolder" class="ml-2 whitespace-nowrap text-[10px] text-slate-500">
        {{ humanSize(node.size) }}
      </span>
      <button
        v-if="canRemoveRoot"
        class="pointer-events-none absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center border border-red-500/40 bg-gray-950/85 text-red-300 opacity-0 transition hover:border-red-400 group-hover:pointer-events-auto group-hover:opacity-100"
        aria-label="Remove root"
        title="Remove root"
        @click.stop="onRemoveClick"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 7.5h12m-9.75 0V6A2.25 2.25 0 0110.5 3.75h3A2.25 2.25 0 0115.75 6v1.5m-8.25 0v10.125A2.625 2.625 0 0010.125 20.25h3.75A2.625 2.625 0 0016.5 17.625V7.5" />
        </svg>
      </button>
    </div>

    <div v-if="isFolder && isOpen && node.children?.length">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :selected-id="selectedId"
        @select="$emit('select', $event)"
        @remove="$emit('remove', $event)"
      />
    </div>
  </div>
</template>

