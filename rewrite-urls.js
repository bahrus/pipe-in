// @ts-check

/**
 * Creates a TransformStream that rewrites relative URLs in HTML to absolute URLs.
 * Handles href, src, srcset, action, poster attributes and url() in inline styles.
 * @param {string} baseHref - The base URL to resolve relative paths against
 * @returns {TransformStream<string, string>}
 */
export function rewriteUrlsTransform(baseHref) {
    let buffer = '';
    return new TransformStream({
        transform(chunk, controller) {
            buffer += chunk;
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
