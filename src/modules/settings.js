import chalk from 'chalk';
import { printSectionHeader } from '../ui/banner.js';
import { selectFromMenu, askInput } from '../ui/prompt.js';

export const settingsModule = {
  id: 'settings',
  category: 'Workspace & Config',
  title: 'Engine Settings & Defaults',
  description: 'Configure viewport size, scroll behavior & preview port',

  async run(context) {
    while (true) {
      printSectionHeader('CloneX Engine Settings', 'Choose a setting number to modify');

      const s = context.settings;
      const items = [
        {
          id: 'viewport',
          title: `Default Viewport Size`,
          description: chalk.cyan(`${s.viewportWidth}x${s.viewportHeight}`)
        },
        {
          id: 'wait',
          title: `Post-Scroll Wait Time`,
          description: chalk.cyan(`${s.waitExtraMs}ms`)
        },
        {
          id: 'scroll',
          title: `Full-Page Auto-Scroll (Lazy Load Trigger)`,
          description: s.fullScroll ? chalk.green('Enabled') : chalk.red('Disabled')
        },
        {
          id: 'port',
          title: `Local Preview Server Port`,
          description: chalk.cyan(`${s.previewPort}`)
        }
      ];

      const choice = await selectFromMenu('Current Configuration:', items, {
        allowBack: true,
        backLabel: 'Save & Return to Main Menu'
      });

      if (!choice) break;

      if (choice.id === 'viewport') {
        const w = await askInput('Viewport Width (px)', String(s.viewportWidth));
        const h = await askInput('Viewport Height (px)', String(s.viewportHeight));
        s.viewportWidth = parseInt(w, 10) || 1440;
        s.viewportHeight = parseInt(h, 10) || 900;
      } else if (choice.id === 'wait') {
        const waitVal = await askInput('Extra wait time in ms', String(s.waitExtraMs));
        s.waitExtraMs = parseInt(waitVal, 10) || 1500;
      } else if (choice.id === 'scroll') {
        s.fullScroll = !s.fullScroll;
      } else if (choice.id === 'port') {
        const portVal = await askInput('Preview port', String(s.previewPort));
        s.previewPort = parseInt(portVal, 10) || 4000;
      }
    }
  }
};
