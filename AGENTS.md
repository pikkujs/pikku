# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pikku is a TypeScript-powered framework that normalizes all the different ways you can interact with Node.js servers. It provides a unified approach to handling HTTP requests, WebSocket connections, scheduled tasks, and channels across different runtime environments (Express, Fastify, Next.js, AWS Lambda, Cloudflare Workers, etc.).

## Fabric Console — Build vs Platform Mode

The Fabric Console (`/git/pikku/fabric`) has a top-level mode toggle in the header (top-right area of the screen). The two modes are:

- **`build`** — minimal, beginner-friendly UI (Lovable-style). Focused on development via sandboxes. Default mode.
- **`platform`** — full-featured UI (Vercel-style). Exposes all platform functionality including stages, branches, deployments, and advanced settings.

### Key implementation details

| Aspect | Detail |
|--------|--------|
| Type | `ConsoleMode = 'build' \| 'platform'` |
| Storage | `localStorage` key `'console-mode'`, default `'build'` |
| Context | `ConsoleModeProvider` in `apps/console/src/contexts/ConsoleModeProvider.tsx` |
| Hook | `useConsoleMode()` — returns `{ mode, setMode }` |
| Toggle UI | `ConsoleHeader` component (`apps/console/src/components/ConsoleHeader.tsx`), `div.modeSwitch` in the header |
| Mode switch handler | `handleModeSelect(nextMode)` — also navigates to the builder sandbox when switching to `build` |

The mode is **not part of the URL** — the same routes render differently depending on `mode`. Components read `useConsoleMode()` and conditionally show/hide sections. The `ProjectSidebar` is one example: it shows different nav items depending on whether the user is in `build` or `platform` mode.

## Architecture

### Core Components

- **@pikku/core**: The main framework containing HTTP handlers, channel handlers, schedulers, services, and middleware
- **@pikku/cli**: Code generation tool that creates type-safe clients and server wrappers from your function definitions
- **@pikku/client-fetch**: Type-safe HTTP client generated from your API definitions
- **@pikku/client-websocket**: Type-safe WebSocket client for real-time communication
- **Runtime packages**: Adapters for different environments (Express, Fastify, Next.js, AWS Lambda, etc.)

### Project Structure

This repository contains multiple sub-projects:

- `pikku/`: Main monorepo with all Pikku packages
- `nextjs-app-starter/`: Example Next.js integration
- `workspace-starter/`: Full-featured example with multiple backend and frontend apps
- `website/`: Documentation site (Docusaurus)
- `presentation/`: Reveal.js presentation

### Key Concepts

- **pikkuFunc**: Core abstraction that handles data from params, query, or body without needing to know the source
- **Services**: Initialized at server startup and available to all functions (JWT, logger, schema validation, etc.)
- **Channels**: WebSocket-like real-time communication with pub/sub capabilities
- **Schedulers**: Cron-like scheduled task execution
- **Type Generation**: Automatic generation of type-safe clients from server definitions

## Development Commands

Always use `yarn` for all commands in this monorepo. Do not use npm or bun.

### Main Pikku Framework (pikku/)

```bash
# Install dependencies
yarn

# Type checking
yarn tsc

# Build all packages
yarn build

# Run tests
yarn test

# Run tests with coverage
yarn test:coverage

# Lint code
yarn lint

# Format code
yarn prettier

# Generate documentation
yarn typedoc

# Create changeset (for PRs)
yarn changeset

# Publish release
yarn release
```

### Individual Package Testing

Each package has its own test runner:

```bash
# Run tests for a specific package
./run-tests.sh

# Run tests in watch mode
./run-tests.sh --watch

# Run tests with coverage
./run-tests.sh --coverage
```

### Next.js App Starter

```bash
# Install dependencies
npm install

# Prepare build (generates Pikku types)
npm run prebuild

# Start development server
npm run start
```

### Workspace Starter

```bash
# Install dependencies
yarn install

# Generate types and setup
yarn prebuild

# Start specific backend (Express example)
cd backends/express && yarn start

# Start Next.js app
cd apps/next-app && yarn dev
```

## Configuration

### pikku.config.json

This is the main configuration file for Pikku projects:

- `srcDirectories`: Where to find your function definitions
- `outDir`: Where to generate output files
- `packageMappings`: Map local packages to published package names
- `openAPI`: OpenAPI specification generation settings

Example structure:

