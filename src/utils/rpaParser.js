import { unzlibSync } from 'fflate';
import { Parser } from 'pickleparser';
import logger from './logger';

/**
 * Parses an RPA v3.0 file.
 * @param {File} file
 * @returns {Promise<{ entries: Array<{ path: string; size: number; offset: number; rawSize: number; prefix: any }> }>}
 */
export async function parseRpaFile(file) {
  
  let headerBuf = new Uint8Array(0);
  let headerStr = '';
  let offset = 0;
  const chunk_size = 512;
  const max_header_size = 8192; 

  while (headerStr.indexOf('\n') === -1 && offset < max_header_size) {
      const slice = file.slice(offset, offset + chunk_size);
      const buf = new Uint8Array(await slice.arrayBuffer());
      if (buf.length === 0) break;
      
      const chunkStr = new TextDecoder().decode(buf);
      headerStr += chunkStr;
      
      offset += chunk_size;
  }

  const firstLine = headerStr.split('\n')[0].trim();
  const parts = firstLine.split(/\s+/);
  
  if (!parts[0].startsWith('RPA-3')) {
      throw new Error('Not a valid RPA-3.x file (header mismatch).');
  }

  const version = parts[0] === 'RPA-3.2' ? 3.2 : 3.0;
  const indexOffset = parseInt(parts[1], 16);
  
  if (isNaN(indexOffset)) {
    throw new Error('Invalid index offset.');
  }

  let key = 0;
  
  if (version === 3.0) {
      for (let i = 2; i < parts.length; i++) {
          const val = parseInt(parts[i], 16);
          if (!isNaN(val)) {
             key ^= val;
          }
      }
      key = key >>> 0; 
  } else if (version === 3.2) {
      for (let i = 3; i < parts.length; i++) {
          const val = parseInt(parts[i], 16);
          if (!isNaN(val)) {
             key ^= val;
          }
      }
      key = key >>> 0;
  }


  const indexSlice = file.slice(indexOffset);
  let indexBuf = new Uint8Array(await indexSlice.arrayBuffer());
  let decompressed;
  let lastError = null;

  try {
      decompressed = unzlibSync(indexBuf);
  } catch (err) {
      lastError = err;
      console.warn('Standard decompression failed, trying to derive key just in case?', err);
  }

  if (!decompressed) {
     throw new Error(`Index decompression failed. Last error: ${lastError?.message || lastError}. Original Key: 0x${key.toString(16)}`);
  }

  let data;
  try {
    const parser = new Parser();
    data = parser.parse(decompressed);
  } catch (err) {
    const first16 = Array.from(decompressed.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    logger.error(`Pickle parsing failed: ${err.message || err}. Data start: ${first16}`);
    throw new Error(`Pickle parsing failed: ${err.message || err}. Data start: ${first16}`);
  }

  const entries = [];
  
  let fileEntries = [];
  
  if (data instanceof Map) {
      data.forEach((value, key) => {
          fileEntries.push([key, value]);
      });
  } else if (typeof data === 'object' && data !== null) {
      fileEntries = Object.entries(data);
  } else {
      throw new Error('Unexpected pickle result type: ' + typeof data);
  }

  for (const [filename, fileList] of fileEntries) {
      
      let items = [];
      if (Array.isArray(fileList)) {
          items = fileList;
      } else {
          logger.warn(`FileList is not array: ${filename}`);
          continue;
      }


      if (items.length > 0) {
          
          let item = items[0];
          
          if (!Array.isArray(item)) {
             if (items.length >= 2 && typeof items[0] === 'number') {
                 item = items;
             } else {
                 logger.warn(`Unexpected item format (inner) for file: ${filename}`);
                 continue;
             }
          }
          
          if (item.length >= 2) {
            let offset = item[0];
            let length = item[1];
            const prefix = item[2] || null;
            
            if (key !== 0) {
                let offsetNum = Number(offset);
                let lengthNum = Number(length);
                
                if (offsetNum <= 0xFFFFFFFF) {
                    offset = (offsetNum ^ key) >>> 0;
                } else {
                    const offsetBI = typeof offset === 'bigint' ? offset : BigInt(offset);
                    const keyBI = BigInt(key);
                    offset = Number(offsetBI ^ keyBI);
                }

                if (lengthNum <= 0xFFFFFFFF) {
                    length = (lengthNum ^ key) >>> 0;
                } else {
                    const lengthBI = typeof length === 'bigint' ? length : BigInt(length);
                    const keyBI = BigInt(key);
                    length = Number(lengthBI ^ keyBI);
                }
            } else {
                offset = Number(offset);
                length = Number(length);
            }

            entries.push({
                path: filename,
                offset: offset,
                size: length,
                rawSize: length, 
                prefix: prefix
            });
          }
      }
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  
  logger.info(`Successfully parsed ${entries.length} entries from RPA file.`);
  return { entries, key, version, indexOffset, header: firstLine };
}
