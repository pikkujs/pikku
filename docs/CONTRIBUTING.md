# Contributing to Pikku

Thank you for your interest in contributing to Pikku! We welcome contributions from the community and appreciate your help in making Pikku better.

## Ways to Contribute

You can contribute to Pikku in several ways:

- **Create an Issue** - Report bugs, propose new features, or suggest improvements
- **Submit Pull Requests** - Fix bugs, add features, improve documentation, or refactor code
- **Create Runtime Adapters** - Build adapters for new runtime environments
- **Write Documentation** - Help improve our docs, examples, and tutorials
- **Share Your Experience** - Write blog posts, create tutorials, or share on social media
- **Build Applications** - Create real-world applications using Pikku and share your experience

## Project Philosophy

Pikku aims to normalize the different ways you interact with Node.js servers by providing a unified TypeScript framework that works across multiple runtime environments. We strive for:

- **Type Safety** - Full TypeScript support with generated type-safe clients
- **Runtime Agnostic** - Works with Express, Fastify, Next.js, AWS Lambda, Cloudflare Workers, and more
- **Developer Experience** - Intuitive APIs with excellent tooling support
- **Performance** - Optimized for both development and production use

## Development Setup

Pikku is a [bun](https://bun.sh/) workspace monorepo. `AGENTS.md` at the repository root is the most detailed guide to the repository's commands and conventions.

### Prerequisites

- Node.js 24 or later (`.node-version` pins 24)
- bun 1.4 (the root `package.json` pins `packageManager: bun@1.4.0`)
- Git

### Getting Started

1. **Fork and Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/pikku.git
   cd pikku
   ```

2. **Install Dependencies**

   ```bash
   bun install
   ```

3. **Build the Packages**

   ```bash
   bun run build:packages   # the packages only
   bun run build            # packages, addons, generated code and templates
   ```

4. **Run Tests**

   ```bash
   bun run test
   ```

5. **Type Check**

   ```bash
   bun run tsc
   ```

The Husky pre-commit hook runs `bun install` and checks that `bun.lock` did not change, then runs lint-staged, `changeset status` and the licence check. `changeset status` fails when your branch changes a publishable package without a changeset (see [Changesets](#changesets)).

## Contributor License Agreement

By submitting a pull request, you agree to the terms of our [Contributor License Agreement](../CLA.md). This allows the project to accept your contributions while maintaining licensing flexibility.

## Pull Request Guidelines

Before submitting a PR, please ensure:

- [ ] Your code passes all tests: `bun run test`
- [ ] TypeScript compilation succeeds: `bun run tsc`
- [ ] Code follows the project's linting and formatting rules: `bun run lint` and `bun run prettier`
- [ ] You've added tests for new functionality
- [ ] You've added a changeset for every publishable package you changed
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventional commit format

## Code Organization

Pikku is organized as a monorepo with multiple packages:

- **`@pikku/core`** - Main framework with HTTP handlers, channels, schedulers
- **`@pikku/cli`** - Code generation tool for type-safe clients
- **`@pikku/client-fetch`** - Generated HTTP client
- **`@pikku/client-websocket`** - Generated WebSocket client
- **Runtime packages** - Adapters for Express, Fastify, Next.js, AWS Lambda, etc.

### Working with Packages

Each package has its own test runner, `run-tests.sh`, which runs its `*.test.ts` files with `bun test`:

```bash
cd packages/core
bun run test            # or: ./run-tests.sh --watch / --coverage
```

To build a specific package:

```bash
bun run --filter '@pikku/core' build
```

## Testing Guidelines

- Write unit tests for new functionality
- Tests run on bun's test runner (`bun test`), through each package's `run-tests.sh`. A few packages (`@pikku/ws`, `@pikku/uws` and `@pikku/kysely`) stay on Node's runner, and their `run-tests.sh` says why
- Test files should be named `*.test.ts`
- Ensure tests cover both success and error cases
- Mock external dependencies appropriately

### Running Tests

```bash
# Run all tests
bun run test

# Run tests with coverage
bun run test:coverage

# Run one test file
bun test packages/core/src/path/to/file.test.ts
```

## Changesets

Every PR that changes a publishable package needs a changeset:

```bash
bun run changeset
```

Changesets are always `patch`, and CI rejects any other bump. The package names must match the `name` in each package's own `package.json`.

The one exception is a planned minor release. A maintainer adds a `.changeset/release-<version>.json` marker listing the packages that move, for example `{ "version": "0.13.0", "minor": ["@pikku/core", …] }`. While it exists, CI accepts `minor` for those packages, and only when the bump lands exactly on that version. `major` is never accepted. The release's version step deletes the marker, so the exception ends with the release that needed it.

## Runtime Adapters

Pikku supports multiple runtime environments. When creating new runtime adapters:

1. Follow the existing adapter patterns
2. Implement the required interface for your runtime
3. Add comprehensive tests
4. Document any runtime-specific limitations
5. Update the README with supported runtimes

## Documentation

- Update relevant documentation when adding features
- Include code examples in your contributions
- Follow existing documentation patterns
- Test documentation examples to ensure they work

## Getting Help

- Create an issue for bugs or feature requests
- Join discussions in existing issues
- Check the existing documentation and examples
- Look at the test files for usage patterns
