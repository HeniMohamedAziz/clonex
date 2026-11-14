import { fullCloneModule } from './full-clone.js';
import { siteReconModule } from './site-recon.js';
import { snapshotsModule } from './snapshots.js';
import { designExtractorModule } from './design-extractor.js';
import { assetHarvesterModule } from './asset-harvester.js';
import { projectManagerModule } from './project-manager.js';
import { settingsModule } from './settings.js';

export const CLONEX_MODULES = [
  fullCloneModule,
  siteReconModule,
  snapshotsModule,
  designExtractorModule,
  assetHarvesterModule,
  projectManagerModule,
  settingsModule
];
