export class TypesMap {
  private map: Map<string, { originalName: string; path: string | null }> =
    new Map()
  public customTypes: Map<string, { type: string; references: string[] }> =
    new Map()

  public addCustomType(name: string, type: string, references: string[]) {
    this.customTypes.set(name, { type, references })
  }

  public addType(originalName: string, path: string) {
    this.map.set(originalName, { originalName, path })
  }

  public addUniqueType(originalName: string, path: string): string {
    const uniqueName = `${originalName}_${Math.random().toString(36).substring(7)}`
    this.map.set(uniqueName, { originalName, path })
    return uniqueName
  }

  public getUniqueName(name: string): string {
    const meta = this.getTypeMeta(name)
    return meta.uniqueName
  }

  public getTypeMeta(name: string): {
    originalName: string
    uniqueName: string
    path: string | null
  } {
    if (
      [
        'string',
        'number',
        'boolean',
        'null',
        'undefined',
        'void',
        'unknown',
        'never',
      ].includes(name)
    ) {
      return {
        originalName: name,
        uniqueName: name,
        path: null,
      }
    }

    if (this.customTypes.has(name)) {
      return {
        originalName: name,
        uniqueName: name,
        path: null,
      }
    }

    let meta = this.map.get(name)
    if (!meta) {
      meta = Array.from(this.map.entries()).find(
        ([_, { originalName }]) => originalName === name
      )?.[1]
    }
    if (!meta) {
      throw new Error(`Type ${name} not found in typesMap`)
    }

    const getName = this.squash()
    return {
      uniqueName: getName(name),
      originalName: meta.originalName,
      path: meta?.path,
    }
  }

  public exists(originalName: string, path: string): string | undefined {
    const found = Array.from(this.map.entries()).find(([_, type]) => {
      return type.path === path && type.originalName === originalName
    })
    return found ? found[0] : undefined
  }

  private squash() {
    const duplicateNames = new Set<string>()
    const pathToNamesMap = new Map<string, Map<string, string>>()
    const nameOccurrences = new Map<string, Set<string>>()

    // First pass: Track occurrences of each original name across paths
    this.map.forEach(({ path, originalName }) => {
      if (path) {
        if (!nameOccurrences.has(originalName)) {
          nameOccurrences.set(originalName, new Set())
        }
        nameOccurrences.get(originalName)!.add(path)
      }
    })

    // Second pass: Populate pathToNamesMap
    this.map.forEach(({ path, originalName }, uniqueName) => {
      if (!path) return

      if (!pathToNamesMap.has(path)) {
        pathToNamesMap.set(path, new Map())
      }

      const isDuplicate = nameOccurrences.get(originalName)!.size > 1
      if (isDuplicate) {
        duplicateNames.add(uniqueName)
      }
      // Use uniqueName only if the originalName is duplicated across files
      const nameToUse = isDuplicate ? uniqueName : originalName
      pathToNamesMap.get(path)!.set(nameToUse, originalName)
    })

    const getName = (uniqueName: string) => {
      if (duplicateNames.has(uniqueName)) {
        return uniqueName
      }
      if (
        uniqueName === 'string' ||
        uniqueName === 'number' ||
        uniqueName === 'boolean' ||
        uniqueName === 'null'
      ) {
        return uniqueName
      }
      if (!this.map.has(uniqueName)) {
        const found = Array.from(this.map.entries()).find(
          ([_, { originalName }]) => originalName === uniqueName
        )?.[1]
        if (!found) {
          throw new Error(`Type ${uniqueName} not found in typesMap`)
        }
        return found.originalName
      }
      return this.map.get(uniqueName)!.originalName
    }

    return getName
  }
}
