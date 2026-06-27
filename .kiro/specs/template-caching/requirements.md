# Requirements Document

## Introduction

This feature adds two caching capabilities to the pipe-in web component:

1. **Fetch caching** — Explicit use of the Fetch API's `cache` option so that pipe-in instances targeting the same URL leverage the browser's built-in HTTP cache with a configurable policy.

2. **Template memoization** — A coordination mechanism where multiple pipe-in instances sharing the same URL are deduplicated: only one network request is performed, the response text is accumulated into an HTML `<template>` element, and all other instances clone that template's content instead of streaming independently. This eliminates both duplicate network requests and duplicate HTML parsing work.

## Glossary

- **Pipe_In**: The attribute-based web component enhancement that streams HTML content from a URL into a host element.
- **Enhanced_Element**: The DOM element that has the pipe-in attribute and receives the fetched content.
- **Template_Cache**: A module-level `Map<string, Promise<HTMLTemplateElement>>` that stores pending or resolved template elements keyed by resolved URL.
- **Fetch_Cache_Policy**: A string value corresponding to the Fetch API's `RequestCache` type, controlling how the browser HTTP cache is used for a given request.
- **Template_Memoization**: The process by which a single fetch result is accumulated into a `<template>` element and shared across all pipe-in instances targeting the same URL.
- **Resolved_URL**: The final absolute URL after bare-specifier resolution via import maps.
- **Base_Prefix**: The configurable attribute prefix used for pipe-in attributes (e.g., `pipe-in` or `⇥`).

## Requirements

### Requirement 1: Fetch Cache Policy Attribute

**User Story:** As a developer, I want to control the browser HTTP cache behavior for pipe-in fetches, so that I can optimize network usage or force fresh content when needed.

#### Acceptance Criteria

1. THE Pipe_In SHALL support a `${base}-cache` attribute that accepts a Fetch_Cache_Policy value.
2. WHEN the `${base}-cache` attribute is not present, THE Pipe_In SHALL use `'default'` as the Fetch_Cache_Policy.
3. WHEN the `${base}-cache` attribute is present, THE Pipe_In SHALL pass the attribute value as the `cache` option to the Fetch API request.
4. THE Pipe_In SHALL accept the following Fetch_Cache_Policy values as case-sensitive matches: `default`, `no-store`, `reload`, `no-cache`, `force-cache`, `only-if-cached`.
5. IF the `${base}-cache` attribute value does not exactly match one of the accepted Fetch_Cache_Policy values, THEN THE Pipe_In SHALL log a warning to the console and use `'default'` as the cache option for the fetch request.

### Requirement 2: Template Memoization Attribute

**User Story:** As a developer, I want multiple pipe-in instances pointing to the same URL to share a single fetch and parsed template, so that I can reduce network requests and parsing overhead.

#### Acceptance Criteria

1. THE Pipe_In SHALL support a `${base}-memoize` boolean attribute that enables Template_Memoization for that instance.
2. WHEN `${base}-memoize` is present on an Enhanced_Element, THE Pipe_In SHALL use the Resolved_URL as the key for Template_Cache lookup before initiating any fetch.
3. WHEN a Template_Cache entry does not exist for the Resolved_URL, THE Pipe_In SHALL immediately store a new pending Promise in the Template_Cache for that key, then perform the fetch, accumulate the decoded text through TextDecoderStream, store the resulting HTML string in a `<template>` element, and resolve the Promise with that element.
4. WHEN a Template_Cache entry already exists for the Resolved_URL, THE Pipe_In SHALL await the existing entry's Promise and clone the resolved template content instead of performing a separate fetch.
5. WHEN Template_Memoization is active and the template content is available, THE Pipe_In SHALL clone the template content using `document.importNode(template.content, true)` and append the clone to the target element.
6. WHEN a memoized fetch is initiated, THE Pipe_In SHALL set the `${base}-state` attribute to `loading` on the Enhanced_Element; WHEN the cloned content is appended, THE Pipe_In SHALL set the `${base}-state` attribute to `complete` (skipping the `streaming` state).
7. WHEN a waiting instance receives cloned content from a resolved Template_Cache entry, THE Pipe_In SHALL transition the `${base}-state` attribute directly from `loading` to `complete`.
8. THE Pipe_In SHALL maintain the Template_Cache for the lifetime of the module (i.e., until the page is unloaded or the module is garbage-collected), and SHALL NOT automatically invalidate entries based on time.

### Requirement 3: Template Memoization with Snipping

**User Story:** As a developer, I want template memoization to work correctly with the start/end snipping attributes, so that shared templates contain only the desired content slice.

#### Acceptance Criteria

1. WHEN `${base}-memoize` is active alongside `${base}-start` or `${base}-end`, THE Pipe_In SHALL apply the snipTransform to the decoded text stream before storing the accumulated result in the Template_Cache, so that the cached template contains only the snipped portion.
2. THE Pipe_In SHALL construct the Template_Cache key by combining the Resolved_URL, the start marker value (or empty string if `${base}-start` is absent), and the end marker value (or empty string if `${base}-end` is absent), so that a memoized instance without snipping attributes produces a distinct key from one with snipping attributes targeting the same URL.
3. WHEN a Template_Cache entry exists whose key matches the Resolved_URL and snip marker values, THE Pipe_In SHALL clone the already-snipped template content without applying snipping again.
4. IF `${base}-memoize` is active with `${base}-start` and the start marker is not found in the fetched content, THEN THE Pipe_In SHALL store an empty template in the Template_Cache and log a warning indicating the start marker was not found.

