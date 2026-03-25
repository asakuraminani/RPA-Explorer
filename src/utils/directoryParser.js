
/**
 * Utility functions for parsing game directory structures and identifying Ren'Py games.
 */

/**
 * Common patterns for game titles in Ren'Py options.rpy
 */
export const TITLE_PATTERN = /define\s+config\.name\s*=\s*(?:_\()?["']([^"']+)["']\)?/;

/**
 * Common patterns for thumbnails/covers
 */
export const THUMBNAIL_PATTERNS = [/(thumbnail|cover|icon|gui\/window_icon)\.(png|jpg|webp|jpeg)$/i];

/**
 * Parses a game title from file content string.
 * @param {string} content 
 * @returns {string|null}
 */
export function parseTitleFromContent(content) {
    const match = content.match(TITLE_PATTERN);
    return match ? match[1] : null;
}

/**
 * Checks if a filename matches thumbnail patterns.
 * @param {string} filename 
 * @returns {boolean}
 */
export function isThumbnailFile(filename) {
    return THUMBNAIL_PATTERNS.some(p => p.test(filename));
}

/**
 * Detects the game structure from a root directory handle.
 * Supports:
 * 1. macOS .app bundle: xxx.app/Contents/Resources/autorun/game/
 * 2. Standard directory: xxx/game/
 * 
 * @param {FileSystemDirectoryHandle} rootHandle - The handle of the dropped directory
 * @returns {Promise<{type: 'app'|'directory', gameDirHandle: FileSystemDirectoryHandle, rootHandle: FileSystemDirectoryHandle, name: string}>}
 */
export async function detectGameStructure(rootHandle) {
    let gameDirHandle = null;
    let type = 'directory';
    const rootName = rootHandle.name;

    // Check if it's a macOS .app bundle
    if (rootName.endsWith('.app')) {
        try {
            // Navigate down the .app structure
            // path: Contents/Resources/autorun/game/
            const contents = await rootHandle.getDirectoryHandle('Contents');
            const resources = await contents.getDirectoryHandle('Resources');
            const autorun = await resources.getDirectoryHandle('autorun');
            gameDirHandle = await autorun.getDirectoryHandle('game');
            type = 'app';
        } catch (e) {
            console.warn('Failed to navigate .app structure, trying direct game folder check...', e);
            // Fallback: maybe it's not a standard structure, check for 'game' directly inside
            try {
                gameDirHandle = await rootHandle.getDirectoryHandle('game');
                type = 'directory'; // Treat as directory if standard structure fails
            } catch (e2) {
                // If game folder not found, throw error
                throw new Error('Could not find "game" directory inside the .app bundle.');
            }
        }
    } else {
        // Standard directory
        try {
            gameDirHandle = await rootHandle.getDirectoryHandle('game');
        } catch (e) {
            throw new Error('Valid Ren\'Py game structure not found. Please drop the game folder containing a "game" subdirectory.');
        }
    }

    return {
        type,
        gameDirHandle,
        rootHandle,
        name: rootName
    };
}

/**
 * Scans a directory handle for .rpa files.
 * @param {FileSystemDirectoryHandle} dirHandle 
 * @returns {Promise<Array<{name: string, handle: FileSystemFileHandle, size: number, lastModified: number}>>}
 */
export async function scanRpaFiles(dirHandle) {
    const rpaFiles = [];
    
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.rpa')) {
            const file = await entry.getFile();
            rpaFiles.push({
                name: entry.name,
                handle: entry, // Keep the handle for later access
                size: file.size,
                lastModified: file.lastModified
            });
        }
    }
    
    return rpaFiles;
}

/**
 * Attempts to find and parse options.rpy to get the game title.
 * @param {FileSystemDirectoryHandle} gameDirHandle 
 * @returns {Promise<string|null>}
 */
export async function findGameTitle(gameDirHandle) {
    try {
        let optionsFileHandle = null;
        
        try {
            optionsFileHandle = await gameDirHandle.getFileHandle('options.rpy');
        } catch (e) {
            return null;
        }

        if (!optionsFileHandle) return null;

        const file = await optionsFileHandle.getFile();
        const text = await file.text();
        return parseTitleFromContent(text);
    } catch (e) {
        console.warn('Error parsing options.rpy:', e);
    }
    return null;
}
