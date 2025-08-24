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

Pikku uses [Yarn](https://yarnpkg.com/) as its package manager for this monorepo workspace.

### Prerequisites

- Node.js 18+
- Yarn (latest version recommended)
- Git

### Getting Started

1. **Fork and Clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/pikku.git
   cd pikku
   ```

2. **Install Dependencies**

   ```bash
   yarn install
   ```

3. **Build the Project**

   ```bash
   yarn build
   ```

4. **Run Tests**

   ```bash
   yarn test
   ```

5. **Type Check**
   ```bash
   yarn tsc
   ```

## Pull Request Guidelines

Before submitting a PR, please ensure:

- [ ] Your code passes all tests: `yarn test`
- [ ] TypeScript compilation succeeds: `yarn tsc`
- [ ] Code follows the project's linting rules: `yarn lint`
- [ ] You've added tests for new functionality
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

To run tests for a specific package:

```bash
cd packages/core
yarn test
```

To build a specific package:

```bash
cd packages/cli
yarn build
```

## Testing Guidelines

- Write unit tests for new functionality
- Use Node.js built-in test runner with `tsx`
- Test files should be named `*.test.ts`
- Ensure tests cover both success and error cases
- Mock external dependencies appropriately

### Running Tests

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn test:coverage

# Run specific test file
npx tsx --test packages/core/src/path/to/file.test.ts
```

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
