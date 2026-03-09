## 0.12.1

## 0.12.2

### Patch Changes

- e9672a0: Add `@pikku/addon-workflow-screenshot` addon — renders workflow diagrams as images using Playwright and the Pikku Console's React Flow renderer. Add `/render/workflow` route to the console for headless screenshot capture. Increase node label spacing in FlowNode.
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

### New Features

- Initial release of `@pikku/addon-workflow-screenshot`
- `renderWorkflowImage` function renders workflow diagrams as PNG/JPEG images using Playwright and the Pikku Console's React Flow renderer
- `ScreenshotService` manages headless Chromium lifecycle, temporary static server, and screenshot capture
- Automatically locates the console dist via `@pikku/cli` or accepts a custom path via `CONSOLE_DIST_PATH` variable
- Clear error messages when Chromium is not installed
