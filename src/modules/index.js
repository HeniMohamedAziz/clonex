import { fullCloneModule } from './full-clone.js';
import { snapshotsModule } from './snapshots.js';
import { designExtractorModule } from './design-extractor.js';
import { assetHarvesterModule } from './asset-harvester.js';
import { projectManagerModule } from './project-manager.js';
import { settingsModule } from './settings.js';

/**
 * Central CloneX Module Registry.
 * Add new modules to this array to automatically register them in the interactive menu.
 */
export const CLONEX_MODULES = [
  fullCloneModule,
  snapshotsModule,
  designExtractorModule,
  assetHarvesterModule,
  projectManagerModule,
  settingsModule
];
