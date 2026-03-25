import { defineStore } from 'pinia';
import { shallowRef, ref } from 'vue';
import { createFileArchiveId } from '../utils/archive';

export const useFileStore = defineStore('file', () => {
  const selectedFile = shallowRef(null);
  const parsedEntries = shallowRef([]);
  const archiveKey = ref(0);

  // Structure examples:
  // - { type: 'archive_file', id, name, title }
  // - { type: 'game_project', id, title, name, rpaFiles: [], handle }
  // - { type: 'filesystem_directory', id, name, title, handle }
  // - { type: 'filesystem_file', id, name, title, file?, handle? }
  const currentProject = shallowRef(null);

  function resetBrowseState() {
    parsedEntries.value = [];
    archiveKey.value = 0;
  }

  function setFile(file, projectContext = null) {
    selectedFile.value = file;

    if (projectContext) {
      currentProject.value = projectContext;
    } else {
      currentProject.value = {
        type: 'archive_file',
        name: file.name,
        id: createFileArchiveId(file)
      };
    }

    resetBrowseState();
  }

  function setProject(project) {
    currentProject.value = project;
    resetBrowseState();
  }

  function setFilesystemDirectory(projectContext) {
    selectedFile.value = null;
    currentProject.value = {
      ...projectContext,
      type: 'filesystem_directory'
    };
    resetBrowseState();
  }

  function setFilesystemFile(projectContext) {
    selectedFile.value = null;
    currentProject.value = {
      ...projectContext,
      type: 'filesystem_file'
    };
    resetBrowseState();
  }

  function setParsedEntries(entries, key) {
    parsedEntries.value = entries;
    if (key !== undefined) {
      archiveKey.value = key;
    }
  }

  function clearFile() {
    selectedFile.value = null;
    currentProject.value = null;
    resetBrowseState();
  }

  return {
    selectedFile,
    parsedEntries,
    archiveKey,
    currentProject,
    setFile,
    setProject,
    setFilesystemDirectory,
    setFilesystemFile,
    setParsedEntries,
    clearFile
  };
});
