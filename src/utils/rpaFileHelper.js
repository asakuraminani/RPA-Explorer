import { fileTypeFromBuffer } from 'file-type';

/**
 * Detects the file type based on its content using file-type library.
 * @param {ArrayBuffer} buffer - The file content
 * @returns {Promise<string|null>} - The detected extension (e.g., 'mp3', 'ogg', 'png') or null
 */
export async function detectFileType(buffer) {
    const type = await fileTypeFromBuffer(buffer);
    return type ? type.ext : null;
}

/**
 * Reads file data from the RPA archive, handling decryption and prefixes.
 * @param {File} archiveFile - The RPA archive file object
 * @param {Object} entry - The file entry from parsed entries (offset, size, prefix, etc.)
 * @param {Number} key - The archive obfuscation key
 * @param {Boolean} autoDeobfuscate - Whether to automatically attempt deobfuscation
 * @returns {Promise<ArrayBuffer>} - The file content as ArrayBuffer
 */
export async function getRpaFileData(archiveFile, entry, key, autoDeobfuscate = true) {
    const offset = entry.offset;
    const size = entry.rawSize || entry.size;

    const slice = archiveFile.slice(offset, offset + size);
    let buffer = await slice.arrayBuffer();

    if (autoDeobfuscate && key) {
        const view = new Uint8Array(buffer);
        const xored = new Uint8Array(view.length);

        for(let i=0; i<view.length; i++) {
            const shift = (i % 4) * 8;
            const xorByte = (key >> shift) & 0xFF;
            xored[i] = view[i] ^ xorByte;
        }

        const path = entry.path || '';
        const ext = path.split('.').pop().toLowerCase();
        let useXored = false;


        const rawType = await fileTypeFromBuffer(buffer);
        const xoredType = await fileTypeFromBuffer(xored.buffer);

        if (rawType || xoredType) {
            if (xoredType && !rawType) {
                useXored = true;
            } else if (rawType && !xoredType) {
                useXored = false;
            } else {
                if (xoredType.ext === ext && rawType.ext !== ext) {
                    useXored = true;
                } else if (rawType.ext === ext && xoredType.ext !== ext) {
                    useXored = false;
                } else {
                    useXored = true;
                }
            }
        } else {
            
            let originalScore = 0;
            let xoredScore = 0;
            const checkLen = Math.min(view.length, 256);
            
            for(let i=0; i<checkLen; i++) {
                const b = view[i];
                if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) originalScore++;
                
                const xb = xored[i];
                if ((xb >= 32 && xb <= 126) || xb === 9 || xb === 10 || xb === 13) xoredScore++;
            }

            if (xoredScore > originalScore && xoredScore > checkLen * 0.7) {
                useXored = true;
            } else if (originalScore < checkLen * 0.3 && xoredScore > checkLen * 0.3) {
               useXored = true;
            }
        }

        if (useXored) {
            buffer = xored.buffer;
        }
    }

    if (entry.prefix) {

        const prefixStr = entry.prefix;
        const prefixLen = prefixStr.length;

        if (prefixLen === 0) return buffer;

        const prefixBuf = new Uint8Array(prefixLen);
        for (let i = 0; i < prefixLen; i++) {
            prefixBuf[i] = prefixStr.charCodeAt(i);
        }
        
        const combined = new Uint8Array(prefixLen + buffer.byteLength);
        combined.set(prefixBuf, 0);

        const bufferView = new Uint8Array(buffer);
        combined.set(bufferView, prefixLen);

        return combined.buffer;
    }

    return buffer;
}
