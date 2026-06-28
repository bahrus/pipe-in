## Requirements

### Requirement 1: Fetch Cache Policy Attribute

**User Story:** As a developer, I want to control the browser HTTP cache behavior for pipe-in fetches, so that I can optimize network usage or force fresh content when needed.

#### Acceptance Criteria

1. THE Pipe_In SHALL support a `${base}-cache` attribute that accepts a Fetch_Cache_Policy value.
2. WHEN the `${base}-cache` attribute is not present, THE Pipe_In SHALL use `'default'` as the Fetch_Cache_Policy.
3. WHEN the `${base}-cache` attribute is present, THE Pipe_In SHALL pass the attribute value as the `cache` option to the Fetch API request.
4. THE Pipe_In SHALL accept the following Fetch_Cache_Policy values as case-sensitive matches: `default`, `no-store`, `reload`, `no-cache`, `force-cache`, `only-if-cached`.
5. IF the `${base}-cache` attribute value does not exactly match one of the accepted Fetch_Cache_Policy values, THEN THE Pipe_In SHALL log a warning to the console and use `'default'` as the cache option for the fetch request.