# @pikku/openapi-parser

## 0.12.6

### Patch Changes

- a57ff11: Add Swagger 2.0 support: extract requestBody from body parameters, responseSchema from direct response schema, and component schemas from definitions. Fix duplicate .describe() on request body properties.

## 0.12.5

### Patch Changes

- 8552e18: Don't generate `output: z.void()` for operations without response schemas — omit the field instead

## 0.12.4

### Patch Changes

- e3142ad: Use JSON.stringify for safe interpolation of OpenAPI spec values in generated code to prevent code injection via malicious specs.
