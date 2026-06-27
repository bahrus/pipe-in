// @ts-check

/**
 * Creates a TransformStream that extracts content between optional start and end markers.
 * If only start is provided, emits everything from the start marker onward.
 * If only end is provided, emits everything up to (but not including) the end marker.
 * If both are provided, emits only the content between them.
 * The start marker itself is included in the output (from the start marker onward).
 * The end marker itself is not included in the output.
 * @param {string} [start] - Marker string to begin snipping from (inclusive)
 * @param {string} [end] - Marker string to stop snipping at (exclusive)
 * @returns {TransformStream<string, string>}
 */
export function snipTransform(start, end) {
    let buffer = '';
    let started = !start; // If no start marker, we're already "started"
    let ended = false;

    return new TransformStream({
        transform(chunk, controller) {
            if (ended) return;
            buffer += chunk;

            if (!started) {
                const idx = buffer.indexOf(/** @type {string} */ (start));
                if (idx === -1) {
                    // Keep only enough buffer to catch a split marker
                    const keep = /** @type {string} */ (start).length - 1;
                    buffer = buffer.slice(-keep);
                    return;
                }
                // Found start marker — discard everything before it
                buffer = buffer.slice(idx);
                started = true;
            }

            if (end) {
                const idx = buffer.indexOf(end);
                if (idx !== -1) {
                    // Found end marker — emit up to it and stop
                    const output = buffer.slice(0, idx);
                    if (output) controller.enqueue(output);
                    ended = true;
                    buffer = '';
                    return;
                }
                // Haven't found end yet — emit all but enough to catch a split marker
                const keep = end.length - 1;
                const safe = buffer.slice(0, -keep || undefined);
                buffer = buffer.slice(-keep);
                if (safe) controller.enqueue(safe);
            } else {
                // No end marker — emit everything
                if (buffer) controller.enqueue(buffer);
                buffer = '';
            }
        },
        flush(controller) {
            if (!ended && started && buffer) {
                controller.enqueue(buffer);
            }
        }
    });
}
