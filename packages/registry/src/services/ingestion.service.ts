import { mkdir, readFile, readdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { extract } from 'tar'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'

import type {
  PackageRegistryEntry,
  FunctionsMeta,
  HTTPWiringsMeta,
  ChannelsMeta,
  CLIProgramMeta,
  McpMeta,
} from '../types.js'

interface NpmPackageJson {
  name: string
  version: string
  description?: string
  author?: string | { name: string }
  license?: string
  repository?: string | { url: string }
  keywords?: string[]
}

interface NpmRegistryVersion {
  version: string
  dist: {
    tarball: string
  }
}

interface NpmRegistryResponse {
  name: string
  'dist-tags': Record<string, string>
  versions: Record<string, NpmRegistryVersion>
}

export class IngestionService {
  async ingestLocal(packageDir: string): Promise<PackageRegistryEntry> {
    const pkgJsonContent = await readFile(
      join(packageDir, 'package.json'),
      'utf-8'
    )
    const pkgJson = JSON.parse(pkgJsonContent) as {
      name: string
      version: string
    }
    return await this.extractMetadata(packageDir, pkgJson.name, pkgJson.version)
  }

  async ingest(
    packageName: string,
    version?: string
  ): Promise<PackageRegistryEntry> {
    const registryData = await this.fetchNpmMetadata(packageName)
    const resolvedVersion = version ?? registryData['dist-tags'].latest
    const versionData = registryData.versions[resolvedVersion]

    if (!versionData) {
      throw new Error(`Version ${resolvedVersion} not found for ${packageName}`)
    }

    const tmpDir = join(tmpdir(), `pikku-registry-${randomUUID()}`)
    await mkdir(tmpDir, { recursive: true })

    try {
      await this.downloadAndExtract(versionData.dist.tarball, tmpDir)
      const packageDir = join(tmpDir, 'package')
      return await this.extractMetadata(
        packageDir,
        packageName,
        resolvedVersion
      )
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }

  private async fetchNpmMetadata(
    packageName: string
  ): Promise<NpmRegistryResponse> {
    const url = `https://registry.npmjs.org/${packageName}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch npm metadata for ${packageName}: ${response.statusText}`
      )
    }
    return (await response.json()) as NpmRegistryResponse
  }

  private async downloadAndExtract(
    tarballUrl: string,
    destDir: string
  ): Promise<void> {
    const response = await fetch(tarballUrl)
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download tarball: ${response.statusText}`)
    }

    const tarballPath = join(destDir, 'package.tgz')
    const webStream = response.body as ReadableStream<Uint8Array>
    const nodeStream = Readable.fromWeb(webStream as any)
    await pipeline(nodeStream, createWriteStream(tarballPath))

    await extract({
      file: tarballPath,
      cwd: destDir,
    })
  }

  private async extractMetadata(
    packageDir: string,
    packageName: string,
    version: string
  ): Promise<PackageRegistryEntry> {
    const pkgJson = await this.readPackageJson(packageDir)
    const readme = await this.readReadme(packageDir)
    const icon = await this.readIcon(packageDir)

    const functions =
      (await this.readJsonFile<FunctionsMeta>(
        join(packageDir, '.pikku', 'function', 'pikku-functions-meta.gen.json')
      )) ?? {}

    const agentData = await this.readJsonFile<{
      agentsMeta: Record<string, unknown>
    }>(join(packageDir, '.pikku', 'agent', 'pikku-agent-wirings-meta.gen.json'))
    const agents = agentData?.agentsMeta ?? {}

    const secrets =
      (await this.readJsonFile<Record<string, unknown>>(
        join(packageDir, '.pikku', 'secrets', 'pikku-secrets-meta.gen.json')
      )) ?? {}

    const variables =
      (await this.readJsonFile<Record<string, unknown>>(
        join(packageDir, '.pikku', 'variables', 'pikku-variables-meta.gen.json')
      )) ?? {}

    const httpRoutes =
      (await this.readJsonFile<HTTPWiringsMeta>(
        join(packageDir, '.pikku', 'http', 'pikku-http-wirings-meta.gen.json')
      )) ?? ({} as HTTPWiringsMeta)

    const channels =
      (await this.readJsonFile<ChannelsMeta>(
        join(packageDir, '.pikku', 'channel', 'pikku-channels-meta.gen.json')
      )) ?? {}

    const cliData = await this.readJsonFile<{
      programs: Record<string, CLIProgramMeta>
    }>(join(packageDir, '.pikku', 'cli', 'pikku-cli-wirings-meta.gen.json'))
    const cli = cliData?.programs ?? {}

    const mcp = await this.readJsonFile<McpMeta>(
      join(packageDir, '.pikku', 'mcp', 'pikku-mcp-wirings-meta.gen.json')
    )

    const schemas = await this.readAllSchemas(
      join(packageDir, '.pikku', 'schemas', 'schemas')
    )

    const id = this.deriveId(packageName)
    const now = new Date().toISOString()

    const author =
      typeof pkgJson.author === 'string'
        ? pkgJson.author
        : (pkgJson.author?.name ?? '')

    const repository =
      typeof pkgJson.repository === 'string'
        ? pkgJson.repository
        : pkgJson.repository?.url

    return {
      id,
      name: packageName,
      displayName: pkgJson.name,
      description: pkgJson.description ?? '',
      version,
      author,
      repository,
      license: pkgJson.license,
      readme,
      icon,
      publishedAt: now,
      updatedAt: now,
      tags: pkgJson.keywords ?? [],
      categories: [],
      functions,
      agents,
      secrets,
      variables,
      httpRoutes,
      channels,
      cli,
      mcp,
      schemas,
    }
  }

  private async readJsonFile<T>(path: string): Promise<T | null> {
    try {
      const content = await readFile(path, 'utf-8')
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }

  private async readAllSchemas(
    schemasDir: string
  ): Promise<Record<string, unknown>> {
    const schemas: Record<string, unknown> = {}
    try {
      const files = await readdir(schemasDir)
      for (const file of files) {
        if (file.endsWith('.schema.json')) {
          const name = file.replace('.schema.json', '')
          const content = await readFile(join(schemasDir, file), 'utf-8')
          schemas[name] = JSON.parse(content)
        }
      }
    } catch {
      // No schemas directory
    }
    return schemas
  }

  private async readPackageJson(packageDir: string): Promise<NpmPackageJson> {
    const content = await readFile(join(packageDir, 'package.json'), 'utf-8')
    return JSON.parse(content)
  }

  private async readReadme(packageDir: string): Promise<string | undefined> {
    try {
      return await readFile(join(packageDir, 'README.md'), 'utf-8')
    } catch {
      return undefined
    }
  }

  private async readIcon(packageDir: string): Promise<string | undefined> {
    try {
      const iconsDir = join(packageDir, 'icons')
      const files = await readdir(iconsDir)
      const svg = files.find((f) => f.endsWith('.svg'))
      if (svg) {
        return await readFile(join(iconsDir, svg), 'utf-8')
      }
    } catch {
      // No icons directory
    }
    return undefined
  }

  private deriveId(packageName: string): string {
    return packageName.replace(/^@/, '').replace(/\//g, '-').toLowerCase()
  }
}
