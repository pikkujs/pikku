# Remote RPC Template (Redis)

This template demonstrates how to use `rpc.remote()` with the DeploymentService for service discovery using Redis.

## What it demonstrates

1. **DeploymentService** - Registers server endpoints and functions with Redis
2. **`rpc.remote()`** - Calls functions via HTTP using discovered endpoints
3. **Public RPC endpoint** - Auto-generated `/rpc/:functionName` route for exposed functions

## Flow

```
HTTP POST /remote-greet
    ↓
remoteGreet function
    ↓
rpc.remote('greet', data)
    ↓
DeploymentService.findFunction('greet')
    ↓
HTTP POST /rpc/greet (discovered endpoint)
    ↓
greet function (expose: true)
    ↓
Response
```

## Prerequisites

- Redis server running
- Redis URL configured via `REDIS_URL` environment variable

Default connection string:

```
redis://localhost:6379
```

## Setup

```bash
# Install dependencies
yarn install

# Generate pikku files
yarn pikku

# Build
yarn build
```

## Running

```bash
yarn start
```

## Testing

With the server running:

```bash
yarn test
```

## How it works

1. **Server startup** (`src/start.ts`):

   - Creates `RedisDeploymentService` connected to Redis
   - Starts Express server with Pikku wiring
   - Registers all functions with DeploymentService via `deploymentService.start()`

2. **Function with `expose: true`** (`src/functions/greet.ts`):

   - The `greet` function has `expose: true`, making it callable via `/rpc/greet`

3. **Calling via `rpc.remote()`**:
   - The `remoteGreet` function calls `rpc.remote('greet', data)`
   - `rpc.remote()` uses DeploymentService to find the endpoint
   - Makes HTTP POST to the discovered `/rpc/greet` endpoint

## Multiple servers

You can run multiple servers to see true distributed RPC:

Terminal 1:

```bash
PORT=3001 DEPLOYMENT_ID=server-a yarn start
```

Terminal 2:

```bash
PORT=3002 DEPLOYMENT_ID=server-b yarn start
```

Both servers register with DeploymentService. Calling `/remote-greet` on either server will discover and call `greet` on one of the registered servers.
