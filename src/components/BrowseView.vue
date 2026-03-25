<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import TreeNode from './TreeNode.vue';
import { getRpaFileData } from '../utils/rpaFileHelper';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { SearchQuery, closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, search, setSearchQuery } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { useFileStore } from '../stores/file';
import { useMusicStore } from '../stores/music';
import { usePersistenceStore } from '../stores/persistence';
import { useSettingsStore } from '../stores/settings';
import opentype from 'opentype.js';
import { createFileArchiveId, getOrParseArchiveData, resolveFileSource, resolveProjectRpaFile } from '../utils/archive';
import { detectGameStructure } from '../utils/directoryParser';
import { createHandleFromEntry } from '../utils/fileSystemAdapter';
import { decompileRpyc } from 'unrpyc-pure/browser';
import CustomSelect from './CustomSelect.vue';
import bgImage from '../assets/bg.png';

const fileStore = useFileStore();
const musicStore = useMusicStore();
const persistenceStore = usePersistenceStore();
const settingsStore = useSettingsStore();

const localFile = ref(fileStore.selectedFile);
const browseRoots = ref([]);
const externalSessionKey = ref(null);

const activeProject = computed(() => fileStore.currentProject);
const selectedArchiveName = computed(() => localFile.value?.name || '');
const showRpaSelector = computed(() => activeProject.value?.type === 'game_project' && activeProject.value?.browseMode !== 'transient');
const rootNodes = computed(() => browseRoots.value.map((entry) => {
  if (entry.role === 'transient') {
    return {
      ...entry.node,
      removable: true,
      rootTransient: true
    };
  }

  return entry.node;
}));
const hasActiveSession = computed(() => rootNodes.value.length > 0);
const currentSessionLabel = computed(() => {
  if (!rootNodes.value.length) {
    return '';
  }

  if (rootNodes.value.length === 1) {
    return rootNodes.value[0].name;
  }

  return `${rootNodes.value.length} roots loaded`;
});

const selectedFileId = ref(null);
const fileContent = ref('');
const rawFileContent = ref('');
const fileUrl = ref(null);
const displayedNode = ref(null);
const logLines = ref([]);
const errorMessage = ref('');
const fontPreviewText = ref(localStorage.getItem('rpa_font_preview_text') || '');
const fontMetadata = ref(null);
const mediaDimensions = ref(null);
const mediaZoom = ref(100);
const mediaPan = ref({ x: 0, y: 0 });
const isDragging = ref(false);
const hasDragged = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const dragTargets = ref({ sidebar: false, viewer: false });
const dragCounter = ref({ sidebar: 0, viewer: 0 });
const mediaRef = ref(null);
const mediaRenderedWidth = ref(0);
let mediaResizeObserver = null;
let externalLoadVersion = 0;

const actualMediaZoom = computed(() => {
  if (!mediaDimensions.value || !mediaDimensions.value.width || !mediaRenderedWidth.value) {
    return mediaZoom.value;
  }

  const cssScale = mediaRenderedWidth.value / mediaDimensions.value.width;
  return Math.round(cssScale * mediaZoom.value);
});
const removeBlankLinesEnabled = ref(false);

function applyEditorTransforms(text) {
  if (!removeBlankLinesEnabled.value) {
    return text;
  }

  return removeBlankLinesFromText(text);
}

watch(removeBlankLinesEnabled, () => {
  if (!displayedNode.value || !(isTextFile(displayedNode.value.path) || isCompiledRpy(displayedNode.value.path))) {
    return;
  }

  fileContent.value = applyEditorTransforms(rawFileContent.value);
});

watch(mediaRef, (newEl) => {
  if (mediaResizeObserver) {
    mediaResizeObserver.disconnect();
    mediaResizeObserver = null;
  }

  if (newEl) {
    mediaResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        mediaRenderedWidth.value = entry.contentRect.width;
      }
    });
    mediaResizeObserver.observe(newEl);
    mediaRenderedWidth.value = newEl.clientWidth;
  }
});

const editorRef = ref(null);
let editorView = null;
const lineNumbersCompartment = new Compartment();
const wordWrapCompartment = new Compartment();
const fontSizeCompartment = new Compartment();

const getLineNumbersExtension = () => {
  return EditorView.theme({
    '.cm-gutters': { display: settingsStore.showLineNumbers ? 'flex' : 'none' }
  });
};

const getWordWrapExtension = () => {
  return settingsStore.wordWrap ? EditorView.lineWrapping : [];
};

const getFontSizeExtension = () => {
  return EditorView.theme({
    '&': { fontSize: `${settingsStore.fontSize || 14}px` }
  });
};

function createMinimalSearchPanel(view) {
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.name = 'search';
  searchInput.className = 'cm-textfield';
  searchInput.placeholder = 'Find';
  searchInput.setAttribute('aria-label', 'Find');
  searchInput.setAttribute('main-field', 'true');

  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'cm-button';
  prevButton.textContent = '↑';
  prevButton.setAttribute('aria-label', 'Previous match');

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'cm-button';
  nextButton.textContent = '↓';
  nextButton.setAttribute('aria-label', 'Next match');

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'cm-button';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close search');

  const dom = document.createElement('div');
  dom.className = 'cm-search cm-search-minimal';
  dom.append(searchInput, prevButton, nextButton, closeButton);

  const syncQuery = () => {
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({
        search: searchInput.value
      }))
    });
  };

  const updateButtons = () => {
    const disabled = !searchInput.value;
    prevButton.disabled = disabled;
    nextButton.disabled = disabled;
  };

  const runFind = (command) => {
    syncQuery();
    if (!searchInput.value) {
      return;
    }
    command(view);
  };

  searchInput.addEventListener('input', () => {
    syncQuery();
    updateButtons();
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runFind(event.shiftKey ? findPrevious : findNext);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel(view);
      view.focus();
    }
  });
  prevButton.addEventListener('click', () => runFind(findPrevious));
  nextButton.addEventListener('click', () => runFind(findNext));
  closeButton.addEventListener('click', () => {
    closeSearchPanel(view);
    view.focus();
  });

  updateButtons();

  return {
    dom,
    top: true,
    mount() {
      const query = getSearchQuery(view.state);
      if (query.search) {
        searchInput.value = query.search;
      }
      updateButtons();
      searchInput.select();
    },
    update(update) {
      const nextValue = getSearchQuery(update.state).search;
      if (searchInput.value !== nextValue && document.activeElement !== searchInput) {
        searchInput.value = nextValue;
        updateButtons();
      }
    }
  };
}

const initEditor = () => {
  if (!editorRef.value) return;
  if (editorView) editorView.destroy();

  const extensions = [
    basicSetup,
    search({
      top: true,
      createPanel: createMinimalSearchPanel
    }),
    oneDark,
    EditorView.editable.of(false),
    EditorView.theme({
      '&': {
        height: '100%'
      }
    }),
    lineNumbersCompartment.of(getLineNumbersExtension()),
    wordWrapCompartment.of(getWordWrapExtension()),
    fontSizeCompartment.of(getFontSizeExtension())
  ];

  if (displayedNode.value?.path?.toLowerCase().endsWith('.rpy') ||
      displayedNode.value?.path?.toLowerCase().endsWith('.py') ||
      displayedNode.value?.path?.toLowerCase().endsWith('.rpyc')) {
    extensions.push(python());
  }

  editorView = new EditorView({
    doc: fileContent.value,
    extensions,
    parent: editorRef.value
  });
};

