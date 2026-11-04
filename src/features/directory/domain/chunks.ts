// A large CSV import or bulk delete goes to the server in chunks, each its own
// audited command with its own undo. Next refuses a server-action body over
// 1 MB, and the undo of a bulk delete carries every deleted row back, so a chunk
// is bounded by its serialized size as well as by its row count.

/** Rows one importCsv, deleteMany or restore takes. The server refuses more. */
export const MAX_CHUNK_ROWS = 500;
/** Serialized bytes per chunk, well under Next's 1 MB body cap. */
export const MAX_CHUNK_BYTES = 600_000;

const encoder = new TextEncoder();
export const jsonBytes = (value: unknown): number => encoder.encode(JSON.stringify(value)).length;

/** Consecutive chunks of at most MAX_CHUNK_ROWS items and MAX_CHUNK_BYTES by `sizeOf`, in order. */
export function chunkBySize<T>(items: ReadonlyArray<T>, sizeOf: (item: T) => number = jsonBytes): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = sizeOf(item);
    if (current.length === MAX_CHUNK_ROWS || (current.length > 0 && bytes + size > MAX_CHUNK_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Sends the chunks in order and stops at the first one the server refuses. Returns how many items went through. */
export async function sendInChunks<T>(
  chunks: ReadonlyArray<ReadonlyArray<T>>,
  send: (chunk: ReadonlyArray<T>, last: boolean) => Promise<boolean>,
  onProgress: (done: number) => void,
): Promise<number> {
  let done = 0;
  for (const [i, chunk] of chunks.entries()) {
    if (!(await send(chunk, i === chunks.length - 1))) break;
    done += chunk.length;
    onProgress(done);
  }
  return done;
}
