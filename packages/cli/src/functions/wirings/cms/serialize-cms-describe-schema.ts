/**
 * The zod of what `describeCms` answers: `CmsDescription` of @pikku/core/cms,
 * as a schema, so the first build has it. The app's typecheck and a unit test
 * hold the two together.
 */
export const DESCRIBE_SCHEMA = `const CmsField = z.object({
  name: z.string(),
  label: z.string(),
  input: z.enum([
    'text',
    'longtext',
    'richtext',
    'select',
    'toggle',
    'number',
    'datetime',
    'date',
    'email',
    'url',
    'money',
    'image',
    'relation',
    'tags',
  ]),
  editable: z.boolean(),
  required: z.boolean(),
  nullable: z.boolean(),
  help: z.string().optional(),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  maxLength: z.number().optional(),
  maxItems: z.number().optional(),
  currency: z
    .union([z.object({ column: z.string() }), z.object({ code: z.string() })])
    .optional(),
  accept: z.array(z.string()).optional(),
  maxBytes: z.number().optional(),
  uploadFunction: z.string().optional(),
  optionsFunction: z.string().optional(),
  target: z.string().optional(),
  untrusted: z.boolean().optional(),
})

const CmsCollection = z.object({
  name: z.string(),
  label: z.string(),
  from: z.string().optional(),
  primaryKey: z.string(),
  title: z.string(),
  thumbnail: z.string().optional(),
  badge: z.string().optional(),
  operations: z.array(z.enum(['read', 'create', 'edit', 'delete'])),
  functions: z.object({
    list: z.string(),
    get: z.string(),
    create: z.string().optional(),
    update: z.string().optional(),
    delete: z.string().optional(),
  }),
  actions: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      function: z.string(),
      input: z.array(CmsField),
      confirm: z.string().optional(),
    })
  ),
  list: z.object({
    columns: z.array(z.string()),
    filter: z.array(z.string()),
    sort: z.array(z.string()),
    search: z.array(z.string()),
  }),
  detail: z.array(z.string()),
  submitted: z.array(z.string()),
  groups: z.array(
    z.object({ label: z.string(), fields: z.array(z.string()) })
  ),
  pii: z.array(z.string()),
  deletesAlso: z.array(z.string()),
  fields: z.array(CmsField),
})

export const DescribeCmsInput = z.strictObject({})

export const DescribeCmsOutput = z.object({
  collections: z.array(CmsCollection),
})`