watch([() => settingsStore.showLineNumbers, () => settingsStore.wordWrap, () => settingsStore.fontSize], () => {
  if (editorView) {
    editorView.dispatch({
      effects: [
        lineNumbersCompartment.reconfigure(getLineNumbersExtension()),
        wordWrapCompartment.reconfigure(getWordWrapExtension()),
        fontSizeCompartment.reconfigure(getFontSizeExtension())
      ]
    });
  }
});

watch(() => displayedNode.value, async (newNode) => {
  await nextTick();
  if (newNode && (isTextFile(newNode.path) || isCompiledRpy(newNode.path))) {
    initEditor();
  } else if (editorView) {
    editorView.destroy();
    editorView = null;
  }
});

watch(fileContent, () => {
  if (editorView) {
    const transaction = editorView.state.update({
      changes: { from: 0, to: editorView.state.doc.length, insert: fileContent.value }
    });
    editorView.dispatch(transaction);
  } else if (editorRef.value) {
    initEditor();
  }
});

watch(fontPreviewText, (newValue) => {
  localStorage.setItem('rpa_font_preview_text', newValue);
});

const searchQuery = ref('');
const isFileLoading = ref(false);
const loadingTime = ref(0);
let loadingTimer = null;
let loadingStartTime = 0;

watch(isFileLoading, (newVal) => {
  if (newVal) {
    loadingStartTime = Date.now();
    loadingTime.value = 0;
    if (loadingTimer) clearInterval(loadingTimer);
    loadingTimer = setInterval(() => {
      loadingTime.value = Date.now() - loadingStartTime;
    }, 10);
  } else {
    if (loadingTimer) clearInterval(loadingTimer);
    loadingTime.value = Date.now() - loadingStartTime;
  }
});

const autoDeobfuscate = true;

const filterTypes = ref({
  image: true,
  audio: true,
  video: true,
  font: true,
  text: true,
  other: true
});

const isAllSelected = computed({
  get() {
    return Object.values(filterTypes.value).every(Boolean);
  },
  set(value) {
    for (const key in filterTypes.value) {
      filterTypes.value[key] = value;
    }
  }
});

const SUPPORTED_DIRECT_FILE_EXTENSIONS = ['.rpa', '.rpy', '.rpyc'];
const GAME_STRUCTURE_ERROR_MESSAGES = [
  'Valid Ren\'Py game structure not found',
  'Could not find "game" directory inside the .app bundle.'
];

const dragTargetActive = computed(() => Object.values(dragTargets.value).some(Boolean));

function isEditorPreviewOpen() {
  return !!displayedNode.value && (isTextFile(displayedNode.value.path) || isCompiledRpy(displayedNode.value.path));
}

function handleWindowKeydown(event) {
  if (!isEditorPreviewOpen()) {
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    if (editorView) {
      editorView.focus();
      openSearchPanel(editorView);
    }
  }
}

function isSupportedLooseFile(name = '') {
  const lower = name.toLowerCase();
  return SUPPORTED_DIRECT_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isGameStructureMiss(error) {
  const message = error?.message || '';
  return GAME_STRUCTURE_ERROR_MESSAGES.some((fragment) => message.includes(fragment));
}

function createFilesystemFileSession(source) {
  return resolveFileSource(source).then((file) => {
    if (!file) {
      throw new Error('Unable to read dropped file.');
    }

    return {
      id: `fs-file:${createFileArchiveId(file)}`,
      name: file.name,
      title: file.name,
      file,
      handle: source?.kind === 'file' ? source : null,
      browseMode: 'transient'
    };
  });
}

function createTransientRootId(prefix) {
  if (typeof crypto?.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function getExternalSessionKey(project, file) {
  if (project?.type === 'game_project' && project.id) {
    return `game_project:${project.id}`;
  }

  if (project?.type === 'filesystem_directory') {
    return `filesystem_directory:${project.id || project.name || project.handle?.name || 'directory'}`;
  }

  if (project?.type === 'filesystem_file') {
    return `filesystem_file:${project.id || project.name || file?.name || 'file'}`;
  }

  if (project?.id) {
    return `archive_file:${project.id}`;
  }

  if (file) {
    return `archive_file:${createFileArchiveId(file)}`;
  }

  return null;
}

function resetDragState(zone = null) {
  if (zone) {
    dragTargets.value = {
      ...dragTargets.value,
      [zone]: false
    };
    dragCounter.value = {
      ...dragCounter.value,
      [zone]: 0
    };
    return;
  }

  dragTargets.value = { sidebar: false, viewer: false };
  dragCounter.value = { sidebar: 0, viewer: 0 };
}

function markDragEnter(zone) {
  dragCounter.value = {
    ...dragCounter.value,
    [zone]: dragCounter.value[zone] + 1
  };
  dragTargets.value = {
    ...dragTargets.value,
    [zone]: true
  };
}

function markDragLeave(zone) {
  const nextCount = Math.max(0, dragCounter.value[zone] - 1);
  dragCounter.value = {
    ...dragCounter.value,
    [zone]: nextCount
  };

  if (nextCount === 0) {
    dragTargets.value = {
      ...dragTargets.value,
      [zone]: false
    };
  }
}

function onDropZoneDragOver(event) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

function onDropZoneDragEnter(zone, event) {
  event.preventDefault();
  markDragEnter(zone);
}

function onDropZoneDragLeave(zone, event) {
  event.preventDefault();
  markDragLeave(zone);
}

function onDropZoneDrop(event) {
  handleBrowseDrop(event).catch((error) => {
    const message = error?.message || String(error);
    appendLog(message);
    errorMessage.value = message;
  });
}

function isDropZoneActive(zone) {
  return dragTargets.value[zone];
}

function isSupportedTransfer(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes('Files');
}

function onDropZoneDragEnterGuarded(zone, event) {
  if (!isSupportedTransfer(event)) {
    return;
  }
  onDropZoneDragEnter(zone, event);
}

function onDropZoneDragLeaveGuarded(zone, event) {
  if (!isSupportedTransfer(event)) {
    return;
  }
  onDropZoneDragLeave(zone, event);
}

function onDropZoneDragOverGuarded(event) {
  if (!isSupportedTransfer(event)) {
    return;
  }
  onDropZoneDragOver(event);
}

function onWindowDrop() {
  resetDragState();
}

function onWindowDragEnd() {
  resetDragState();
}

function onWindowDragLeave(event) {
  const currentTarget = event.currentTarget;
  const screenLeft = currentTarget?.screenX ?? window.screenX;
  const screenTop = currentTarget?.screenY ?? window.screenY;
  const outerWidth = currentTarget?.outerWidth ?? window.outerWidth;
  const outerHeight = currentTarget?.outerHeight ?? window.outerHeight;
  const left = event.clientX <= 0;
  const top = event.clientY <= 0;
  const right = event.clientX >= outerWidth - screenLeft;
  const bottom = event.clientY >= outerHeight - screenTop;

  if (event.relatedTarget === null && (left || top || right || bottom)) {
    resetDragState();
  }
}

function onWindowBlur() {
  resetDragState();
}

const filteredFileTree = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const isTypeFiltering = Object.values(filterTypes.value).some((value) => !value);

  if (!query && !isTypeFiltering) {
    return rootNodes.value;
  }

  function filterNode(node) {
    if (node.type === 'file') {
      const nameMatch = !query || node.name.toLowerCase().includes(query);
      if (!nameMatch) return null;

      const path = node.path;
      let typeMatch = false;
      if (isImageFile(path)) typeMatch = filterTypes.value.image;
      else if (isAudioFile(path)) typeMatch = filterTypes.value.audio;
      else if (isVideoFile(path)) typeMatch = filterTypes.value.video;
      else if (isFontFile(path)) typeMatch = filterTypes.value.font;
      else if (isTextFile(path) || isCompiledRpy(path)) typeMatch = filterTypes.value.text;
      else typeMatch = filterTypes.value.other;

      return typeMatch ? { ...node } : null;
    }

    if (node.children) {
      const filteredChildren = node.children.map(filterNode).filter(Boolean);
      if (filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
          expanded: query ? true : node.expanded
        };
      }
    }

    if (query && node.name.toLowerCase().includes(query)) {
      return { ...node, children: [], expanded: true };
    }

    return null;
  }

  return rootNodes.value.map(filterNode).filter(Boolean);
});

