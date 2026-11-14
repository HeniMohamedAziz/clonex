import { fullCloneModule } from './full-clone.js';
import { siteMirrorModule } from './site-mirror.js';
import { snapshotsModule } from './snapshots.js';
import { siteReconModule } from './site-recon.js';
import { subdomainHunterModule } from './subdomain-hunter.js';
import { designExtractorModule } from './design-extractor.js';
import { assetHarvesterModule } from './asset-harvester.js';
import { projectManagerModule } from './project-manager.js';
import { settingsModule } from './settings.js';

export const CLONEX_MODULES = [
  fullCloneModule,
  siteMirrorModule,
  snapshotsModule,
  siteReconModule,
  subdomainHunterModule,
  designExtractorModule,
  assetHarvesterModule,
  projectManagerModule,
  settingsModule
];
