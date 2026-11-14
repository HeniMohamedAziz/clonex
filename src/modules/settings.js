import chalk from 'chalk';
import { printSectionHeader } from '../ui/banner.js';
import { selectFromMenu, askInput } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');

export const settingsModule = {
  id: 'settings',
  category: 'System',
  title: 'Core Configuration',
  description: 'Viewport + Scroll + Wait + Port',

  async run(context) {
    while (true) {
      printSectionHeader('Core Configuration');

      const s = context.settings;
      const items = [
        {
          id: 'viewport',
          title: 'Viewport Dimensions',
          description: ARC(`${s.viewportWidth}x${s.viewportHeight}`)
        },
        {
          id: 'wait',
          title: 'Post-Scroll Dwell',
          description: ARC(`${s.waitExtraMs}ms`)
        },
        {
          id: 'scroll',
          title: 'Auto-Scroll Lazy Trigger',
          description: s.fullScroll ? GOLD('ACTIVE') : RED('OFF')
        },
        {
          id: 'port',
          title: 'Server Port',
          description: ARC(`${s.previewPort}`)
        }
      ];

      const choice = await selectFromMenu('PARAMETERS', items, {
        allowBack: true
      });

      if (!choice) break;

      if (choice.id === 'viewport') {
        const w = await askInput('WIDTH (px)', String(s.viewportWidth));
        const h = await askInput('HEIGHT (px)', String(s.viewportHeight));
        s.viewportWidth = parseInt(w, 10) || 1440;
        s.viewportHeight = parseInt(h, 10) || 900;
      } else if (choice.id === 'wait') {
        const waitVal = await askInput('DWELL (ms)', String(s.waitExtraMs));
        s.waitExtraMs = parseInt(waitVal, 10) || 1500;
      } else if (choice.id === 'scroll') {
        s.fullScroll = !s.fullScroll;
      } else if (choice.id === 'port') {
        const portVal = await askInput('PORT', String(s.previewPort));
        s.previewPort = parseInt(portVal, 10) || 4000;
      }
    }
  }
};