const displayedFileCount = computed(() => {
  let count = 0;

  function countFiles(nodes) {
    for (const node of nodes) {
      if (node.type === 'file') count++;
      if (node.children) countFiles(node.children);
    }
  }

  countFiles(filteredFileTree.value);
  return count;
});

const rpaOptions = computed(() => {
  if (!fileStore.currentProject?.rpaFiles) return [];
  return fileStore.currentProject.rpaFiles.map((rpa) => ({
    label: `${rpa.name} (${humanSize(rpa.size)})`,
    value: rpa.name
  }));
});

function appendLog(message) {
  logLines.value.push(message);
  if (logLines.value.length > 200) {
    logLines.value.shift();
  }
}

function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(1)} ${units[idx]}`;
}

function isTextFile(path) {
  const lower = path.toLowerCase();
  const textExts = [
    '.txt', '.rpy', '.py', '.json', '.xml', '.csv', '.log', '.md', '.cfg', '.ini', '.yaml', '.yml', '.html', '.js'
  ];
  return textExts.some((ext) => lower.endsWith(ext));
}

function isImageFile(path) {
  const lower = path.toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.svg'].some((ext) => lower.endsWith(ext));
}

function isAudioFile(path) {
  const lower = path.toLowerCase();
  return ['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac'].some((ext) => lower.endsWith(ext));
}

function isVideoFile(path) {
  const lower = path.toLowerCase();
  return ['.mp4', '.webm', '.mkv', '.avi', '.mov'].some((ext) => lower.endsWith(ext));
}

function isFontFile(path) {
  const lower = path.toLowerCase();
  return ['.ttf', '.otf', '.woff', '.woff2'].some((ext) => lower.endsWith(ext));
}

function getMimeType(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.svg')) return 'image/svg+xml';

  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';

  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mov')) return 'video/quicktime';

  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.woff2')) return 'font/woff2';

  return 'application/octet-stream';
}

function isCompiledRpy(path) {
  return path.toLowerCase().endsWith('.rpyc');
}

function removeBlankLinesFromText(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}

function handleMediaPlay() {
  musicStore.setPreviewPlaying(true);
}

function handleMediaPause() {
  musicStore.setPreviewPlaying(false);
}

function revokeCurrentFileUrl() {
  if (fileUrl.value) {
    URL.revokeObjectURL(fileUrl.value);
    fileUrl.value = null;
  }
}

function clearDisplayedState() {
  selectedFileId.value = null;
  displayedNode.value = null;
  fileContent.value = '';
  rawFileContent.value = '';
  fontMetadata.value = null;
  mediaDimensions.value = null;
  mediaZoom.value = 100;
  mediaPan.value = { x: 0, y: 0 };
  errorMessage.value = '';
  revokeCurrentFileUrl();
}

function collectFileNodes(nodes, map = new Map()) {
  for (const node of nodes) {
    if (node.type === 'file') {
      map.set(node.id, node);
    }
    if (node.children?.length) {
      collectFileNodes(node.children, map);
    }
  }
  return map;
}

function findFirstFileNode(node) {
  if (!node) {
    return null;
  }

  if (node.type === 'file') {
    return node;
  }

  for (const child of node.children || []) {
    const match = findFirstFileNode(child);
    if (match) {
      return match;
    }
  }

  return null;
}

function syncSelectionWithRoots(nextRoots) {
  if (!selectedFileId.value) {
    return;
  }

  const nextNode = collectFileNodes(nextRoots.map((entry) => entry.node)).get(selectedFileId.value);
  if (!nextNode) {
    clearDisplayedState();
    return;
  }

  if (displayedNode.value?.id === nextNode.id && displayedNode.value !== nextNode) {
    void onSelectFile(nextNode);
  }
}

function setBrowseRoots(nextRoots) {
  browseRoots.value = nextRoots;
  syncSelectionWithRoots(nextRoots);
}

function replaceBaseRoot(node, sessionKey, replaceAll) {
  const transientRoots = replaceAll ? [] : browseRoots.value.filter((entry) => entry.role !== 'base');
  setBrowseRoots([
    {
      id: node.rootId,
      node,
      role: 'base',
      sessionKey
    },
    ...transientRoots
  ]);
}

function appendTransientRoot(node) {
  const transientNode = {
    ...node,
    removable: true,
    rootTransient: true
  };

  setBrowseRoots([
    ...browseRoots.value,
    {
      id: transientNode.rootId,
      node: transientNode,
      role: 'transient',
      sessionKey: null
    }
  ]);
}

function onRemoveRoot(node) {
  const rootId = node.rootId || node.id;
  const isSelectedRoot = displayedNode.value?.rootId === rootId || selectedFileId.value?.startsWith(`archive-file:${rootId}:`) || selectedFileId.value?.startsWith(`fs-file:${rootId}:`);
  const nextRoots = browseRoots.value.filter((entry) => entry.id !== rootId);

  if (isSelectedRoot) {
    clearDisplayedState();
  }

  setBrowseRoots(nextRoots);
}

function sortNodes(nodes) {
  nodes.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === 'dir' ? -1 : 1;
  });

  for (const node of nodes) {
    if (node.children?.length) {
      sortNodes(node.children);
    }
  }
}

function createFilesystemFileNode({ file = null, handle = null, fullPath, rootId, removable = false, transient = false, topLevel = false }) {
  const sourceFile = file || null;
  const sourceName = sourceFile?.name || handle?.name || fullPath.split('/').pop() || fullPath;
  const sourceSize = sourceFile?.size ?? 0;
  const sourceLastModified = sourceFile?.lastModified ?? 0;

  return {
    id: `fs-file:${rootId}:${fullPath}:${sourceSize}:${sourceLastModified}`,
    rootId,
    type: 'file',
    name: sourceName,
    path: fullPath,
    size: sourceSize,
    sourceType: 'filesystem',
    file: sourceFile,
    handle,
    removable: topLevel ? removable : false,
    rootTransient: transient
  };
}

function buildArchiveRootNode(entries, {
  rootId,
  rootName,
  rootPath,
  filePathPrefix = '',
  archiveFile,
  archiveId,
  archiveKey,
  expanded = true,
  removable = false,
  transient = false
}) {
  const rootChildren = [];
  const pathToDir = new Map();

  function ensureDir(pathParts) {
    let currentPath = '';
    let parentChildren = rootChildren;

    for (const part of pathParts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const fullPath = filePathPrefix ? `${filePathPrefix}${currentPath}` : currentPath;
      const dirKey = `${archiveId}:${currentPath}`;

      if (!pathToDir.has(dirKey)) {
        const node = {
          id: `archive-dir:${rootId}:${archiveId}:${fullPath}`,
          rootId,
          type: 'dir',
          name: part,
          path: fullPath,
          children: [],
          rootTransient: transient
        };
        pathToDir.set(dirKey, node);
        parentChildren.push(node);
      }

      parentChildren = pathToDir.get(dirKey).children;
    }

    return parentChildren;
  }

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    const fileName = parts.pop();
    const parentChildren = ensureDir(parts);
    const fullPath = filePathPrefix ? `${filePathPrefix}${entry.path}` : entry.path;

    parentChildren.push({
      id: `archive-file:${rootId}:${archiveId}:${entry.path}`,
      rootId,
      type: 'file',
      name: fileName,
      path: fullPath,
      breadcrumbPath: filePathPrefix ? fullPath : `${rootPath}/${entry.path}`,
      size: entry.size || 0,
      sourceType: 'archive',
      archiveFile,
      archiveId,
      archiveKey,
      archiveEntry: entry,
      rootTransient: transient
    });
  }

  sortNodes(rootChildren);

  return {
    id: rootId,
    rootId,
    type: 'dir',
    name: rootName,
    path: rootPath,
    children: rootChildren,
    expanded,
    removable,
    rootTransient: transient,
    sourceType: 'archive-root',
    archiveId,
    archiveFile,
    archiveKey
  };
}

async function buildEmbeddedArchiveNode({ file, handle, fullPath, rootId, transient }) {
  try {
    appendLog(`Loading embedded RPA: ${fullPath}`);
    const { id, data } = await getOrParseArchiveData(file, persistenceStore);
    persistenceStore.registerRuntimeArchive?.(file, data);

    return buildArchiveRootNode(data.entries, {
      rootId: `embedded-root:${rootId}:${id}:${fullPath}`,
      rootName: file.name,
      rootPath: fullPath,
      filePathPrefix: `${fullPath}/`,
      archiveFile: file,
      archiveId: id,
      archiveKey: data.key,
      expanded: false,
      removable: false,
      transient
    });
  } catch (error) {
    appendLog(`Failed to parse embedded RPA ${fullPath}: ${error.message || String(error)}`);
    return createFilesystemFileNode({ file, handle, fullPath, rootId, transient });
  }
}

async function buildFilesystemDirectoryNode(handle, fullPath, {
  rootId,
  expanded = false,
  displayName = handle.name,
  removable = false,
  transient = false,
  topLevel = false
} = {}) {
  const node = {
    id: `fs-dir:${rootId}:${fullPath}`,
    rootId,
    type: 'dir',
    name: displayName,
    path: fullPath,
    children: [],
    expanded,
    removable: topLevel ? removable : false,
    rootTransient: transient
  };

  const entries = [];
  for await (const entry of handle.values()) {
    entries.push(entry);
  }

  entries.sort((a, b) => {
    if (a.kind === b.kind) {
      return a.name.localeCompare(b.name);
    }
    return a.kind === 'directory' ? -1 : 1;
  });

  for (const entry of entries) {
    const entryPath = `${fullPath}/${entry.name}`;

    if (entry.kind === 'directory') {
      node.children.push(await buildFilesystemDirectoryNode(entry, entryPath, {
        rootId,
        transient
      }));
      continue;
    }

    const file = await resolveFileSource(entry);
    if (!file) {
      appendLog(`Skipped unreadable file: ${entryPath}`);
      continue;
    }

    if (file.name.toLowerCase().endsWith('.rpa')) {
      node.children.push(await buildEmbeddedArchiveNode({ file, handle: entry, fullPath: entryPath, rootId, transient }));
      continue;
    }

    node.children.push(createFilesystemFileNode({ file, handle: entry, fullPath: entryPath, rootId, transient }));
  }

  return node;
}

async function createArchiveRoot({ source, rootId, removable = false, transient = false }) {
  const file = await resolveFileSource(source);
  if (!file) {
    throw new Error('Unable to read dropped file.');
  }

  if (!file.name?.toLowerCase().endsWith('.rpa')) {
    throw new Error(`Skipped non-RPA file: ${file.name || 'unknown'}`);
  }

  const archiveId = createFileArchiveId(file);
  const { data } = await getOrParseArchiveData(file, persistenceStore);

  return {
    file,
    archiveId,
    parsedEntryCount: data.entries.length,
    archiveKey: data.key,
    node: buildArchiveRootNode(data.entries, {
      rootId,
      rootName: file.name,
      rootPath: file.name,
      archiveFile: file,
      archiveId,
      archiveKey: data.key,
      expanded: true,
      removable,
      transient
    })
  };
}

async function createFilesystemDirectoryRoot({ handle, rootId, rootName, removable = false, transient = false }) {
  return await buildFilesystemDirectoryNode(handle, rootName, {
    rootId,
    expanded: true,
    displayName: rootName,
    removable,
    transient,
    topLevel: true
  });
}

async function createFilesystemFileRoot({ source, rootId, removable = false, transient = false }) {
  const session = await createFilesystemFileSession(source);
  return createFilesystemFileNode({
    file: session.file,
    handle: session.handle,
    fullPath: session.file.name,
    rootId,
    removable,
    transient,
    topLevel: true
  });
}

async function createTransientGameProjectRoot(handle) {
  const structure = await detectGameStructure(handle);
  const rootId = createTransientRootId('transient-project-root');
  const rootNode = await createFilesystemDirectoryRoot({
    handle: structure.gameDirHandle,
    rootId,
    rootName: structure.name,
    removable: true,
    transient: true
  });

  appendLog(`Loaded transient project: ${structure.name}`);
  appendTransientRoot(rootNode);
}

async function appendTransientFilesystemDirectory(handle) {
  const rootId = createTransientRootId('transient-dir-root');
  const rootNode = await createFilesystemDirectoryRoot({
    handle,
    rootId,
    rootName: handle.name,
    removable: true,
    transient: true
  });

  appendLog(`Loaded transient directory: ${handle.name}`);
  appendTransientRoot(rootNode);
}

async function appendTransientFilesystemFile(source) {
  const rootId = createTransientRootId('transient-file-root');
  const rootNode = await createFilesystemFileRoot({
    source,
    rootId,
    removable: true,
    transient: true
  });

  appendLog(`Loaded transient file: ${rootNode.name}`);
  appendTransientRoot(rootNode);
}

async function appendTransientArchive(source) {
  const rootId = createTransientRootId('transient-archive-root');
  const { file, parsedEntryCount, node } = await createArchiveRoot({
    source,
    rootId,
    removable: true,
    transient: true
  });

  appendLog(`Loaded transient RPA: ${file.name}`);
  appendLog(`Completed parsing ${parsedEntryCount} files`);
  appendTransientRoot(node);
}

async function handleDroppedDirectory(handle) {
  try {
    await createTransientGameProjectRoot(handle);
  } catch (error) {
    if (isGameStructureMiss(error)) {
      await appendTransientFilesystemDirectory(handle);
      return;
    }

    throw error;
  }
}

async function handleBrowseDrop(event) {
  event.preventDefault();
  resetDragState();
  errorMessage.value = '';
  isFileLoading.value = true;

  try {
    const items = [...(event.dataTransfer?.items || [])];
    if (items.length > 0) {
      const item = items[0];

      try {
        if (item.getAsFileSystemHandle) {
          const handle = await item.getAsFileSystemHandle();
          if (handle) {
            if (handle.kind === 'directory') {
              await handleDroppedDirectory(handle);
              return;
            }

            if (handle.kind === 'file' && isSupportedLooseFile(handle.name)) {
              if (handle.name.toLowerCase().endsWith('.rpa')) {
                await appendTransientArchive(handle);
              } else {
                await appendTransientFilesystemFile(handle);
              }
              return;
            }
          }
        }

        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isDirectory) {
              await handleDroppedDirectory(createHandleFromEntry(entry));
              return;
            }

            if (entry.isFile && isSupportedLooseFile(entry.name)) {
              const handle = createHandleFromEntry(entry);
              if (entry.name.toLowerCase().endsWith('.rpa')) {
                await appendTransientArchive(handle);
              } else {
                await appendTransientFilesystemFile(handle);
              }
              return;
            }
          }
        }
      } catch (error) {
        appendLog(`File System Access API failed, falling back to File API: ${error.message || String(error)}`);
      }
    }

    const files = event.dataTransfer?.files;
    if (!files?.length) {
      return;
    }

    const file = files[0];
    if (file.name.toLowerCase().endsWith('.rpa')) {
      await appendTransientArchive(file);
      return;
    }

    if (isSupportedLooseFile(file.name)) {
      await appendTransientFilesystemFile(file);
      return;
    }

    throw new Error('Drop a .rpa, .rpy, .rpyc file, game folder, or macOS .app bundle.');
  } finally {
    isFileLoading.value = false;
  }
}

async function buildBaseRootForSession(sessionKey) {
  const project = fileStore.currentProject;

  if (project?.type === 'filesystem_directory') {
    const rootName = project.title || project.name || project.handle?.name || 'Directory';
    appendLog(`Loading directory: ${rootName}`);
    return {
      node: await createFilesystemDirectoryRoot({
        handle: project.handle,
        rootId: `base-root:${sessionKey}`,
        rootName,
        removable: project?.browseMode === 'transient',
        transient: project?.browseMode === 'transient'
      }),
      autoSelect: false
    };
  }

  if (project?.type === 'filesystem_file') {
    const rootNode = await createFilesystemFileRoot({
      source: project.file || project.handle,
      rootId: `base-root:${sessionKey}`,
      removable: project?.browseMode === 'transient',
      transient: project?.browseMode === 'transient'
    });

    appendLog(`Loaded file: ${rootNode.name}`);
    return {
      node: rootNode,
      autoSelect: true
    };
  }

  const file = localFile.value;
  if (!file) {
    throw new Error('No archive selected.');
  }

  appendLog(`Loading RPA: ${file.name}`);
  const archiveRoot = await createArchiveRoot({
    source: file,
    rootId: `base-root:${sessionKey}`,
    removable: project?.browseMode === 'transient',
    transient: project?.browseMode === 'transient'
  });

  appendLog(`Completed parsing ${archiveRoot.parsedEntryCount} files`);

  if (project?.type !== 'game_project' && project?.browseMode !== 'transient') {
    await persistenceStore.addArchive(file, {
      parsedEntriesCount: archiveRoot.parsedEntryCount,
      key: archiveRoot.archiveKey
    });
    await musicStore.loadPlaylist(archiveRoot.archiveId);
  }

  return {
    node: archiveRoot.node,
    autoSelect: false
  };
}

async function synchronizeExternalSession() {
  const sessionKey = getExternalSessionKey(fileStore.currentProject, localFile.value);
  const requestId = ++externalLoadVersion;

  if (!sessionKey) {
    externalSessionKey.value = null;
    setBrowseRoots([]);
    isFileLoading.value = false;
    return;
  }

  const replaceAll = externalSessionKey.value !== sessionKey;
  isFileLoading.value = true;
  errorMessage.value = '';

  try {
    const { node, autoSelect } = await buildBaseRootForSession(sessionKey);
    if (requestId !== externalLoadVersion) {
      return;
    }

    externalSessionKey.value = sessionKey;
    replaceBaseRoot(node, sessionKey, replaceAll);

    if (autoSelect) {
      const firstFile = findFirstFileNode(node);
      if (firstFile) {
        await onSelectFile(firstFile);
      }
    }
  } catch (error) {
    if (requestId !== externalLoadVersion) {
      return;
    }

    const project = fileStore.currentProject;
    const sourceName = project?.title || project?.name || localFile.value?.name || 'session';
    const message = `Failed to load ${sourceName}: ${error.message || String(error)}`;
    appendLog(message);
    errorMessage.value = message;
  } finally {
    if (requestId === externalLoadVersion) {
      isFileLoading.value = false;
    }
  }
}

async function resolveFilesystemNodeFile(node) {
  if (node.file instanceof File) {
    return node.file;
  }

  if (node.handle) {
    const file = await resolveFileSource(node.handle);
    if (file) {
      node.file = file;
      node.size = file.size;
      return file;
    }
  }

  return null;
}

async function onSelectFile(node) {
  if (node.type !== 'file') return;

  selectedFileId.value = node.id;
  isFileLoading.value = true;
  mediaZoom.value = 100;
  mediaPan.value = { x: 0, y: 0 };
  appendLog(`Opened file: ${node.path}`);

  let newContent = '';
  let newRawContent = '';
  let newUrl = null;
  let newFontMetadata = null;
  let newMediaDimensions = null;
  let nextErrorMessage = '';

  const isMedia = isImageFile(node.path) || isAudioFile(node.path) || isVideoFile(node.path) || isFontFile(node.path);

  try {
    if (isCompiledRpy(node.path)) {
      const buffer = await getFileData(node);
      try {
        newRawContent = decompileRpyc(buffer);
        newContent = applyEditorTransforms(newRawContent);
      } catch (error) {
        newRawContent = `# Failed to decompile ${node.name}: ${error.message}`;
        newContent = applyEditorTransforms(newRawContent);
      }
    } else if (isMedia) {
      const buffer = await getFileData(node);
      const type = getMimeType(node.path);
      const blob = new Blob([buffer], { type });
      newUrl = URL.createObjectURL(blob);

      if (isImageFile(node.path)) {
        const img = new Image();
        img.src = newUrl;
        await new Promise((resolve) => {
          img.onload = () => {
            newMediaDimensions = { width: img.naturalWidth, height: img.naturalHeight };
            resolve();
          };
          img.onerror = resolve;
        });
      } else if (isVideoFile(node.path)) {
        const video = document.createElement('video');
        video.src = newUrl;
        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            newMediaDimensions = { width: video.videoWidth, height: video.videoHeight };
            resolve();
          };
          video.onerror = resolve;
        });
      } else if (isFontFile(node.path)) {
        const fontName = `font-${Date.now()}`;
        const fontFace = new FontFace(fontName, `url(${newUrl})`);
        await fontFace.load();
        document.fonts.add(fontFace);

        try {
          const font = opentype.parse(buffer);
          const getName = (nameKey) => {
            const nameObj = font.names[nameKey];
            if (!nameObj) return '';
            if (nameObj.zh) return nameObj.zh;
            if (nameObj['zh-CN']) return nameObj['zh-CN'];
            if (nameObj['zh-TW']) return nameObj['zh-TW'];
            if (nameObj.en) return nameObj.en;
            const keys = Object.keys(nameObj);
            return keys.length > 0 ? nameObj[keys[0]] : '';
          };

          newFontMetadata = {
            fontFamily: getName('fontFamily'),
            fontSubfamily: getName('fontSubfamily'),
            fullName: getName('fullName'),
            version: getName('version'),
            manufacturer: getName('manufacturer'),
            copyright: getName('copyright'),
            description: getName('description'),
            license: getName('license'),
            url: getName('url') || getName('licenseURL')
          };
        } catch {
        }

        newContent = fontName;
      }
    } else if (isTextFile(node.path)) {
      const buffer = await getFileData(node);
      const decoder = new TextDecoder('utf-8', { fatal: false });
      newRawContent = decoder.decode(buffer);
      newContent = applyEditorTransforms(newRawContent);
    }
  } catch (error) {
    const message = `Failed to read ${node.path}: ${error.message || String(error)}`;
    newRawContent = message;
    newContent = applyEditorTransforms(newRawContent);
    nextErrorMessage = message;
  }

  if (selectedFileId.value !== node.id) {
    if (newUrl) {
      URL.revokeObjectURL(newUrl);
    }
    return;
  }

  const oldUrl = fileUrl.value;

  rawFileContent.value = newRawContent;
  fileContent.value = newContent;
  fileUrl.value = newUrl;
  fontMetadata.value = newFontMetadata;
  mediaDimensions.value = newMediaDimensions;
  displayedNode.value = node;
  errorMessage.value = nextErrorMessage;

  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
  }

  isFileLoading.value = false;
}

