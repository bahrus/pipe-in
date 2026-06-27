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
4. THE Pipe_In SHALL accept the following Fetch_Cache_Policy values: `default`, `no-store`, `reload`, `no-cache`, `force-cache`, `only-if-cached`.
5. IF an invalid Fetch_Cache_Policy value is provided, THEN THE Pipe_In SHALL log a warning and fall back to `'default'`.

### Requirement 2: Template Memoization Attribute

**User Story:** As a developer, I want multiple pipe-in instances pointing to the same URL to share a single fetch and parsed template, so that I can reduce network requests and parsing overhead.

#### Acceptance Criteria

1. THE Pipe_In SHALL support a `${base}-memoize` boolean attribute that enables Template_Memoization for that instance.
2. WHEN `${base}-memoize` is present on an Enhanced_Element, THE Pipe_In SHALL use the Resolved_URL as the key for Template_Cache lookup.
3. WHEN a Template_Cache entry does not exist for the Resolved_URL, THE Pipe_In SHALL create a new entry by performing the fetch, accumulating the decoded text through TextDecoderStream, and storing the resulting HTML string in a `<template>` element.
4. WHEN a Template_Cache entry already exists for the Resolved_URL, THE Pipe_In SHALL wait for the existing entry to resolve and clone the template content instead of performing a separate fetch.
5. WHEN Template_Memoization is active and the fetch completes, THE Pipe_In SHALL clone the template content using `document.importNode(template.content, true)` and append the clone to the target element.

### Requirement 3: Template Memoization with Snipping

**User Story:** As a developer, I want template memoization to work correctly with the start/end snipping attributes, so that shared templates contain only the desired content slice.

#### Acceptance Criteria

1. WHEN `${base}-memoize` is active alongside `${base}-start` or `${base}-end`, THE Pipe_In SHALL apply snipping to the text stream before storing the result in the Template_Cache.
2. THE Pipe_In SHALL use a cache key that incorporates the Resolved_URL, the start marker, and the end marker so that different snip configurations produce distinct cached templates.

### Requirement 4: Template Memoization with URL Rewriting

**User Story:** As a developer, I want template memoization to work correctly with URL rewriting, so that cached templates contain properly resolved URLs.

#### Acceptance Criteria

1. WHEN `${base}-memoize` is active alongside `${base}-base`, THE Pipe_In SHALL apply URL rewriting to the text stream before storing the result in the Template_Cache.
2. THE Pipe_In SHALL include the presence of `${base}-base` in the cache key so that rewritten and non-rewritten variants are cached separately.

### Requirement 5: Template Memoization Applies Fetch Cache Policy

**User Story:** As a developer, I want the template memoization fetch to respect the cache policy attribute, so that browser caching and template memoization compose cleanly.

#### Acceptance Criteria

1. WHEN both `${base}-memoize` and `${base}-cache` are present, THE Pipe_In SHALL use the specified Fetch_Cache_Policy for the single coordinated fetch.
2. WHEN `${base}-memoize` is present without `${base}-cache`, THE Pipe_In SHALL use `'default'` as the Fetch_Cache_Policy for the coordinated fetch.

### Requirement 6: Template Memoization Error Handling

**User Story:** As a developer, I want clear feedback when a memoized fetch fails, so that all waiting instances are properly notified.

#### Acceptance Criteria

1. IF the coordinated fetch for a memoized URL fails, THEN THE Pipe_In SHALL reject the Template_Cache entry promise.
2. IF a Template_Cache entry is rejected, THEN THE Pipe_In SHALL remove the entry from the Template_Cache so that subsequent requests can retry.
3. IF a Template_Cache entry is rejected, THEN THE Pipe_In SHALL log an error and set the `resolved` property to `false` on all waiting instances.

### Requirement 7: Template Memoization Content Insertion

**User Story:** As a developer, I want memoized content to be inserted using the same target rules as streaming (shadow DOM support), so that memoization is a transparent optimization.

#### Acceptance Criteria

1. WHEN `${base}-memoize` and `${base}-shadowrootmode` are both present, THE Pipe_In SHALL attach a shadow root and insert the cloned template content into the shadow root.
2. WHEN `${base}-memoize` is present without `${base}-shadowrootmode`, THE Pipe_In SHALL insert the cloned template content directly into the Enhanced_Element.
3. THE Pipe_In SHALL use the same `${base}-method` logic for determining insertion position (replace, prepend, append, before, after) when inserting cloned template content from the cache.

### Requirement 8: Security Constraints for Memoized Content

**User Story:** As a developer, I want memoized content to respect the same security rules as streamed content, so that the memoization feature cannot bypass the existing security model.

#### Acceptance Criteria

1. WHEN `${base}-memoize` is active, THE Pipe_In SHALL enforce the same security gate for unsafe methods, script execution, and sanitizer overrides (requiring a bare specifier or same-origin URL).
2. WHEN `${base}-memoize` is active with a cross-origin URL, THE Pipe_In SHALL restrict insertion to the equivalent of the default sanitized behavior.
