/**
 * Generates host.json for Azure Functions.
 *
 * This is the global configuration file for the Function App.
 */

export function generateHostJson(): string {
  return JSON.stringify(
    {
      version: '2.0',
      logging: {
        applicationInsights: {
          samplingSettings: {
            isEnabled: true,
            excludedTypes: 'Request',
          },
        },
      },
      extensionBundle: {
        id: 'Microsoft.Azure.Functions.ExtensionBundle',
        version: '[4.*, 5.0.0)',
      },
      extensions: {
        http: {
          routePrefix: '',
        },
      },
    },
    null,
    2
  )
}

/**
 * Generates local.settings.json for Azure Functions local dev.
 *
 * Contains environment variables and connection strings.
 */
export function generateLocalSettings(
  secrets: Array<{ secretId: string }>,
  variables: Array<{ variableId: string }>
): string {
  const values: Record<string, string> = {
    AzureWebJobsStorage: 'UseDevelopmentStorage=true',
    FUNCTIONS_WORKER_RUNTIME: 'node',
  }

  for (const secret of secrets) {
    values[secret.secretId] = ''
  }
  for (const variable of variables) {
    values[variable.variableId] = ''
  }

  return JSON.stringify(
    {
      IsEncrypted: false,
      Values: values,
    },
    null,
    2
  )
}
