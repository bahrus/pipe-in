### Requirement 9: Piping State Indication and Events

**User Story:** As a developer, I want the enhanced element to expose its piping state via standard attributes and events, so that I can style loading, streaming, and completion states with CSS, provide accessible feedback, and react programmatically to completion.

#### Acceptance Criteria

1. WHEN a fetch is initiated, THE Pipe_In SHALL set `aria-busy="true"` on the Enhanced_Element.
2. WHEN piping completes successfully, THE Pipe_In SHALL remove the `aria-busy` attribute from the Enhanced_Element.
3. IF the fetch or streaming fails, THEN THE Pipe_In SHALL remove the `aria-busy` attribute from the Enhanced_Element.
4. WHEN a fetch is initiated, THE Pipe_In SHALL set a `${base}-state` attribute on the Enhanced_Element with the value `loading`.
5. WHEN the response body stream emits its first chunk, THE Pipe_In SHALL update the `${base}-state` attribute to `streaming` and SHALL keep `aria-busy="true"` on the Enhanced_Element.
6. WHEN piping completes successfully, THE Pipe_In SHALL update the `${base}-state` attribute to `complete`.
7. IF the fetch or streaming fails, THEN THE Pipe_In SHALL update the `${base}-state` attribute to `error`.
8. WHILE no fetch has been initiated for the Enhanced_Element, THE Pipe_In SHALL NOT set the `aria-busy` attribute or the `${base}-state` attribute on the Enhanced_Element.
9. WHEN piping completes successfully and content is in the DOM, THE Pipe_In SHALL dispatch a non-bubbling `load` event on the Enhanced_Element using `new Event('load')`.
10. IF the fetch or streaming fails, THEN THE Pipe_In SHALL dispatch a non-bubbling `error` event on the Enhanced_Element using `new Event('error')`.