async function getFileData(node) {
  if (node.sourceType === 'archive') {
    return await getRpaFileData(node.archiveFile, node.archiveEntry, node.archiveKey, autoDeobfuscate);
  }

  if (node.sourceType === 'filesystem') {
    const file = await resolveFilesystemNodeFile(node);
    if (!file) {
      throw new Error('File handle is no longer available.');
    }
    return await file.arrayBuffer();
  }

  throw new Error('Unsupported file source.');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function exportSelectedFile() {
  if (!displayedNode.value || displayedNode.value.type !== 'file') return;

  try {
    const node = displayedNode.value;
    const buffer = await getFileData(node);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    downloadBlob(blob, node.name);

    appendLog(`Exported file: ${node.name}`);
  } catch (error) {
    const message = `Failed to export ${displayedNode.value.name}: ${error.message}`;
    appendLog(message);
    errorMessage.value = message;
  }
}

function getContentExportName(filename) {
  return filename.replace(/\.rpyc$/i, '.rpy');
}

function canExportContent(path) {
  return isTextFile(path) || isCompiledRpy(path);
}

async function exportSelectedContent() {
  if (!displayedNode.value || displayedNode.value.type !== 'file' || !canExportContent(displayedNode.value.path)) return;

  try {
    const filename = getContentExportName(displayedNode.value.name);
    const blob = new Blob([fileContent.value], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, filename);

    appendLog(`Exported content: ${filename}`);
  } catch (error) {
    const message = `Failed to export content for ${displayedNode.value.name}: ${error.message}`;
    appendLog(message);
    errorMessage.value = message;
  }
}

function handleMediaWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -10 : 10;
  const newZoom = Math.max(10, Math.min(500, mediaZoom.value + delta));
  mediaZoom.value = newZoom;
}

