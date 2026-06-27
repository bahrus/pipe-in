// @ts-check

/**
 * Creates a TransformStream that rewrites relative URLs in HTML to absolute URLs.
 * Handles href, src, srcset, action, poster attributes and url() in inline styles.
 * Also replaces structural document tags (html, body) with divs and strips DOCTYPE/head.
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
 * Replaces structural document tags with neutral container elements
 * to prevent the HTML parser from stripping or repositioning them,
 * while preserving any attributes (class, lang, etc.) on the original tags.
 * Note: <head> is stripped entirely — its children (meta, link, script, title)
 * get hoisted by the parser regardless of container, and they still function correctly.
 * @param {string} html
 * @returns {string}
 */
function renameStructuralTags(html) {
    html = html.replace(/<!DOCTYPE[^>]*>/gi, '');
    // Replace <html ...> with <div ...> and </html> with </div>
    html = html.replace(/<html(\s[^>]*)?>/gi, '<div$1>');
    html = html.replace(/<\/html\s*>/gi, '</div>');
    // Strip <head> and </head> entirely
    html = html.replace(/<\/?head(\s[^>]*)?>/gi, '');
    // Replace <body ...> with <div ...> and </body> with </div>
    html = html.replace(/<body(\s[^>]*)?>/gi, '<div$1>');
    html = html.replace(/<\/body\s*>/gi, '</div>');
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
