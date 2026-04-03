import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getOrParseArchiveData } from '../utils/archive';
import { usePersistenceStore } from './persistence';
import streamSaver from 'streamsaver';
import * as fflate from 'fflate';

// Configure StreamSaver

export const useExtractionStore = defineStore('extraction', () => {
  const isProcessing = ref(false);
  const isComplete = ref(false);
  const isPaused = ref(false);
  const progress = ref(0);
  const statusMessage = ref('');
  const error = ref('');
  const currentArchiveId = ref(null);
  const currentArchiveName = ref('');
  
  // The directory handle to save files to
  const targetHandle = ref(null);

  function startTask(archiveId, archiveName, handle = null) {
    currentArchiveId.value = archiveId;
    currentArchiveName.value = archiveName;
    targetHandle.value = handle;
    isProcessing.value = true;
    isComplete.value = false;
    isPaused.value = false;
    progress.value = 0;
    statusMessage.value = 'Preparing...';
    error.value = '';
    
    // Add beforeunload listener to prevent accidental close
    window.addEventListener('beforeunload', handleBeforeUnload);
  }

  function handleBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  function updateProgress(p, msg) {
    progress.value = p;
    if (msg) statusMessage.value = msg;
  }

  function finishTask() {
    isProcessing.value = false;
    isComplete.value = true;
    isPaused.value = false;
    statusMessage.value = 'Extraction Complete!';
    window.removeEventListener('beforeunload', handleBeforeUnload);
  }

  function setError(msg) {
    error.value = msg;
    isProcessing.value = false;
    isPaused.value = false;
    window.removeEventListener('beforeunload', handleBeforeUnload);
  }

  function reset() {
    isProcessing.value = false;
    isComplete.value = false;
    isPaused.value = false;
    progress.value = 0;
    statusMessage.value = '';
    error.value = '';
    currentArchiveId.value = null;
    currentArchiveName.value = '';
    targetHandle.value = null;
    window.removeEventListener('beforeunload', handleBeforeUnload);
  }

  function pause() {
    if (isProcessing.value && !isComplete.value) {
        isPaused.value = true;
        statusMessage.value = 'Paused';
    }
  }

  function resume() {
    if (isProcessing.value && isPaused.value) {
        isPaused.value = false;
        statusMessage.value = 'Resuming...';
    }
  }

  function stop() {
    reset();
  }

  /**
   * Performs the actual extraction logic in the background.
   */
  async function runExtraction(archiveFile, entries, key) {
    const persistenceStore = usePersistenceStore();
    const { data } = await getOrParseArchiveData(archiveFile, persistenceStore);

    if (targetHandle.value) {
        // Mode 1: File System Access API (Extract to Folder)
        await runFolderExtraction(archiveFile, entries, data, targetHandle.value);
    } else {
        // Mode 2: StreamSaver (Download as ZIP)
        await runZipExtraction(archiveFile, entries, data);
    }
  }

  async function runFolderExtraction(archiveFile, entries, data, rootHandle) {
    try {
        const totalFiles = entries.length;
        let completed = 0;
        const batchSize = 5; 
        
        // Cache directory handles to avoid repeated getDirectoryHandle calls
        // Key: 'path/to/dir', Value: FileSystemDirectoryHandle
        const dirCache = new Map();
        dirCache.set('', rootHandle);

        const getDirHandle = async (pathParts) => {
            // Traverse from root for each file is safe but slow.
            // We can optimize by caching handles.
            let currentPath = '';
            let currentHandle = rootHandle;

            for (const part of pathParts) {
                const parentPath = currentPath;
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                if (dirCache.has(currentPath)) {
                    currentHandle = dirCache.get(currentPath);
                } else {
                    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
                    dirCache.set(currentPath, currentHandle);
                }
            }
            return currentHandle;
        };

        for (let i = 0; i < totalFiles; i += batchSize) {
            if (!isProcessing.value) break;
            
            // Check pause
            while (isPaused.value && isProcessing.value) {
                await new Promise(r => setTimeout(r, 500));
            }
            if (!isProcessing.value) break;

            const batch = entries.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (entry) => {
                try {
                    const parts = entry.path.split('/');
                    const fileName = parts.pop();
                    const dirParts = parts; // Remaining parts are directories

                    const dirHandle = await getDirHandle(dirParts);
                    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    
                    const buffer = (await data.read(entry)).buffer;
                    await writable.write(buffer);
                    await writable.close();
                } catch (e) {
                    console.error(`Failed to extract ${entry.path}`, e);
                }
            }));

            completed += batch.length;
            progress.value = Math.min(Math.round((completed / totalFiles) * 100), 99);
            statusMessage.value = `Extracting: ${batch[0].path}...`;
        }

        if (isProcessing.value) {
            finishTask();
        }
    } catch (err) {
        console.error('Folder Extraction error:', err);
        setError(`Extraction failed: ${err.message}`);
    }
  }

  async function runZipExtraction(archiveFile, entries, data) {
    try {
        const totalFiles = entries.length;
        let completed = 0;
        
        // Create a writable stream for StreamSaver
        const fileStream = streamSaver.createWriteStream(`${currentArchiveName.value}.zip`);
        const writer = fileStream.getWriter();

        // Create a ZIP stream using fflate
        const zip = new fflate.Zip((err, dat, final) => {
            if (err) {
                console.error(err);
                setError(err.message);
                writer.abort(err);
                return;
            }
            if (dat.length) {
                writer.write(dat);
            }
            if (final) {
                writer.close();
                finishTask();
            }
        });

        // Process files sequentially to keep memory low and ensure stream order
        for (const entry of entries) {
            if (!isProcessing.value) {
                zip.terminate();
                writer.abort();
                break;
            }

            while (isPaused.value && isProcessing.value) {
                await new Promise(r => setTimeout(r, 500));
            }

            try {
                const buffer = (await data.read(entry)).buffer;
                const fileData = new Uint8Array(buffer);
                
                // Add file to ZIP stream
                const file = new fflate.ZipPassThrough(entry.path);
                zip.add(file);
                file.push(fileData, true); // true = final chunk for this file
                
                completed++;
                progress.value = Math.min(Math.round((completed / totalFiles) * 100), 99);
                statusMessage.value = `Zipping: ${entry.path}...`;
            } catch (e) {
                console.error(`Failed to zip ${entry.path}`, e);
            }
        }

        if (isProcessing.value) {
            zip.end();
        }
    } catch (err) {
        console.error('Zip Extraction error:', err);
        setError(`Zip creation failed: ${err.message}`);
    }
  }

  return {
    isProcessing,
    isComplete,
    isPaused,
    progress,
    statusMessage,
    error,
    currentArchiveId,
    currentArchiveName,
    startTask,
    updateProgress,
    finishTask,
    setError,
    reset,
    pause,
    resume,
    stop,
    runExtraction
  };
});