function startDrag(e) {
  isDragging.value = true;
  hasDragged.value = false;
  dragStart.value = { x: e.clientX - mediaPan.value.x, y: e.clientY - mediaPan.value.y };
}

function onDrag(e) {
  if (!isDragging.value) return;
  hasDragged.value = true;
  mediaPan.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y
  };
}

function stopDrag(e) {
  isDragging.value = false;
  if (hasDragged.value && e && e.target && e.target.tagName.toLowerCase() === 'video') {
    const preventClick = (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      e.target.removeEventListener('click', preventClick, true);
    };
    e.target.addEventListener('click', preventClick, true);
    setTimeout(() => {
      e.target.removeEventListener('click', preventClick, true);
    }, 50);
  }
}

async function onRpaSwitch(filename) {
  if (filename === selectedArchiveName.value) return;

  try {
    isFileLoading.value = true;
    errorMessage.value = '';
    const project = fileStore.currentProject;
    const { file } = await resolveProjectRpaFile({
      project,
      filename,
      persistenceStore
    });
    localFile.value = file;
  } catch (error) {
    errorMessage.value = `Failed to switch RPA: ${error.message}`;
    isFileLoading.value = false;
  }
}

watch(() => fileStore.selectedFile, (newFile, oldFile) => {
  if (newFile === oldFile) {
    return;
  }

  localFile.value = newFile;
});

