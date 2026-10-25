/**
 * Zero-Dependency Pure TypeScript ZIP Packager
 * Generates valid, standards-compliant .zip archives in-memory without external libraries.
 * Compatible with Windows Explorer, macOS Archive Utility, Linux unzip, Android, and iOS.
 */

// Precomputed CRC32 Table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export function computeCRC32(data: Uint8Array): number {
  let crc = 0 ^ (-1);
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

export interface ZipFileInput {
  filename: string;
  content: string | Uint8Array;
}

/**
 * Creates a standard uncompressed (STORE) ZIP archive from an array of files.
 */
export function createZipArchive(files: ZipFileInput[]): Uint8Array {
  const textEncoder = new TextEncoder();
  const fileEntries: Array<{
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    offset: number;
  }> = [];

  const chunks: Uint8Array[] = [];
  let currentOffset = 0;

  // 1. Write Local File Headers and Data
  for (const file of files) {
    const nameBytes = textEncoder.encode(file.filename);
    const dataBytes = typeof file.content === 'string'
      ? textEncoder.encode(file.content)
      : file.content;
    const crc = computeCRC32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);

    // Signature 0x04034b50
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);       // Version needed: 2.0
    view.setUint16(6, 0x0800, true);   // UTF-8 flag
    view.setUint16(8, 0, true);        // Compression: 0 (Store)
    view.setUint16(10, 0, true);       // Mod time
    view.setUint16(12, 0x5421, true);  // Mod date (2026)
    view.setUint32(14, crc, true);     // CRC32
    view.setUint32(18, dataBytes.length, true); // Compressed size
    view.setUint32(22, dataBytes.length, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true); // Filename length
    view.setUint16(28, 0, true);       // Extra field length
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader);
    chunks.push(dataBytes);

    fileEntries.push({
      nameBytes,
      dataBytes,
      crc,
      offset: currentOffset,
    });

    currentOffset += localHeader.length + dataBytes.length;
  }

  // 2. Write Central Directory Headers
  const centralDirStartOffset = currentOffset;
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    const cdHeader = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(cdHeader.buffer);

    // Signature 0x02014b50
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);       // Version made by
    view.setUint16(6, 20, true);       // Version needed
    view.setUint16(8, 0x0800, true);   // UTF-8 flag
    view.setUint16(10, 0, true);       // Compression: Store
    view.setUint16(12, 0, true);       // Mod time
    view.setUint16(14, 0x5421, true);  // Mod date
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.dataBytes.length, true);
    view.setUint32(24, entry.dataBytes.length, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true);       // Extra length
    view.setUint16(32, 0, true);       // Comment length
    view.setUint16(34, 0, true);       // Disk start
    view.setUint16(36, 0, true);       // Internal attrs
    view.setUint32(38, 0, true);       // External attrs
    view.setUint32(42, entry.offset, true); // Relative offset of local header
    cdHeader.set(entry.nameBytes, 46);

    chunks.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  // 3. Write End of Central Directory Record (EOCD)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  // Signature 0x06054b50
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);      // Disk number
  eocdView.setUint16(6, 0, true);      // Disk with CD
  eocdView.setUint16(8, fileEntries.length, true);  // Records on this disk
  eocdView.setUint16(10, fileEntries.length, true); // Total records
  eocdView.setUint32(12, centralDirSize, true);     // Size of central directory
  eocdView.setUint32(16, centralDirStartOffset, true); // Offset of start of CD
  eocdView.setUint16(20, 0, true);     // Comment length
  chunks.push(eocd);

  // Combine into single Uint8Array
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }

  return result;
}
