# Tree-Shaking Verifier

This project verifies that Pikku's tree-shaking functionality works correctly by testing service aggregation with various filter combinations.

## Project Structure

### Services (6 total)
- **email** - Used by `sendEmail` function, `canSendEmail` permission, `hasEmailQuota` permission factory, `createSessionServices`
- **sms** - Used by `sendSMS` function
- **payment** - Used by `processPayment` function, `canProcessPayment` permission
- **analytics** - Used by `processPayment` function, `trackAnalytics` middleware
- **storage** - Used by `saveData` function, `rateLimiter` middleware factory
- **logger** - Used by `logRequest` middleware, `createSessionServices`

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

### Session Services
- `createSessionServices` - Uses: email, logger (always included)

### HTTP Wirings
| Route | Tags | Function | Middleware | Permissions | Total Services |
|-------|------|----------|------------|-------------|----------------|
| POST /api/notifications/email | notifications, email | sendEmail (email) | logRequest (logger) | canSendEmail (email), hasEmailQuota (email) | email, logger |
| POST /api/notifications/sms | notifications, sms | sendSMS (sms) | logRequest (logger) | - | email, logger, sms |
| POST /api/payments/charge | payments | processPayment (payment, analytics) | logRequest (logger), trackAnalytics (analytics), rateLimiter (storage) | canProcessPayment (payment) | analytics, email, logger, payment, storage |
| POST /api/storage/save | storage | saveData (storage) | - | - | email, logger, storage |

**Note**: `email` and `logger` are always included because `createSessionServices` destructures them.

## Test Matrix

### Single Tag Filters

| Filter | Expected Services | Expected Routes | Rationale |
|--------|------------------|-----------------|-----------|
| `--tags=notifications` | email, logger, sms | /api/notifications/email, /api/notifications/sms | Email route (email, logger) + SMS route (sms, logger) + session services (email, logger) |
| `--tags=email` | email, logger | /api/notifications/email | Email route uses email (function + permissions) + logger (middleware) + session services (email, logger) |
| `--tags=sms` | email, logger, sms | /api/notifications/sms | SMS route uses sms (function) + logger (middleware) + session services (email, logger) |
| `--tags=payments` | analytics, email, logger, payment, storage | /api/payments/charge | Payment route uses payment + analytics (function + middleware) + logger + storage (middleware) + session services (email, logger) |
| `--tags=storage` | email, logger, storage | /api/storage/save | Storage route uses storage (function) + session services (email, logger) |

### Multiple Tag Filters (OR logic)

| Filter | Expected Services | Expected Routes | Rationale |
|--------|------------------|-----------------|-----------|
| `--tags=notifications,payments` | analytics, email, logger, payment, sms, storage | /api/notifications/*, /api/payments/charge | All notification routes + payment route + session services |
| `--tags=email,sms` | email, logger, sms | /api/notifications/email, /api/notifications/sms | Both email and SMS routes + session services |
| `--tags=notifications,storage` | email, logger, sms, storage | /api/notifications/*, /api/storage/save | All notification + storage routes + session services |

### Type Filters

| Filter | Expected Services | Expected Routes | Rationale |
|--------|------------------|-----------------|-----------|
| `--types=http` | analytics, email, logger, payment, sms, storage | All routes | All wirings are HTTP type + session services |
| No filters | analytics, email, logger, payment, sms, storage | All routes | Baseline - everything included + session services |

### HTTP Method Filters

| Filter | Expected Services | Expected Routes | Rationale |
|--------|------------------|-----------------|-----------|
| `--httpMethods=POST` | analytics, email, logger, payment, sms, storage | All routes | All routes are POST + session services |
| `--httpMethods=GET` | email, logger | (none) | No GET routes exist, only session services |

### HTTP Route Filters

| Filter | Expected Services | Expected Routes | Rationale |
|--------|------------------|-----------------|-----------|
| `--httpRoutes=/api/notifications/*` | email, logger, sms | /api/notifications/* | Only notification routes + session services |
| `--httpRoutes=/api/payments/*` | analytics, email, logger, payment, storage | /api/payments/charge | Only payment routes + session services |
| `--httpRoutes=/api/storage/*` | email, logger, storage | /api/storage/save | Only storage routes + session services |

### Directory Filters

| Filter | Expected Services | Expected Routes | Rationale |
|--------|------------------|-----------------|-----------|
| `--directories=src/functions` | analytics, email, logger, payment, sms, storage | All routes | All wirings are in src/functions + session services |
| `--directories=src/nonexistent` | email, logger | (none) | No wirings in nonexistent directory, only session services |

### Combination Filters

| Filter | Expected Services | Expected Routes | Rationale |
|--------|------------------|-----------------|-----------|
| `--tags=notifications --httpMethods=POST` | email, logger, sms | /api/notifications/* | Notification routes that are POST + session services |
| `--tags=payments --types=http` | analytics, email, logger, payment, storage | /api/payments/charge | Payment HTTP routes + session services |

### Wildcard Name Filters

| Filter | Expected Services | Expected Routes | Rationale |
|--------|------------------|-----------------|-----------|
| `--names=send*` | email, logger, sms | /api/notifications/* | Routes using sendEmail and sendSMS functions + middleware + session services |
| `--names=process*` | analytics, email, logger, payment, storage | /api/payments/charge | Routes using processPayment function + middleware + session services |
| `--names=*Payment` | analytics, email, logger, payment, storage | /api/payments/charge | Routes using functions ending with "Payment" + middleware + session services |
| `--names=saveData` | email, logger, storage | /api/storage/save | Routes using saveData function + session services |

## Expected Service Counts by Filter

| Scenario | Service Count | Services |
|----------|---------------|----------|
| Baseline (no filters) | 6 | analytics, email, logger, payment, sms, storage |
| Email route only | 2 | email, logger |
| SMS route only | 3 | email, logger, sms |
| All notifications | 3 | email, logger, sms |
| Payments | 5 | analytics, email, logger, payment, storage |
| Storage | 3 | email, logger, storage |
| Notifications + Payments | 6 | analytics, email, logger, payment, sms, storage |
| All routes | 6 | analytics, email, logger, payment, sms, storage |
| No routes (filters exclude all) | 2 | email, logger (session services only) |

## Running Tests

### Manual Testing

```bash
# Test baseline (all services)
npx pikku all
cat .pikku/pikku-services.gen.ts | grep "singletonServices ="

# Test notifications filter
npx pikku all --tags=notifications
cat .pikku/pikku-services.gen.ts | grep "singletonServices ="

# Test payments filter
npx pikku all --tags=payments
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
