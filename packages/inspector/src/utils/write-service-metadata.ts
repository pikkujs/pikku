import * as fs from 'fs'
import * as path from 'path'
import { ServiceMetadata } from './extract-service-metadata.js'

/**
 * Write service metadata to a JSON file in .pikku/services directory
 */
export function writeServiceMetadata(
  serviceMeta: ServiceMetadata,
  outDir: string
): void {
  const servicesDir = path.join(outDir, 'services')

  if (!fs.existsSync(servicesDir)) {
    fs.mkdirSync(servicesDir, { recursive: true })
  }

  const fileName = `${serviceMeta.name}.gen.json`
  const filePath = path.join(servicesDir, fileName)

  const jsonContent = JSON.stringify(serviceMeta, null, 2)
  fs.writeFileSync(filePath, jsonContent, 'utf-8')
}

/**
 * Write all service metadata files
 */
export function writeAllServiceMetadata(
  servicesMetadata: ServiceMetadata[],
  outDir: string
): void {
  for (const serviceMeta of servicesMetadata) {
    writeServiceMetadata(serviceMeta, outDir)
  }
}

/**
 * Clean up services directory (remove old service JSON files)
 */
export function cleanServicesDirectory(outDir: string): void {
  const servicesDir = path.join(outDir, 'services')

  if (fs.existsSync(servicesDir)) {
    const files = fs.readdirSync(servicesDir)
    for (const file of files) {
      if (file.endsWith('.gen.json')) {
        fs.unlinkSync(path.join(servicesDir, file))
      }
    }
  }
}