### Requirement 4: Template Memoization with URL Rewriting

**User Story:** As a developer, I want template memoization to work correctly with URL rewriting, so that cached templates contain properly resolved URLs.

#### Acceptance Criteria

1. WHEN `${base}-memoize` is active alongside `${base}-base`, THE Pipe_In SHALL apply URL rewriting to the accumulated text stream before storing the result in the Template_Cache, using the directory path of the Resolved_URL as the base for rewriting relative URLs.
2. THE Pipe_In SHALL include a flag indicating the presence of `${base}-base` in the Template_Cache key so that a request with `${base}-base` and an identical request without `${base}-base` produce separate cache entries for the same Resolved_URL.
3. WHEN both `${base}-base` and `${base}-start` or `${base}-end` are active alongside `${base}-memoize`, THE Pipe_In SHALL apply snipping before URL rewriting, and the cache key SHALL incorporate the Resolved_URL, the start marker, the end marker, and the `${base}-base` presence flag.

### Requirement 5: Template Memoization Applies Fetch Cache Policy

**User Story:** As a developer, I want the template memoization fetch to respect the cache policy attribute, so that browser caching and template memoization compose cleanly.

#### Acceptance Criteria

1. WHEN both `${base}-memoize` and `${base}-cache` are present, THE Pipe_In SHALL use the specified Fetch_Cache_Policy as the `cache` option for the single coordinated fetch and SHALL NOT include the Fetch_Cache_Policy value in the Template_Cache key.
2. WHEN `${base}-memoize` is present without `${base}-cache`, THE Pipe_In SHALL use `'default'` as the Fetch_Cache_Policy for the coordinated fetch.
3. WHEN multiple Enhanced_Elements share the same Template_Cache key but specify different `${base}-cache` values, THE Pipe_In SHALL use the Fetch_Cache_Policy from the first instance that initiates the coordinated fetch, and subsequent instances SHALL use the already-cached template without performing an additional fetch.

### Requirement 6: Template Memoization Error Handling

**User Story:** As a developer, I want clear feedback when a memoized fetch fails, so that all waiting instances are properly notified.

#### Acceptance Criteria

1. IF the coordinated fetch for a memoized URL fails due to a network error or a non-ok HTTP response status (4xx, 5xx), THEN THE Pipe_In SHALL reject the Template_Cache entry promise with the error.
2. IF a Template_Cache entry is rejected, THEN THE Pipe_In SHALL remove the entry from the Template_Cache before notifying waiting instances, so that subsequent requests can retry with a fresh fetch.
3. IF a Template_Cache entry is rejected, THEN THE Pipe_In SHALL log the error including the Resolved_URL to the console and set the `resolved` property to `false` on all waiting instances.
4. IF a Template_Cache entry is rejected, THEN THE Pipe_In SHALL set the `${base}-state` attribute to `error` and remove `aria-busy` on each waiting Enhanced_Element.

### Requirement 7: Template Memoization Content Insertion

**User Story:** As a developer, I want memoized content to be inserted using the same target rules as streaming (shadow DOM support), so that memoization is a transparent optimization.

#### Acceptance Criteria

1. WHEN `${base}-memoize` and `${base}-shadowrootmode` are both present, THE Pipe_In SHALL call `attachShadow` with the `${base}-shadowrootmode` attribute value as the `mode` option, and insert the cloned template content into the resulting shadow root.
2. WHEN `${base}-memoize` and `${base}-shadowrootmode` and `${base}-base` are all present, THE Pipe_In SHALL create a `<div part="content">` element inside the shadow root and insert the cloned template content into that wrapper element.
3. WHEN `${base}-memoize` is present without `${base}-shadowrootmode`, THE Pipe_In SHALL insert the cloned template content directly into the Enhanced_Element.
4. WHEN `${base}-memoize` is present and `${base}-method` specifies an insertion position, THE Pipe_In SHALL apply the equivalent DOM insertion operation for cloned content: `streamHTML` clears existing children then appends, `streamReplaceWithHTML` replaces the target element, `streamPrependHTML` prepends before existing children, `streamAppendHTML` appends after existing children, `streamBeforeHTML` inserts before the target element, and `streamAfterHTML` inserts after the target element.
5. WHEN `${base}-memoize` is present without `${base}-method`, THE Pipe_In SHALL clear the target's existing children and append the cloned template content (equivalent to the default `streamHTML` behavior).

### Requirement 8: Security Constraints for Memoized Content

**User Story:** As a developer, I want memoized content to respect the same security rules as streamed content, so that the memoization feature cannot bypass the existing security model.

#### Acceptance Criteria

1. WHEN `${base}-memoize` is active and the instance specifies an unsafe method, script execution, or a sanitizer override, THE Pipe_In SHALL require the URL to be either a bare specifier (resolvable via import map) or a same-origin path before permitting template clone insertion.
2. IF `${base}-memoize` is active and the URL is neither a bare specifier nor a same-origin path, and the instance specifies an unsafe method, script execution, or a sanitizer override, THEN THE Pipe_In SHALL block insertion, log a warning, set the `${base}-state` attribute to `error`, and return `resolved` as `false`.
3. WHEN `${base}-memoize` is active with a cross-origin URL that passes the security gate (no unsafe method, no script execution, no sanitizer override), THE Pipe_In SHALL insert the cloned template content without executing scripts and without applying a custom sanitizer override.
4. THE Pipe_In SHALL evaluate the security gate at clone-insertion time for each memoized instance independently, so that a template cached by a trusted origin does not grant elevated privileges to an instance referencing a cross-origin URL.

