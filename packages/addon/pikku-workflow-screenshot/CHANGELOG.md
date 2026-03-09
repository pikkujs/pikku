## 0.12.1

### New Features

- Initial release of `@pikku/addon-workflow-screenshot`
- `renderWorkflowImage` function renders workflow diagrams as PNG/JPEG images using Playwright and the Pikku Console's React Flow renderer
- `ScreenshotService` manages headless Chromium lifecycle, temporary static server, and screenshot capture
- Automatically locates the console dist via `@pikku/cli` or accepts a custom path via `CONSOLE_DIST_PATH` variable
- Clear error messages when Chromium is not installed
