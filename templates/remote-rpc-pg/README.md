# Remote RPC Template (PostgreSQL)

This template demonstrates how to use `rpc.remote()` with the DeploymentService for service discovery using PostgreSQL.

## What it demonstrates

1. **DeploymentService** - Registers server endpoints and functions with PostgreSQL
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

- PostgreSQL database running
- Database URL configured via `DATABASE_URL` environment variable

Default connection string:

```
postgres://postgres:password@localhost:5432/pikku_remote_rpc
```

## Setup

```bash
# Create the database
createdb pikku_remote_rpc

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

   - Creates `PgDeploymentService` connected to PostgreSQL
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