```json
{
  "tsconfig": "./tsconfig.json",
  "srcDirectories": ["src"],
  "outDir": ".pikku",
  "fetchFile": "pikku-fetch.gen.ts",
  "websocketFile": "pikku-websocket.gen.ts"
}
```

## Code Generation

Pikku uses a CLI tool to generate type-safe clients and server code:

- Run `npx pikku prebuild` or `yarn prebuild` to generate types
- Generated files include HTTP clients, WebSocket clients, and type definitions
- Always run prebuild after modifying function definitions

## Testing

- Uses Node.js built-in test runner with tsx for TypeScript support
- Test files follow `*.test.ts` pattern
- Each package has isolated tests
- Coverage reports generated with `--experimental-test-coverage`
- For any change, branch, or PR to be accepted, it must include verifier coverage that follows a TDD/BDD flow: the verifier test must fail before the code change and pass after the code change.

### Testing Templates

**IMPORTANT**: When testing workflow templates (or any templates), you MUST create a proper test app from the template - DO NOT test directly in the `templates/` directory!

To test a template properly:

```bash
# Navigate to create package
cd packages/create

# Create test app from template
node ./dist/index.js --template workflows-pg --version workflow-retries --name ../../../test-app --install --package-manager yarn --yarn-link ../pikku

# Navigate to test app
cd ../test-app

# Link packages and install dependencies
yarn link -A ../pikku && yarn install

# Build and run tests
yarn run tsc && yarn run test
```

This ensures:

- All code generation runs properly (including workflow workers, queue processors, etc.)
- The app is structured exactly as end users would see it
- All dependencies are correctly linked and installed
- Tests run in the correct environment

## Workspace Structure

This is a Yarn workspace monorepo with:

- `packages/`: Core Pikku packages
- `templates/`: Example templates for different runtimes
- Strict TypeScript configuration with comprehensive type checking
- Husky pre-commit hooks for code quality

## Code Style Guidelines

### Comments

**DO NOT add new inline comments** when writing or modifying code. The code should be self-documenting through:

- Clear, descriptive variable and function names
- Well-structured TypeScript types and interfaces
- Proper function and class organization

**DO NOT remove existing comments or JSDoc blocks.** When refactoring or modifying code, preserve all existing comments and JSDoc. If a comment references something that changed (e.g., a renamed parameter), update the comment to match — do not delete it.

Only add new comments when absolutely necessary to explain:

- Complex algorithms or business logic that cannot be made clearer through refactoring
- Why a particular approach was chosen (when it's not obvious)
- Workarounds for known issues or limitations

Avoid comments that simply restate what the code does. Instead, focus on making the code itself more readable.

### Function Type Signatures

Pikku function wrappers (`pikkuFunc`, `pikkuSessionlessFunc`, `pikkuWorkflowFunc`, `pikkuWorkflowComplexFunc`) support **either** generics **or** `input`/`output` schema properties — never both. When using `input` and `output` schemas (e.g. Zod), do NOT pass type generics. When using generics, do NOT pass `input`/`output`. Mixing them causes type conflicts and `as any` casts.

```typescript
// Correct — schema-based (no generics)
export const myFunc = pikkuFunc({
  input: MyInput,
  output: MyOutput,
  func: async (services, data) => { ... }
})

// Correct — generic-based (no input/output)
export const myFunc = pikkuFunc<MyIn, MyOut>({
  func: async (services, data) => { ... }
})

// WRONG — do not mix
export const myFunc = pikkuFunc<MyIn, MyOut>({
  input: MyInput as any,  // ← never do this
  output: MyOutput as any,
  func: async (services, data) => { ... }
})
```

### Environment Variables

**DO NOT use `process.env` inside pikku functions.** Use the `variables` service instead (`services.variables.get('VAR_NAME')`). `process.env` access belongs in server bootstrap code (e.g. `start.ts`, `server.ts`), not in business logic functions.

### React Components

**One JSX-returning component per `.tsx` file.** When a file would contain a second component, extract it to its own file. This is annoying up front but keeps components discoverable and reusable instead of buried as private helpers inside a page. Non-component exports — `type`/`interface` (e.g. `Props`), hooks, constants, and a Provider's own `createContext` — may stay co-located with the single component they belong to.

**Type components with `React.FC`, never `React.FunctionComponent` or an untyped `function`.** Use the `const` arrow form:

```tsx
type StatusPillProps = { status: DiffEntry['status'] }

const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  return <span>{status}</span>
}
```

Props with more than one or two fields get a named `Props` type rather than an inline object type.