watch([() => localFile.value, () => fileStore.currentProject], async ([newFile, newProject], [oldFile, oldProject]) => {
  if (newFile === oldFile && newProject === oldProject) {
    return;
  }

  await synchronizeExternalSession();
}, { immediate: true });

onMounted(() => {
  settingsStore.loadSettings();
  window.addEventListener('drop', onWindowDrop);
  window.addEventListener('dragend', onWindowDragEnd);
  window.addEventListener('dragleave', onWindowDragLeave);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('keydown', handleWindowKeydown);
});

onUnmounted(() => {
  musicStore.setPreviewPlaying(false);
  window.removeEventListener('drop', onWindowDrop);
  window.removeEventListener('dragend', onWindowDragEnd);
  window.removeEventListener('dragleave', onWindowDragLeave);
  window.removeEventListener('blur', onWindowBlur);
  window.removeEventListener('keydown', handleWindowKeydown);

  if (mediaResizeObserver) {
    mediaResizeObserver.disconnect();
  }
  revokeCurrentFileUrl();
  if (loadingTimer) clearInterval(loadingTimer);
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
});
</script>

<template>
  <div class="h-full text-slate-100 flex flex-col">
    <main class="flex-1 flex overflow-hidden min-w-0">
      <aside
        class="w-72 border-r border-slate-800 flex flex-col shrink-0 relative"
        :class="isDropZoneActive('sidebar') ? 'bg-emerald-500/5' : ''"
        @dragenter="onDropZoneDragEnterGuarded('sidebar', $event)"
        @dragover="onDropZoneDragOverGuarded($event)"
        @dragleave="onDropZoneDragLeaveGuarded('sidebar', $event)"
        @drop="onDropZoneDrop"
      >
        <div
          v-if="isDropZoneActive('sidebar')"
          class="pointer-events-none absolute inset-0 z-20 border-2 border-dashed border-emerald-500/60 bg-emerald-500/10"
        ></div>
        <div class="border-b border-slate-800">
          <div v-if="showRpaSelector">
            <CustomSelect
              :model-value="selectedArchiveName"
              :options="rpaOptions"
              @change="onRpaSwitch"
            />
          </div>
          <div>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search files..."
              class="w-full h-10 border-b border-slate-800 px-3 text-slate-300 focus:outline-none focus:border-emerald-500/50"
            >
          </div>
          <div class="px-3 py-2 flex flex-col gap-2">
            <div class="flex items-center justify-between text-[10px] text-slate-500">
              <span>{{ displayedFileCount }} files</span>
            </div>

            <div class="grid grid-cols-3 gap-x-3 gap-y-1.5 text-slate-400">
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 min-w-0">
                <input type="checkbox" v-model="isAllSelected" class="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3 h-3 shrink-0">
                <span>All</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 min-w-0">
                <input type="checkbox" v-model="filterTypes.image" class="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3 h-3 shrink-0">
                <span>Images</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 min-w-0">
                <input type="checkbox" v-model="filterTypes.audio" class="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3 h-3 shrink-0">
                <span>Audio</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 min-w-0">
                <input type="checkbox" v-model="filterTypes.video" class="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3 h-3 shrink-0">
                <span>Video</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 min-w-0">
                <input type="checkbox" v-model="filterTypes.font" class="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3 h-3 shrink-0">
                <span>Fonts</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 min-w-0">
                <input type="checkbox" v-model="filterTypes.text" class="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3 h-3 shrink-0">
                <span>Text</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 min-w-0">
                <input type="checkbox" v-model="filterTypes.other" class="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3 h-3 shrink-0">
                <span>Other</span>
              </label>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-auto font-mono">
          <div
            v-if="!hasActiveSession && !isFileLoading"
            class="h-full flex items-center justify-center text-slate-500 px-4 text-center"
          >
            No files loaded.
          </div>

          <div
            v-else-if="isFileLoading && !rootNodes.length"
            class="h-full flex items-center justify-center text-slate-500"
          >
            Loading...
          </div>

          <div
            v-else-if="!rootNodes.length"
            class="h-full flex items-center justify-center text-slate-500 px-4 text-center"
          >
            No files available in this view.
          </div>

          <template v-else>
            <div class="px-2 pb-2 space-y-1">
              <TreeNode
                v-for="node in filteredFileTree"
                :key="node.id"
                :node="node"
                :level="0"
                :selected-id="selectedFileId"
                @select="onSelectFile"
                @remove="onRemoveRoot"
              />
            </div>
          </template>
        </div>
      </aside>

      <section
        class="flex-1 flex flex-col min-w-0 relative"
        :class="isDropZoneActive('viewer') ? 'bg-emerald-500/5' : ''"
        @dragenter="onDropZoneDragEnterGuarded('viewer', $event)"
        @dragover="onDropZoneDragOverGuarded($event)"
        @dragleave="onDropZoneDragLeaveGuarded('viewer', $event)"
        @drop="onDropZoneDrop"
      >
        <div
          v-if="isDropZoneActive('viewer')"
          class="pointer-events-none absolute inset-0 z-20 border-2 border-dashed border-emerald-500/60 bg-emerald-500/10"
        ></div>
        <div
          v-if="dragTargetActive"
          class="pointer-events-none absolute inset-x-6 top-6 z-30 flex justify-center"
        >
          <div class="border border-emerald-500/50 bg-slate-950/90 px-3 py-2 text-emerald-200 shadow-lg backdrop-blur">
            Drop a .rpa, .rpy, .rpyc, game folder, or .app bundle.
          </div>
        </div>
        <div class="h-10 border-b border-slate-800 flex items-center px-3">
          <template v-if="displayedNode">
            <div class="flex items-center gap-1 font-mono overflow-hidden whitespace-nowrap">
              <template v-for="(part, index) in (displayedNode.breadcrumbPath || displayedNode.path).split('/')" :key="index">
                <span v-if="index > 0" class="text-slate-600">/</span>
                <span :class="index === (displayedNode.breadcrumbPath || displayedNode.path).split('/').length - 1 ? 'text-slate-200 font-semibold' : 'text-slate-400'">
                  {{ part }}
                </span>
              </template>
            </div>

            <div class="flex-1"></div>
            <button
              v-if="canExportContent(displayedNode.path)"
              @click="exportSelectedContent"
              class="text-slate-300 px-2 py-0.5 rounded border border-slate-700 ml-2 hover:border-slate-600"
            >
              Export Content
            </button>
            <button
              @click="exportSelectedFile"
              class="text-slate-300 px-2 py-0.5 rounded border border-slate-700 ml-2 hover:border-slate-600"
            >
              Export File
            </button>
          </template>
          <template v-else>
            <span class="text-slate-500">Select a file to view</span>
          </template>
        </div>

        <div class="flex-1 overflow-hidden flex min-w-0 min-h-0">
          <div class="flex-1 overflow-hidden relative flex flex-col min-w-0">
            <div
              v-if="!displayedNode"
              class="flex-1 flex items-center justify-center overflow-hidden"
            >
              <img
                :src="bgImage"
                alt=""
                class="max-w-full opacity-50 max-h-full object-contain select-none pointer-events-none"
              >
            </div>

            <div v-else class="flex-1 flex flex-col min-w-0 min-h-0">
              <div
                v-if="isImageFile(displayedNode.path)"
                class="flex-1 flex items-center justify-center p-4 bg-checkerboard overflow-hidden relative"
                :class="{ 'cursor-move': isDragging, 'cursor-default': !isDragging }"
                @wheel="handleMediaWheel"
                @mousedown="startDrag"
                @mousemove="onDrag"
                @mouseup="stopDrag"
                @mouseleave="stopDrag"
              >
                <img
                  ref="mediaRef"
                  :src="fileUrl"
                  class="max-w-full max-h-full object-contain shadow-[0_0_15px_rgba(0,0,0,0.5)] rounded transition-transform duration-75 select-none pointer-events-none"
                  :style="{ transform: `translate(${mediaPan.x}px, ${mediaPan.y}px) scale(${mediaZoom / 100})` }"
                >
              </div>
              <div
                v-else-if="isVideoFile(displayedNode.path)"
                class="flex-1 flex items-center justify-center p-4 min-h-0 min-w-0 overflow-hidden relative"
                :class="{ 'cursor-move': isDragging, 'cursor-default': !isDragging }"
                @wheel="handleMediaWheel"
                @mousedown="startDrag"
                @mousemove="onDrag"
                @mouseup="stopDrag"
                @mouseleave="stopDrag"
              >
                <video
                  ref="mediaRef"
                  :src="fileUrl"
                  controls
                  class="max-w-full max-h-full shadow-lg rounded object-contain transition-transform duration-75"
                  :style="{ transform: `translate(${mediaPan.x}px, ${mediaPan.y}px) scale(${mediaZoom / 100})` }"
                  @play="handleMediaPlay"
                  @pause="handleMediaPause"
                  @ended="handleMediaPause"
                ></video>
              </div>
              <div v-else-if="isAudioFile(displayedNode.path)" class="flex-1 flex items-center justify-center p-4">
                <audio
                  :src="fileUrl"
                  controls
                  class="w-full max-w-md"
                  @play="handleMediaPlay"
                  @pause="handleMediaPause"
                  @ended="handleMediaPause"
                ></audio>
              </div>
              <div v-else-if="isFontFile(displayedNode.path)" class="flex-1 flex flex-col items-center p-8 overflow-auto w-full transition-opacity duration-300" :class="{ 'opacity-0': isFileLoading }">
                <div class="text-center mb-8 w-full shrink-0">
                  <template v-if="fontMetadata">
                    <h3 class="text-xl font-semibold mb-2 text-slate-300">
                      {{ fontMetadata.fullName || fontMetadata.fontFamily || 'Font Preview' }}
                    </h3>
                    <div class="flex flex-col items-center gap-1 mb-4 text-slate-500">
                      <p v-if="fontMetadata.fontSubfamily" class="text-slate-400">{{ fontMetadata.fontSubfamily }}</p>
                      <p v-if="fontMetadata.version">{{ fontMetadata.version }}</p>
                      <p v-if="fontMetadata.manufacturer">By {{ fontMetadata.manufacturer }}</p>
                      <p class="mt-1 opacity-75 font-mono">{{ displayedNode.name }}</p>
                    </div>
                  </template>
                  <template v-else>
                    <h3 class="text-xl font-semibold mb-2 text-slate-300">Font Preview</h3>
                    <p class="text-slate-500 text-sm mb-4">{{ displayedNode.name }}</p>
                  </template>
                </div>
                <div class="flex-1 w-full flex flex-col items-center justify-start min-h-0">
                  <div class="space-y-12 w-full max-w-4xl text-center" :style="{ fontFamily: fileContent }">
                    <div class="w-full px-4">
                      <input
                        v-model="fontPreviewText"
                        type="text"
                        placeholder="Type here to preview..."
                        class="w-full bg-transparent border-b-2 border-slate-700 focus:border-emerald-500 outline-none text-center text-6xl py-4 placeholder:text-slate-700 transition-colors text-slate-200"
                        :style="{ fontFamily: fileContent }"
                      >
                    </div>
                    <div class="space-y-8 opacity-80">
                      <p class="text-6xl">1234567890</p>
                      <p class="text-5xl">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
                      <p class="text-5xl">abcdefghijklmnopqrstuvwxyz</p>
                      <p class="text-4xl">The quick brown fox jumps over the lazy dog.</p>
                      <p class="text-4xl">天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。</p>
                    </div>
                  </div>
                </div>
              </div>
              <div
                v-else-if="isTextFile(displayedNode.path) || isCompiledRpy(displayedNode.path)"
                class="flex-1 flex flex-col min-w-0 min-h-0 relative"
              >
                <div ref="editorRef" class="absolute inset-0 overflow-hidden"></div>
              </div>

              <div
                v-else
                class="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm gap-3"
              >
                <div class="text-lg font-mono text-slate-200">Binary File</div>
                <div class="text-xs">Preview not available</div>
              </div>
            </div>
          </div>
        </div>

        <footer class="h-10 border-t border-slate-800 flex items-center justify-between px-3 font-mono shrink-0 select-none">
          <div class="flex items-center gap-0 truncate flex-1">
            <template v-if="displayedNode">
              <div class="w-20 border-slate-800 px-2 text-right">
                <span class="text-slate-500">{{ loadingTime }} ms</span>
              </div>
              <div class="w-20 border-l border-slate-800 px-2 text-right">
                <span class="text-slate-500">{{ humanSize(displayedNode.size) }}</span>
              </div>

              <div class="w-32 border-l border-slate-800 px-2 text-center" v-if="mediaDimensions && (isImageFile(displayedNode.path) || isVideoFile(displayedNode.path))">
                <span class="text-slate-500">
                  {{ mediaDimensions.width }} × {{ mediaDimensions.height }}
                  <span class="text-slate-500 ml-1">({{ actualMediaZoom }}%)</span>
                </span>
              </div>
            </template>
            <div v-else class="flex items-center gap-2 text-slate-500">
              <span>Ready</span>
              <span v-if="currentSessionLabel" class="text-slate-600">— {{ currentSessionLabel }}</span>
            </div>
          </div>

          <div v-if="errorMessage" class="flex items-center gap-2 text-red-400 shrink-0 px-2 py-0.5 rounded border border-red-900/30 ml-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            <span class="truncate max-w-xs">{{ errorMessage }}</span>
            <button @click="errorMessage = ''" class="hover:text-red-300 ml-1">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>

          <div v-if="displayedNode && (isTextFile(displayedNode.path) || isCompiledRpy(displayedNode.path))" class="ml-4 flex items-center gap-2 border-l border-slate-800 pl-4">
            <div class="flex items-center gap-2 mr-2" title="Font Size">
              <span class="text-slate-500 text-[10px]">A</span>
              <input
                type="range"
                v-model.number="settingsStore.fontSize"
                min="10"
                max="30"
                step="1"
                class="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span class="text-slate-500 text-sm">A</span>
              <span class="text-slate-500 w-5 text-right">{{ settingsStore.fontSize || 14 }}</span>
            </div>

            <button
              @click="settingsStore.showLineNumbers = !settingsStore.showLineNumbers"
              class="flex items-center gap-1.5 px-2 py-0.5 transition-colors"
              :class="settingsStore.showLineNumbers ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'"
              title="Toggle Line Numbers"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
                <path d="M4 6v12" />
              </svg>
              <span>LN</span>
            </button>

            <button
              @click="settingsStore.wordWrap = !settingsStore.wordWrap"
              class="flex items-center gap-1.5 px-2 py-0.5 transition-colors"
              :class="settingsStore.wordWrap ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'"
              title="Toggle Word Wrap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 7h16" />
                <path d="M4 17h16" />
                <path d="M4 12h13a3 3 0 0 1 0 6h-4" />
                <polyline points="15 16 13 18 15 20" />
              </svg>
              <span>WW</span>
            </button>

            <button
              @click="removeBlankLinesEnabled = !removeBlankLinesEnabled"
              class="flex items-center gap-1.5 px-2 py-0.5 transition-colors"
              :class="removeBlankLinesEnabled ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'"
              title="Remove blank lines from editor content"
            >
              <span>BL</span>
            </button>
          </div>
        </footer>
      </section>
    </main>
  </div>
