#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { scenarios } from '../test-scenarios.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Generate markdown table from test scenarios
 */
function generateTestMatrix(): string {
  // Group scenarios by category
  const singleTagFilters: typeof scenarios = []
  const multipleTagFilters: typeof scenarios = []
  const typeFilters: typeof scenarios = []
  const httpMethodFilters: typeof scenarios = []
  const httpRouteFilters: typeof scenarios = []
  const directoryFilters: typeof scenarios = []
  const combinationFilters: typeof scenarios = []
  const wildcardNameFilters: typeof scenarios = []
  const baseline: typeof scenarios = []

  for (const scenario of scenarios) {
    if (scenario.name.startsWith('Baseline')) {
      baseline.push(scenario)
    } else if (scenario.name.startsWith('Tag:')) {
      singleTagFilters.push(scenario)
    } else if (scenario.name.startsWith('Tags:')) {
      multipleTagFilters.push(scenario)
    } else if (scenario.name.startsWith('Type:')) {
      typeFilters.push(scenario)
    } else if (scenario.name.startsWith('HTTP Method:')) {
      httpMethodFilters.push(scenario)
    } else if (scenario.name.startsWith('HTTP Route:')) {
      httpRouteFilters.push(scenario)
    } else if (scenario.name.startsWith('Directory:')) {
      directoryFilters.push(scenario)
    } else if (scenario.name.startsWith('Combo:')) {
      combinationFilters.push(scenario)
    } else if (scenario.name.startsWith('Name:')) {
      wildcardNameFilters.push(scenario)
    }
  }

  const generateTable = (scenarios: typeof scenarios) => {
    const rows = scenarios.map((s) => {
      const filter = s.filter || '(none)'
      const services = s.expectedServices.join(', ')
      return `| \`${filter}\` | ${services} | ${s.description} |`
    })
    return [
      '| Filter | Expected Services | Rationale |',
      '| ------ | ----------------- | --------- |',
      ...rows,
    ].join('\n')
  }

  let output = '## Test Matrix\n\n'

  if (baseline.length > 0) {
    output += '### Baseline\n\n'
    output += generateTable(baseline)
    output += '\n\n'
  }

  if (singleTagFilters.length > 0) {
    output += '### Single Tag Filters\n\n'
    output += generateTable(singleTagFilters)
    output += '\n\n'
  }

  if (multipleTagFilters.length > 0) {
    output += '### Multiple Tag Filters (OR logic)\n\n'
    output += generateTable(multipleTagFilters)
    output += '\n\n'
  }

  if (typeFilters.length > 0) {
    output += '### Type Filters\n\n'
    output += generateTable(typeFilters)
    output += '\n\n'
  }

  if (httpMethodFilters.length > 0) {
    output += '### HTTP Method Filters\n\n'
    output += generateTable(httpMethodFilters)
    output += '\n\n'
  }

  if (httpRouteFilters.length > 0) {
    output += '### HTTP Route Filters\n\n'
    output += generateTable(httpRouteFilters)
    output += '\n\n'
  }

  if (directoryFilters.length > 0) {
    output += '### Directory Filters\n\n'
    output += generateTable(directoryFilters)
    output += '\n\n'
  }

  if (combinationFilters.length > 0) {
    output += '### Combination Filters\n\n'
    output += generateTable(combinationFilters)
    output += '\n\n'
  }

  if (wildcardNameFilters.length > 0) {
    output += '### Wildcard Name Filters\n\n'
    output += generateTable(wildcardNameFilters)
    output += '\n\n'
  }

  return output.trim()
}

/**
 * Generate expected service counts summary table
 */
function generateServiceCountsTable(): string {
  // Get unique service combinations and count them
  const serviceCombos = new Map<string, { count: number; name: string }>()

  for (const scenario of scenarios) {
    const services = [...scenario.expectedServices].sort().join(', ')
    const existing = serviceCombos.get(services)
    if (existing) {
      existing.count++
    } else {
      serviceCombos.set(services, { count: 1, name: scenario.name })
    }
  }

  // Convert to array and sort by service count
  const combos = Array.from(serviceCombos.entries()).map(
    ([services, { count, name }]) => ({
      services,
      count,
      serviceCount: services.split(', ').length,
      name,
    })
  )
  combos.sort((a, b) => b.serviceCount - a.serviceCount)

  const rows = combos.map((combo) => {
    return `| ${combo.name} | ${combo.serviceCount} | ${combo.services} |`
  })

  return [
    '## Expected Service Counts by Filter\n',
    '| Scenario | Service Count | Services |',
    '| -------- | ------------- | -------- |',
    ...rows,
  ].join('\n')
}

/**
 * Main function to generate README
 */
function main() {
  const templatePath = join(__dirname, '../README.template.md')
  const outputPath = join(__dirname, '../README.md')

  // Read template
  const template = readFileSync(templatePath, 'utf-8')

  // Generate the test matrix table
  const testMatrix = generateTestMatrix()

  // Generate the service counts table
  const serviceCountsTable = generateServiceCountsTable()

  // Replace placeholders in template
  let output = template.replace('<!-- TEST_MATRIX -->', testMatrix)
  output = output.replace('<!-- SERVICE_COUNTS -->', serviceCountsTable)

  // Write output
  writeFileSync(outputPath, output, 'utf-8')

  console.log('✓ README.md generated successfully from test scenarios')
}

main()
