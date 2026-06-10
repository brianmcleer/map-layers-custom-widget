import { BaseVersionManager } from 'jimu-core'
import type { IMConfig } from './config'

class VersionManager extends BaseVersionManager {
  versions = [
    {
      version: '1.12.0',
      description: 'disable old app data-action, delete unused config prop selectedJimuLayerIds',
      upgrader: (oldConfig: IMConfig) => {
        let newConfig: any = oldConfig
        newConfig = newConfig.without('selectedJimuLayerIds')
        return newConfig
      }
    }
  ]
}

export const versionManager: BaseVersionManager = new VersionManager()
