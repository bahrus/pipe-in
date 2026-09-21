// @ts-check

/**
 * Creates a TransformStream that extracts content between optional start and end markers.
 * If only start is provided, emits everything from the start marker onward.
 * If only end is provided, emits everything up to the end marker.
 * If both are provided, emits only the content between them.
 *
 * Both markers are **inclusive by default** — the start marker's own text
 * stays at the front of the output, and the end marker's own text stays at
 * the back. Pass `startExclusive`/`endExclusive` to drop a marker's own text
 * from the output instead (Chats/TODO/SnipEndInclusiveOption.md — `end` used
 * to be exclusive-only; changed with no compatibility shim since pipe-in has
 * zero published dependents).
 *
 * @param {string} [start] - Marker string to begin snipping from.
 * @param {string} [end] - Marker string to stop snipping at.
 * @param {{startExclusive?: boolean, endExclusive?: boolean}} [opts]
 * @returns {TransformStream<string, string>}
 */
export function snipTransform(start, end, opts = {}) {
    const { startExclusive = false, endExclusive = false } = opts;
    let buffer = '';
    let started = !start; // If no start marker, we're already "started"
    let ended = false;

    return new TransformStream({
        transform(chunk, controller) {
            if (ended) return;
            buffer += chunk;

            if (!started) {
                const startStr = /** @type {string} */ (start);
                const idx = buffer.indexOf(startStr);
                if (idx === -1) {
                    // Keep only enough buffer to catch a split marker
                    const keep = startStr.length - 1;
                    buffer = buffer.slice(-keep);
                    return;
                }
                // Found start marker — discard everything before it, and the
                // marker's own text too when startExclusive is set.
                buffer = buffer.slice(startExclusive ? idx + startStr.length : idx);
                started = true;
            }

            if (end) {
                const idx = buffer.indexOf(end);
                if (idx !== -1) {
                    // Found end marker — emit up to it (plus the marker's own
                    // text, unless endExclusive) and stop.
                    const cut = endExclusive ? idx : idx + end.length;
                    const output = buffer.slice(0, cut);
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
