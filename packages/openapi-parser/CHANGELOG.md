# @pikku/openapi-parser

## 0.12.5

### Patch Changes

- 8552e18: Don't generate `output: z.void()` for operations without response schemas — omit the field instead

## 0.12.4

### Patch Changes

- e3142ad: Use JSON.stringify for safe interpolation of OpenAPI spec values in generated code to prevent code injection via malicious specs.
