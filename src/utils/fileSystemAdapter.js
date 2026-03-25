
/**
 * Adapters to make FileSystemEntry (standard/Firefox) look like FileSystemHandle (modern/Chrome).
 */

export class FileSystemHandleAdapter {
    constructor(entry) {
        this.entry = entry;
        this.name = entry.name;
    }

    async queryPermission() {
        return 'granted';
    }

    async requestPermission() {
        return 'granted';
    }
    
    isSameEntry(other) {
        if (!other || !other.entry) return false;
        // Basic check, might not be perfect
        return this.entry.fullPath === other.entry.fullPath;
    }
}

export class FileSystemFileHandleAdapter extends FileSystemHandleAdapter {
    constructor(entry) {
        super(entry);
        this.kind = 'file';
    }

    async getFile() {
        return new Promise((resolve, reject) => {
            this.entry.file(resolve, reject);
        });
    }
}

export class FileSystemDirectoryHandleAdapter extends FileSystemHandleAdapter {
    constructor(entry) {
        super(entry);
        this.kind = 'directory';
    }

    async getDirectoryHandle(name, options = {}) {
        return new Promise((resolve, reject) => {
            this.entry.getDirectory(name, options, (dirEntry) => {
                resolve(new FileSystemDirectoryHandleAdapter(dirEntry));
            }, (err) => {
                if (err.name === 'NotFoundError') {
                    const error = new Error(`A requested file or directory could not be found at the time an operation was processed.`);
                    error.name = 'NotFoundError';
                    reject(error);
                } else {
                    reject(err);
                }
            });
        });
    }

    async getFileHandle(name, options = {}) {
        return new Promise((resolve, reject) => {
            this.entry.getFile(name, options, (fileEntry) => {
                resolve(new FileSystemFileHandleAdapter(fileEntry));
            }, (err) => {
                if (err.name === 'NotFoundError') {
                     const error = new Error(`A requested file or directory could not be found at the time an operation was processed.`);
                     error.name = 'NotFoundError';
                     reject(error);
                } else {
                    reject(err);
                }
            });
        });
    }

    async *values() {
        const reader = this.entry.createReader();
        
        const readBatch = () => new Promise((resolve, reject) => {
            reader.readEntries(resolve, reject);
        });

        while (true) {
            const entries = await readBatch();
            if (!entries || entries.length === 0) break;
            
            for (const entry of entries) {
                if (entry.isDirectory) {
                    yield new FileSystemDirectoryHandleAdapter(entry);
                } else {
                    yield new FileSystemFileHandleAdapter(entry);
                }
            }
        }
    }
    
    async *keys() {
        for await (const handle of this.values()) {
            yield handle.name;
        }
    }

    async *entries() {
        for await (const handle of this.values()) {
            yield [handle.name, handle];
        }
    }
    
    // Allow iteration directly
    [Symbol.asyncIterator]() {
        return this.entries();
    }
}

/**
 * Creates an appropriate adapter from a FileSystemEntry.
 * @param {FileSystemEntry} entry 
 * @returns {FileSystemHandleAdapter}
 */
export function createHandleFromEntry(entry) {
    if (entry.isFile) {
        return new FileSystemFileHandleAdapter(entry);
    } else if (entry.isDirectory) {
        return new FileSystemDirectoryHandleAdapter(entry);
    }
    throw new Error('Unknown entry type');
}
