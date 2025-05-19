import { FunctionsMeta, HTTPRoutesMeta, pikkuState } from '@pikku/core'
import _convertSchema from '@openapi-contrib/json-schema-to-openapi-schema'
const convertSchema =
  'default' in _convertSchema ? (_convertSchema.default as any) : _convertSchema

interface OpenAPISpec {
  openapi: string
  info: {
    title: string
    version: string
    description?: string
    termsOfService?: string
    contact?: {
      name?: string
      url?: string
      email?: string
    }
    license?: {
      name: string
      url?: string
    }
  }
  servers: { url: string; description?: string }[]
  paths: Record<string, any>
  components: {
    schemas: Record<string, any>
    responses?: Record<string, any>
    parameters?: Record<string, any>
    examples?: Record<string, any>
    requestBodies?: Record<string, any>
    headers?: Record<string, any>
    securitySchemes?: Record<string, any>
  }
  security?: { [key: string]: any[] }[]
  tags?: { name: string; description?: string }[]
  externalDocs?: {
    description?: string
    url: string
  }
}

export interface OpenAPISpecInfo {
  info: {
    title: string
    version: string
    description: string
    termsOfService?: string
    contact?: {
      name?: string
      url?: string
      email?: string
    }
    license?: {
      name: string
      url?: string
    }
  }
  servers: { url: string; description?: string }[]
  tags?: { name: string; description?: string }[]
  externalDocs?: {
    description?: string
    url: string
  }
  securitySchemes?: Record<string, any>
  security?: { [key: string]: any[] }[]
}

const getErrorResponseForConstructorName = (constructorName: string) => {
  const errors = Array.from(pikkuState('misc', 'errors').entries())
  const foundError = errors.find(([e]) => e.name === constructorName)
  if (foundError) {
    return foundError[1]
  }
  return undefined
}

const convertSchemasToBodyPayloads = async (
  functionsMeta: FunctionsMeta,
  routesMeta: HTTPRoutesMeta,
  schemas: Record<string, any>
) => {
  const requiredSchemas = new Set(
    routesMeta
      .map(({ inputTypes, pikkuFuncName }) => {
        const output = functionsMeta[pikkuFuncName]?.outputs?.[0]
        return [inputTypes?.body, output]
      })
      .flat()
      .filter((schema) => !!schema)
  )
  const convertedEntries = await Promise.all(
    Object.entries(schemas).map(async ([key, schema]) => {
      if (requiredSchemas.has(key)) {
        const convertedSchema = await convertSchema(schema, {
          convertUnreferencedDefinitions: false,
          dereference: { circular: 'ignore' },
        })
        return [key, convertedSchema]
      }
      return
    })
  )
  return Object.fromEntries(convertedEntries.filter((s) => !!s))
}

export async function generateOpenAPISpec(
  functionsMeta: FunctionsMeta,
  routeMeta: HTTPRoutesMeta,
  schemas: Record<string, any>,
  additionalInfo: OpenAPISpecInfo
): Promise<OpenAPISpec> {
  const paths: Record<string, any> = {}

  routeMeta.forEach((meta) => {
    const { route, method, inputTypes, pikkuFuncName, params, query, docs } =
      meta
    const { outputs } = functionsMeta[pikkuFuncName]
    const output = outputs ? outputs[0] : undefined

    const path = route.replace(/:(\w+)/g, '{$1}') // Convert ":param" to "{param}"

    if (!paths[path]) {
      paths[path] = {}
    }

    const responses = {}
    docs?.errors?.forEach((error) => {
      const errorResponse = getErrorResponseForConstructorName(error)
      if (errorResponse) {
        responses[errorResponse.status] = {
          description: errorResponse.message,
        }
      }
    })

    const operation: any = {
      description:
        docs?.description ||
        `This endpoint handles the ${method.toUpperCase()} request for the route ${route}.`,
      tags: docs?.tags || [route.split('/')[1] || 'default'],
      parameters: [],
      responses: {
        ...responses,
        '200': {
          description: 'Successful response',
          content: output
            ? {
                'application/json': {
                  schema:
                    typeof output === 'string' &&
                    ['boolean', 'string', 'number'].includes(output)
                      ? { type: output }
                      : { $ref: `#/components/schemas/${output}` },
                },
              }
            : undefined,
        },
      },
    }

    const bodyType = inputTypes?.body
    if (bodyType) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema:
              typeof bodyType === 'string' &&
              ['boolean', 'string', 'number'].includes(bodyType)
                ? { type: bodyType }
                : { $ref: `#/components/schemas/${bodyType}` },
          },
        },
      }
    }

    if (params) {
      operation.parameters = params.map((param) => ({
        name: param,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      }))
    }

    if (query) {
      operation.parameters.push(
        ...query.map((query) => ({
          name: query,
          in: 'query',
          required: false,
          schema: { type: 'string' },
        }))
      )
    }

    paths[path][method] = operation
  })

  return {
    openapi: '3.1.0',
    info: additionalInfo.info,
    servers: additionalInfo.servers,
    paths,
    components: {
      schemas: await convertSchemasToBodyPayloads(
        functionsMeta,
        routeMeta,
        schemas
      ),
      responses: {},
      parameters: {},
      examples: {},
      requestBodies: {},
      headers: {},
      securitySchemes: additionalInfo.securitySchemes || {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
    security: additionalInfo.security || [
      {
        ApiKeyAuth: [],
      },
      {
        BearerAuth: [],
      },
    ],
    tags: additionalInfo.tags,
    externalDocs: additionalInfo.externalDocs,
    // definitions
  }
}
