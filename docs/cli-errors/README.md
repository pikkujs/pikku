# Pikku CLI Error Codes

This directory contains documentation for all Pikku CLI error codes. Each error has a unique code and detailed troubleshooting guide.

## Error Code Ranges

- **PKU001-099**: Validation errors (missing required properties, invalid types)
- **PKU100-199**: Configuration errors (missing Config type, invalid schemas)
- **PKU200-299**: Function errors (invalid functions, missing metadata)
- **PKU300-399**: Middleware/Permission errors

## Validation Errors (001-099)

| Code | Description | Link |
|------|-------------|------|
| PKU001 | Missing Name Property | [View](./pku001.md) |
| PKU002 | Missing Description Property | [View](./pku002.md) |
| PKU003 | Missing URI Property | [View](./pku003.md) |
| PKU004 | Missing Function Property | [View](./pku004.md) |
| PKU005 | Invalid Tags Type | [View](./pku005.md) |
| PKU006 | Invalid Handler | Coming soon |
| PKU007 | Missing Title Property | [View](./pku007.md) |
| PKU008 | Missing Queue Name | [View](./pku008.md) |
| PKU009 | Missing Channel Name | [View](./pku009.md) |

## Configuration Errors (100-199)

| Code | Description | Link |
|------|-------------|------|
| PKU100 | Config Type Not Found | [View](./pku100.md) |
| PKU101 | Config Type Undefined | Coming soon |
| PKU102 | Schema Has No Root | [View](./pku102.md) |
| PKU103 | Schema Generation Error | [View](./pku103.md) |
| PKU104 | Schema Load Error | Coming soon |

## Function Errors (200-299)

| Code | Description | Link |
|------|-------------|------|
| PKU200 | Function Metadata Not Found | [View](./pku200.md) |
| PKU201 | Handler Not Resolved | Coming soon |

## Middleware/Permission Errors (300-399)

| Code | Description | Link |
|------|-------------|------|
| PKU300 | Middleware Handler Invalid | [View](./pku300.md) |
| PKU301 | Middleware Tag Invalid | Coming soon |
| PKU302 | Middleware Empty Array | Coming soon |
| PKU303 | Middleware Pattern Invalid | Coming soon |
| PKU310 | Permission Handler Invalid | [View](./pku310.md) |
| PKU311 | Permission Tag Invalid | Coming soon |
| PKU312 | Permission Empty Array | Coming soon |
| PKU313 | Permission Pattern Invalid | Coming soon |

## How to Use This Documentation

When you encounter an error:

1. **Find the error code** - Look for `[PKU###]` in the error message
2. **Open the corresponding guide** - Click the link in the table above
3. **Follow the fix instructions** - Each guide includes:
   - What went wrong
   - How to fix it
   - Common mistakes
   - Related errors

## Example Error Message

```
[PKU004] No valid 'func' property for route '/api/users'.
  → https://pikku.dev/docs/cli-errors/pku004
```

This tells you:
- The error code is **PKU004**
- The issue is a missing or invalid `func` property
- The route affected is `/api/users`
- Documentation is available at the provided URL

## Contributing

If you encounter an error that isn't documented or have suggestions for improving these guides, please:

1. Check if the error code exists in the table above
2. Open an issue on GitHub describing the problem
3. Include the full error message and context

## Related Documentation

- [Pikku Core Concepts](../CONTRIBUTING.md)
- [Migration Guide](../MIGRATION.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)
