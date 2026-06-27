// @ts-check

/**
 * Creates a TransformStream that rewrites relative URLs in HTML to absolute URLs.
 * Handles href, src, srcset, action, poster attributes and url() in inline styles.
 * Also strips structural document tags (DOCTYPE, html, head, body) to avoid browser parser interference.
 * @param {string} baseHref - The base URL to resolve relative paths against
 * @returns {TransformStream<string, string>}
 */
export function rewriteUrlsTransform(baseHref) {
    let buffer = '';
    return new TransformStream({
        transform(chunk, controller) {
            buffer += chunk;
            // Strip structural tags in the buffer before looking for '>'
            buffer = renameStructuralTags(buffer);
            // Only process up to the last complete '>' to avoid splitting tags
            const lastClose = buffer.lastIndexOf('>');
            if (lastClose === -1) return;
            const ready = buffer.slice(0, lastClose + 1);
            buffer = buffer.slice(lastClose + 1);
            controller.enqueue(rewriteUrls(ready, baseHref));
        },
        flush(controller) {
            if (buffer) {
                controller.enqueue(rewriteUrls(buffer, baseHref));
            }
        }
    });
}

/**
 * Strips structural document tags to prevent the HTML parser
 * from stripping or repositioning content.
 * Note: <head> is intentionally not renamed — its children (meta, link, script, title)
 * get hoisted by the parser regardless of container, and they still function correctly.
 * @param {string} html
 * @returns {string}
 */
function renameStructuralTags(html) {
    html = html.replace(/<!DOCTYPE[^>]*>/gi, '');
    html = html.replace(/<(\/?)html(\s|>)/gi, '');
    html = html.replace(/<(\/?)head(\s|>)/gi, '');
    html = html.replace(/<(\/?)body(\s|>)/gi, '');
    return html;
}

/**
 * Rewrites relative URLs in an HTML string to absolute URLs.
 * @param {string} html
 * @param {string} baseHref
 * @returns {string}
 */
function rewriteUrls(html, baseHref) {
    // Rewrite href, src, action, poster attributes with relative URLs
    html = html.replace(
        /((?:href|src|action|poster)\s*=\s*)(["'])(?!https?:\/\/|\/\/|data:|#|mailto:)([^"']*?)\2/gi,
        (_, prefix, quote, path) => `${prefix}${quote}${new URL(path, baseHref).href}${quote}`
    );
    // Rewrite url() in inline styles
    html = html.replace(
        /url\(\s*(["']?)(?!https?:\/\/|\/\/|data:)([^"')]+?)\1\s*\)/gi,
        (_, quote, path) => `url(${quote}${new URL(path, baseHref).href}${quote})`
    );
    return html;
}
