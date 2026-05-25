import React, { useState } from 'react'
import Form from '@rjsf/mantine'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import { Button, Group } from '@mantine/core'
import { Play } from 'lucide-react'

const buildDefaults = (schema: RJSFSchema): any => {
  if (schema.type !== 'object' || !schema.properties) {
    return {}
  }
  const defaults: Record<string, any> = {}
  for (const [key, prop] of Object.entries(schema.properties)) {
    const p = prop as RJSFSchema
    if (p.default !== undefined) {
      defaults[key] = p.default
    } else if (p.type === 'string') {
      defaults[key] = ''
    } else if (p.type === 'number' || p.type === 'integer') {
      defaults[key] = undefined
    } else if (p.type === 'boolean') {
      defaults[key] = false
    } else if (p.type === 'object') {
      defaults[key] = buildDefaults(p)
    }
  }
  return defaults
}

interface SchemaFormProps {
  schema: RJSFSchema
  uiSchema?: UiSchema
  onSubmit?: (formData: any) => void
  submitting?: boolean
  submitLabel?: string
  initialData?: any
  /** Render every field disabled and hide the submit button (display only). */
  readOnly?: boolean
  children?: React.ReactNode
}

export const SchemaForm: React.FC<SchemaFormProps> = ({
  schema,
  uiSchema,
  onSubmit,
  submitting,
  submitLabel = 'Run',
  initialData,
  readOnly,
  children,
}) => {
  const [formData, setFormData] = useState<any>(() => {
    const defaults = buildDefaults(schema)
    return { ...defaults, ...initialData }
  })

  const handleSubmit = (data: { formData?: any }) => {
    onSubmit?.(data.formData)
  }

  const { $schema: _, ...sanitizedSchema } = schema as any

  // In read-only mode, suppress the default submit button by passing an empty
  // child (RJSF renders its children in place of the submit button).
  const submitArea = readOnly
    ? <></>
    : (children ?? (
        <Group justify="flex-end" mt="sm">
          <Button
            type="submit"
            leftSection={<Play size={16} />}
            loading={submitting}
          >
            {submitLabel}
          </Button>
        </Group>
      ))

  return (
    <div style={{ ['--rjsf-object-padding' as string]: '0' }}>
      <style>{`.rjsf-field.rjsf-field-object > * { padding-inline: 0 !important; }`}</style>
      <Form
        schema={sanitizedSchema}
        uiSchema={uiSchema}
        validator={validator}
        formData={formData}
        readonly={readOnly}
        onChange={(e) => !readOnly && setFormData(e.formData)}
        onSubmit={handleSubmit}
        onError={() => {}}
      >
        {submitArea}
      </Form>
    </div>
  )
}
