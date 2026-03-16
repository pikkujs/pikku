## 0.12.0

## 0.12.9

### Patch Changes

- Updated dependencies [09491c6]
  - @pikku/core@0.12.8

## 0.12.8

### Patch Changes

- Updated dependencies [66519c9]
  - @pikku/core@0.12.7

## 0.12.7

### Patch Changes

- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6

## 0.12.6

### Patch Changes

- Updated dependencies [198e68f]
  - @pikku/core@0.12.5

## 0.12.5

### Patch Changes

- Updated dependencies [688b5e8]
  - @pikku/core@0.12.4

## 0.12.4

### Patch Changes

- Make console components reusable across different frameworks (Next.js, Vite, etc.)
- Add router abstraction layer (`ConsoleRouter` context) replacing direct `react-router-dom` imports across all 26 component files
- Export all components, providers, hooks, and pages from package entry point
- Add `reactRouterAdapter` for Vite/React Router consumers
- Make `Sidebar` configurable with `sections`, `branding`, and `footer` props (defaults to existing nav)
- Make `AppLayout` accept `sidebar` prop for customization
- Add `PikkuHTTPProvider` `serverUrl` prop to allow host apps to provide the backend URL
- Move `react-router-dom` to optional peer dependency
- Add `./styles` and `./adapters/react-router` package exports

## 0.12.3

### Patch Changes

- e9672a0: Add `@pikku/addon-workflow-screenshot` addon — renders workflow diagrams as images using Playwright and the Pikku Console's React Flow renderer. Add `/render/workflow` route to the console for headless screenshot capture. Increase node label spacing in FlowNode.
- 387b2ee: Add agent playground with model/temperature overrides, installed/community addon tabs, and workflow canvas improvements
- Updated dependencies [387b2ee]
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/assistant-ui@0.12.1
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [e04531f]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
  - @pikku/core@0.12.1
  - @pikku/websocket@0.12.1

### New Features

- Initial release of `@pikku/console` — visual explorer for Pikku project metadata
- Browse functions, workflows, agents, APIs, jobs, runtime services, and configuration
- Dark/light theme support
- Spotlight search across all resources
- Workflow and channel canvas visualizations
- Agent playground with streaming chat
- OAuth2 credential management UI
- Secrets and variables management
