// @ts-check

/**
 * @typedef {import('./pipe-in.js').InflightEntry} InflightEntry
 */

/**
 * Creates a ReadableStream that replays all chunks accumulated so far
 * from an in-flight shared stream, then subscribes to receive future chunks
 * in real-time until the source stream completes.
 * @param {InflightEntry} entry - The in-flight entry to catch up with
 * @returns {ReadableStream<string>}
 */
export function createCatchUpStream(entry) {
    return new ReadableStream({
        start(controller) {
            // Replay everything accumulated so far
            for (const chunk of entry.chunks) {
                controller.enqueue(chunk);
            }
            if (entry.done) {
                // Source already finished — just close
                controller.close();
            } else {
                // Subscribe to future chunks from the broadcaster
                entry.listeners.add(controller);
            }
        },
        cancel() {
            // Unsubscribe if the consumer cancels
            entry.listeners.delete(/** @type {any} */ (this).controller);
        }
    });
}
