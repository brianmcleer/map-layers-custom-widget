import { BaseVersionManager } from 'jimu-core'
import type { IMConfig } from './config'
import { __t } from './runtime/i18n-t'

class VersionManager extends BaseVersionManager {
  versions = [
    {
      version: '1.12.0',
      description: __t("disableOldAppDataActionDelete"),
      upgrader: (oldConfig: IMConfig) => {
        let newConfig: any = oldConfig
        newConfig = newConfig.without('selectedJimuLayerIds')
        return newConfig
      }
    }
  ]
}

export const versionManager: BaseVersionManager = new VersionManager()
