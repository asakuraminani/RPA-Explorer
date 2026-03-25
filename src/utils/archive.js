import { detectGameStructure } from './directoryParser';
import { parseRpaFile } from './rpaParser';

export function createFileArchiveId(file) {
  if (!file || file.name === undefined || file.size === undefined || file.lastModified === undefined) {
    throw new Error('Archive file identity requires name, size, and lastModified.');
  }

  return `${file.name}_${file.size}_${file.lastModified}`;
}

export function createProjectArchiveId(projectName, rpaFiles = []) {
  const timestamps = rpaFiles.map((rpa) => rpa.lastModified).join('_');
  return `${projectName}_${timestamps}`;
}

export function getArchiveSelectionId(file, project) {
  if (project?.type === 'game_project') {
    return createFileArchiveId(file);
  }

  return project?.id || createFileArchiveId(file);
}

export async function resolveFileSource(source) {
  if (!source) {
    return null;
  }

  if (source instanceof File) {
    return source;
  }

  if (source.kind === 'file' && typeof source.getFile === 'function') {
    return await source.getFile();
  }

  return null;
}

export async function getOrParseArchiveData(file, persistenceStore) {
  const id = createFileArchiveId(file);
  const cached = persistenceStore.getParsedData?.(id);

  if (cached) {
    return { id, data: cached, fromCache: true };
  }

  const data = await parseRpaFile(file);
  persistenceStore.setParsedData?.(id, data);

  return { id, data, fromCache: false };
}

export async function resolveProjectRpaFile({ project, filename, persistenceStore }) {
  if (!project || project.type !== 'game_project' || !project.handle) {
    throw new Error('Project handle lost. Please reload from Home.');
  }

  if (!filename) {
    throw new Error('No RPA file selected.');
  }

  const rpaInfo = project.rpaFiles?.find((rpa) => rpa.name === filename) || null;

  if (rpaInfo?.handle) {
    const file = await rpaInfo.handle.getFile();
    return {
      file,
      rpaInfo,
      id: createFileArchiveId(rpaInfo)
    };
  }

  if (rpaInfo) {
    const activeSource = persistenceStore.getActiveFile?.(createFileArchiveId(rpaInfo));
    const activeFile = await resolveFileSource(activeSource);

    if (activeFile) {
      return {
        file: activeFile,
        rpaInfo,
        id: createFileArchiveId(rpaInfo)
      };
    }
  }

  const structure = await detectGameStructure(project.handle);
  const fileHandle = await structure.gameDirHandle.getFileHandle(filename);
  const file = await fileHandle.getFile();
  const resolvedRpaInfo = rpaInfo || {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    handle: fileHandle
  };

  return {
    file,
    rpaInfo: resolvedRpaInfo,
    id: createFileArchiveId(resolvedRpaInfo),
    structure
  };
}
