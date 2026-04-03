
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { saveArchive, getAllArchives, deleteArchive, getArchive, deletePlaylist } from '../utils/db';
import { openRpa } from 'unrpyc-pure/browser';
import { detectGameStructure, scanRpaFiles, parseTitleFromContent, isThumbnailFile } from '../utils/directoryParser';
import { createFileArchiveId, createProjectArchiveId } from '../utils/archive';
import logger from '../utils/logger';

export const usePersistenceStore = defineStore('persistence', () => {
  const archives = ref([]);
  const isLoading = ref(false);
  const activeHandleVersion = ref(0);

  // In-memory cache of File objects or Handles (not persisted to DB)
  // Key: archiveId, Value: File object | FileSystemDirectoryHandle
  const activeFileHandles = new Map();
  // Cache of parsed entries for active files
  const parsedCache = new Map();

  function touchActiveHandles() {
    activeHandleVersion.value += 1;
  }

  /**
   * Tries to extract game title and thumbnail from various sources in a single pass.
   * @param {Object} params - Extraction parameters
   * @returns {Promise<{title: string, thumbnail: Blob|null}>}
   */
  async function extractMetadata({ metadata, existing, gameDirHandle, rpaList, fallbackName }) {
    let title = metadata.title || existing?.title;
    let thumbnail = metadata.thumbnail || existing?.thumbnail;

    if (!title || !thumbnail) {
      for (const rpa of rpaList) {
        const data = parsedCache.get(rpa.id);
        if (!data) continue;

        let rpaFile = null;
        const getFile = async () => {
          if (rpaFile) return rpaFile;
          rpaFile = rpa.file || await rpa.handle.getFile();
          return rpaFile;
        };

        // Try to extract title
        if (!title) {
          const optionsEntry = data.entries.find(e => e.path.endsWith('game/options.rpy') || e.path.endsWith('options.rpy'));
          if (optionsEntry) {
            try {
              const file = await getFile();
              const buffer = (await data.read(optionsEntry)).buffer;
              const content = new TextDecoder('utf-8').decode(buffer);
              title = parseTitleFromContent(content);
            } catch (e) {}
          }
        }

        // Try to extract thumbnail
        if (!thumbnail) {
          const thumbEntry = data.entries.find(e => isThumbnailFile(e.path));
          if (thumbEntry) {
            try {
              const file = await getFile();
              const buffer = (await data.read(thumbEntry)).buffer;
              thumbnail = new Blob([buffer], { type: 'image/png' });
            } catch (e) {}
          }
        }

        if (title && thumbnail) break;
      }
    }

    return {
      title: title || fallbackName,
      thumbnail: thumbnail || null
    };
  }

  // Load all archives from DB
  async function loadArchives() {
    isLoading.value = true;
    try {
      const list = await getAllArchives();
      // Sort by lastOpened desc
      archives.value = list.sort((a, b) => b.lastOpened - a.lastOpened);
    } catch (e) {
      logger.error(`Failed to load archives: ${e.message}`);
    } finally {
      isLoading.value = false;
    }
  }

  // Add or update an archive
  // input: File | FileSystemFileHandle | FileSystemDirectoryHandle
  async function addArchive(input, metadata = {}) {
    let type = 'single_file';
    let file = null;
    let handle = null;
    let id = '';
    let title = '';
    let thumbnail = null;
    let rpaFiles = [];
    let lastModified = Date.now();

    // 1. Identify Input Type
    if (input.kind === 'directory') {
        type = 'game_project';
        handle = input;
    } else if (input.kind === 'file') {
        type = 'single_file';
        handle = input;
        file = await input.getFile();
    } else {
        // Assume File object (legacy)
        type = 'single_file';
        file = input;
    }

    // 2. Process and Unify
    let gameDirHandle = null;
    let structure = null;
    let fallbackName = '';

    if (type === 'game_project') {
        structure = await detectGameStructure(handle);
        gameDirHandle = structure.gameDirHandle;
        
        // Scan for RPAs
        rpaFiles = await scanRpaFiles(gameDirHandle);
        if (rpaFiles.length === 0) {
            throw new Error('No .rpa files found in the game directory.');
        }

        // Sort rpaFiles by name to ensure deterministic order
        rpaFiles.sort((a, b) => a.name.localeCompare(b.name));

        // Generate ID: FolderName_AllRpasModified
        id = createProjectArchiveId(structure.name, rpaFiles);

        // Use the latest modified time from any RPA file as the project's modification time
        lastModified = rpaFiles.reduce((max, file) => Math.max(max, file.lastModified), 0);
        fallbackName = structure.name;

    } else {
        // Single File Logic
        id = createFileArchiveId(file);
        rpaFiles = [{ 
            name: file.name, 
            handle: handle, 
            size: file.size, 
            lastModified: file.lastModified,
            file: file 
        }];
        lastModified = file.lastModified;
        fallbackName = file.name.replace(/\.rpa$/i, '').replace(/[_-]/g, ' ');
    }

    // 3. Pre-parse all RPA files and cache them
    const rpaList = rpaFiles.map(r => ({
        id: createFileArchiveId(r),
        handle: r.handle,
        file: r.file,
        name: r.name
    }));

    for (const rpa of rpaList) {
        if (!parsedCache.has(rpa.id)) {
            try {
                const rpaFile = rpa.file || await rpa.handle.getFile();
                const data = await openRpa(rpaFile);
                parsedCache.set(rpa.id, data);
            } catch (e) {
                logger.warn(`Failed to pre-parse RPA ${rpa.name}: ${e.message}`);
            }
        }
        // Also register as active handle
        try {
            const rpaFile = rpa.file || await rpa.handle.getFile();
            activeFileHandles.set(rpa.id, rpaFile);
            touchActiveHandles();
        } catch (e) {
            logger.warn(`Failed to register active handle for ${rpa.name}: ${e.message}`);
        }
    }

    // 4. Extract Metadata
    const existing = await getArchive(id);
  
    // Try to find title and thumbnail in a single pass (will use cached data)
    const meta = await extractMetadata({ 
        metadata, 
        existing, 
        gameDirHandle, 
        rpaList, 
        fallbackName 
    });
    
    title = meta.title;
    thumbnail = meta.thumbnail;
 
    activeFileHandles.set(id, handle || file);
    touchActiveHandles();

    const totalSize = rpaFiles.reduce((sum, r) => sum + r.size, 0);

    const entry = {
      ...existing, 
      ...metadata,
      id,
      type,
      name: type === 'game_project' ? (input.name || 'Unknown Project') : file.name,
      size:  totalSize , 
      lastModified: lastModified,
      lastOpened: Date.now(),
      thumbnail,
      title,
      // Exclude handles from rpaFiles when saving to IDB
      // Handles are not reliably serializable (especially Firefox's FileSystemEntry wrappers)
      rpaFiles: type === 'game_project' 
        ? rpaFiles.map(r => ({
            name: r.name,
            size: r.size,
            lastModified: r.lastModified
            // Do NOT include 'handle'
          })) 
        : undefined,
      // We can optionally store the handle in DB if supported, but for now we rely on activeFileHandles
      // Note: Storing handles in IDB is supported in Chrome but requires careful handling.
      // For this implementation, we'll stick to re-requesting if handle is missing, 
      // but for better UX we SHOULD store it.
      // handle: handle // (Optional: verify if structured clone algorithm supports this in current env)
    };
    
    await saveArchive(entry);
    await loadArchives(); 
    return id;
  }

  // Check if we have an active handle for this archive
  function getActiveFile(id) {
    return activeFileHandles.get(id);
  }

  function getParsedData(id) {
    return parsedCache.get(id);
  }

  function setParsedData(id, data) {
    parsedCache.set(id, data);
  }

  function registerRuntimeArchive(fileOrHandle, parsedData = null) {
    let id = null;

    if (fileOrHandle instanceof File) {
      id = createFileArchiveId(fileOrHandle);
      activeFileHandles.set(id, fileOrHandle);
    } else if (fileOrHandle?.kind === 'file') {
      id = createFileArchiveId(fileOrHandle);
      activeFileHandles.set(id, fileOrHandle);
    }

    if (!id) {
      return null;
    }

    if (parsedData) {
      parsedCache.set(id, parsedData);
    }

    touchActiveHandles();
    return id;
  }

  // Manually register an active handle (e.g. when file selected but not yet fully parsed)
  function registerActiveHandle(fileOrHandle) {
    let id;
    if (fileOrHandle.kind === 'directory') {
         logger.warn('registerActiveHandle not fully supported for directories without ID');
         return;
    } else if (fileOrHandle instanceof File) {
         id = createFileArchiveId(fileOrHandle);
    } else {
         id = createFileArchiveId(fileOrHandle);
    }
    
    if (id) {
        activeFileHandles.set(id, fileOrHandle);
        touchActiveHandles();
    }
  }

  // Remove archive
  async function removeArchive(id) {
    const archive = archives.value.find(a => a.id === id);
    if (archive && archive.type === 'game_project' && archive.rpaFiles) {
        // Delete playlists for all contained RPAs
        for (const rpa of archive.rpaFiles) {
            const rpaId = createFileArchiveId(rpa);
            try {
                activeFileHandles.delete(rpaId);
                touchActiveHandles();
                parsedCache.delete(rpaId);
                await deletePlaylist(rpaId);
            } catch (e) {
                console.warn(`Failed to delete playlist for ${rpa.name}`, e);
            }
        }
    }

    activeFileHandles.delete(id);
    touchActiveHandles();
    parsedCache.delete(id);
    await deleteArchive(id);
    await loadArchives();
  }

  function clearRuntimeState() {
    archives.value = [];
    activeFileHandles.clear();
    touchActiveHandles();
    parsedCache.clear();
  }

  return {
    archives,
    isLoading,
    activeHandleVersion,
    loadArchives,
    addArchive,
    removeArchive,
    getActiveFile,
    registerActiveHandle,
    registerRuntimeArchive,
    getParsedData,
    setParsedData,
    clearRuntimeState
  };
});
