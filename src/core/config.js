import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIG_DIR = path.join(os.homedir(), '.clonex');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_SETTINGS = {
  viewportWidth: 1440,
  viewportHeight: 900,
  waitExtraMs: 1500,
  fullScroll: true,
  previewPort: 4000,
  crawlMaxPages: 300,
  crawlMaxDepth: 6,
  crawlConcurrency: 8,
  crawlDelayMs: 75,
  respectRobots: true,
  renderMode: 'http',
  userAgent: ''
};

export function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    return CONFIG_PATH;
  } catch {
    return null;
  }
}

export { CONFIG_PATH };
