import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { createStaticServer } from '../verifier.js';
import { printSectionHeader } from '../ui/banner.js';
import { selectFromMenu, askInput, pauseForEnter } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');

export const projectManagerModule = {
  id: 'project-manager',
  category: 'System',
  title: 'Project Vault & Local Server',
  description: 'Preview, inspect or purge captured targets',

  async run(context) {
    printSectionHeader('Project Vault');

    const rootClonesDir = path.resolve(process.cwd(), 'cloned-sites');
    if (!existsSync(rootClonesDir)) {
      console.log(GOLD('  No captured targets in ./cloned-sites/'));
      await pauseForEnter();
      return;
    }

    const entries = await fs.readdir(rootClonesDir, { withFileTypes: true });
    const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    if (folders.length === 0) {
      console.log(GOLD('  No captured targets in ./cloned-sites/'));
      await pauseForEnter();
      return;
    }

    const menuItems = folders.map((folderName) => {
      const fullPath = path.join(rootClonesDir, folderName);
      const hasReact = existsSync(path.join(fullPath, 'react'));
      return {
        id: folderName,
        title: folderName,
        description: hasReact ? 'HTML/CSS + React' : 'HTML/CSS',
        fullPath
      };
    });

    const selectedProject = await selectFromMenu('CAPTURED TARGETS', menuItems, {
      allowBack: true
    });
    if (!selectedProject) return;

    console.log('');
    const actions = [
      {
        id: 'preview',
        title: 'Launch Local Server',
        description: `http://localhost:${context.settings.previewPort || 4000}`
      },
      {
        id: 'explorer',
        title: 'Open Directory',
        description: selectedProject.fullPath
      },
      {
        id: 'delete',
        title: 'Purge Target',
        description: 'Delete from disk'
      }
    ];

    const action = await selectFromMenu(`TARGET // ${selectedProject.title}`, actions, {
      allowBack: true
    });

    if (!action) return;

    if (action.id === 'explorer') {
      if (process.platform === 'win32') {
        spawn('explorer.exe', [selectedProject.fullPath], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
      await pauseForEnter();
    } else if (action.id === 'preview') {
      const port = context.settings.previewPort || 4000;
      const server = createStaticServer(selectedProject.fullPath);
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      const previewUrl = `http://localhost:${port}`;
      console.log(
        `\n  ${chalk.bgHex('#B91C1C').hex('#FBBF24').bold(' ONLINE ')} ${ARC(previewUrl)}`
      );
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', previewUrl], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
      await askInput('ENTER to terminate server');
      server.close();
    } else if (action.id === 'delete') {
      const confirm = await askInput(`Confirm purge "${selectedProject.title}" (y/n)`, 'n');
      if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
        await fs.rm(selectedProject.fullPath, { recursive: true, force: true });
        console.log(RED(`\n  ◈ Purged ${selectedProject.title}`));
      }
      await pauseForEnter();
    }
  }
};