</template>

<style scoped>
.bg-checkerboard {
  background-color: #1e293b;
  background-image:
    linear-gradient(45deg, #0f172a 25%, transparent 25%),
    linear-gradient(-45deg, #0f172a 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #0f172a 75%),
    linear-gradient(-45deg, transparent 75%, #0f172a 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

:deep(.cm-editor) {
  height: 100%;
}

:deep(.cm-panels.cm-panels-top) {
  justify-content: flex-end;
}

:deep(.cm-search.cm-search-minimal) {
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  border-bottom: 1px solid var(--color-slate-800);
  background: var(--color-gray-900);
  overflow: hidden;
}

:deep(.cm-search.cm-search-minimal .cm-textfield) {
  width: 16rem;
  height: 2.5rem;
  padding-inline: calc(var(--spacing) * 3);
  border: none;
  background: transparent;
  color: rgb(203 213 225 / 1);
  outline: none;
  font-size:100%;
}

:deep(.cm-search.cm-search-minimal .cm-textfield::placeholder) {
  color: rgb(100 116 139 / 1);
}

:deep(.cm-search.cm-search-minimal .cm-textfield:focus) {
  background: rgb(15 23 42 / 0.35);
}

:deep(.cm-search.cm-search-minimal .cm-button) {
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border: none;
  border-left: 1px solid rgb(30 41 59 / 1);
  background: transparent;
  color: rgb(148 163 184 / 1);
}

:deep(.cm-search.cm-search-minimal .cm-button:hover:not(:disabled)) {
  background: rgb(15 23 42 / 0.7);
  color: rgb(248 250 252 / 1);
}

:deep(.cm-search.cm-search-minimal .cm-button:disabled) {
  opacity: 0.45;
  cursor: default;
}
</style>
