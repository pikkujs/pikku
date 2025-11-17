# Tree-Shaking Verifier

This project verifies that Pikku's tree-shaking functionality works correctly by testing service aggregation with various filter combinations.

## Project Structure

### Services (6 total)

- **email** - Used by `sendEmail` function, `canSendEmail` permission, `hasEmailQuota` permission factory, `createWireServices`
- **sms** - Used by `sendSMS` function
- **payment** - Used by `processPayment` function, `canProcessPayment` permission
- **analytics** - Used by `processPayment` function, `trackAnalytics` middleware
- **storage** - Used by `saveData` function, `rateLimiter` middleware factory
- **logger** - Used by `logRequest` middleware, `createWireServices`

### Functions

- `sendEmail` - Uses: email
- `sendSMS` - Uses: sms
- `processPayment` - Uses: payment, analytics
- `saveData` - Uses: storage

### Middleware

- `logRequest` - Uses: logger
- `trackAnalytics` - Uses: analytics
- `rateLimiter(limit)` - Factory - Uses: storage

### Permissions

- `canSendEmail` - Uses: email
- `canProcessPayment` - Uses: payment
- `hasEmailQuota(quota)` - Factory - Uses: email

### Wire Services

- `createWireServices` - Uses: email, logger (always included)

### HTTP Wirings

| Route                         | Tags                 | Function                            | Middleware                                                             | Permissions                                 | Total Services                             |
| ----------------------------- | -------------------- | ----------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| POST /api/notifications/email | notifications, email | sendEmail (email)                   | logRequest (logger)                                                    | canSendEmail (email), hasEmailQuota (email) | email, logger                              |
| POST /api/notifications/sms   | notifications, sms   | sendSMS (sms)                       | logRequest (logger)                                                    | -                                           | email, logger, sms                         |
| POST /api/payments/charge     | payments             | processPayment (payment, analytics) | logRequest (logger), trackAnalytics (analytics), rateLimiter (storage) | canProcessPayment (payment)                 | analytics, email, logger, payment, storage |
| POST /api/storage/save        | storage              | saveData (storage)                  | -                                                                      | -                                           | email, logger, storage                     |

**Note**: `email` and `logger` are always included because `createWireServices` destructures them.

<!-- TEST_MATRIX -->

<!-- SERVICE_COUNTS -->

## Running Tests

### Manual Testing

```bash
# Test baseline (all services)
yarn pikku all
cat .pikku/pikku-services.gen.ts | grep "singletonServices ="

# Test notifications filter
yarn pikku all --tags=notifications
cat .pikku/pikku-services.gen.ts | grep "singletonServices ="

# Test payments filter
yarn pikku all --tags=payments
cat .pikku/pikku-services.gen.ts | grep "singletonServices ="
```

### Automated Testing

```bash
# Run all test scenarios
npm test
```

The automated test will:

1. Run `pikku all` with each filter combination
2. Parse the generated `pikku-services.gen.ts` file
3. Verify the expected services are present
4. Report pass/fail for each scenario
5. Provide a summary of results

## Implementation Notes

### Tree-Shaking Flow

1. **Filter Application** - CLI filters are parsed and passed to inspector
2. **AST Traversal** - Inspector visits all source files
3. **Wiring Detection** - Only wirings matching filters are recorded
4. **Service Tracking** - Services used by matched wirings are tracked during traversal
5. **Service Aggregation** - Post-processing aggregates all required services
6. **Code Generation** - Only required services are included in generated files

### Service Tracking Details

Services are tracked at the point where wirings are added:

- `add-http-route.ts` - Tracks services from HTTP route functions
- `add-queue-worker.ts` - Tracks services from queue worker functions
- `add-schedule.ts` - Tracks services from scheduler functions
- `add-mcp-*.ts` - Tracks services from MCP endpoint functions
- `add-channel.ts` - Tracks services from channel handlers
- `add-cli.ts` - Tracks services from CLI commands

Middleware and permission services are also tracked when they're used by filtered wirings.

### Critical Implementation Details

1. **Type Definitions Always Included** - Infrastructure types (UserSession, SingletonServices, etc.) are always discovered regardless of filters
2. **Default Services** - Framework services (config, logger, schema, variables) are always included
3. **Internal Services Excluded** - Framework-managed services (rpc, mcp, channel, userSession) are excluded from the generated map
4. **OR Logic for Arrays** - Multiple tags/types use OR logic (matches if ANY tag matches)
5. **Wildcard Support** - Name filters support wildcard patterns (e.g., `email-*`)

## Troubleshooting

### Services Not Being Filtered

Check that:

1. Wirings have the correct tags
2. Filter syntax is correct (comma-separated for multiple values)
3. The generated `.pikku/pikku-services.gen.ts` file was regenerated
4. Type definitions are in the srcDirectories

### Too Many Services Included

Verify that:

1. Middleware isn't pulling in extra services
2. Permissions aren't pulling in extra services
3. Functions aren't destructuring services they don't use
4. forceRequiredServices in config isn't forcing additional services

### Test Failures

1. Check that all dependencies are installed: `yarn install`
2. Ensure CLI is built: `cd ../../packages/cli && yarn build`
3. Run a manual test to see the actual vs expected output
4. Check that the test matrix expectations are correct
