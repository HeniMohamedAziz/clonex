import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { createStaticServer } from '../verifier.js';
import { updateTargetDashboard } from '../core/dashboard.js';
import { printSectionHeader } from '../ui/banner.js';
import { selectFromMenu, askInput, pauseForEnter } from '../ui/prompt.js';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');

export const projectManagerModule = {
  id: 'project-manager',
  category: 'System',
  title: 'Project Vault & Local Server',
  description: 'Open HUD Dashboard, preview clones or manage captured targets',

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
      const parts = [];
      if (existsSync(path.join(fullPath, '01-html-clone')) || existsSync(path.join(fullPath, 'index.html')))
        parts.push('1:1 Clone');
      if (existsSync(path.join(fullPath, '02-react-project')) || existsSync(path.join(fullPath, 'react')))
        parts.push('React');
      if (existsSync(path.join(fullPath, '05-intelligence')) || existsSync(path.join(fullPath, 'recon')))
        parts.push('Recon Dossier');
      if (existsSync(path.join(fullPath, '06-site-mirror')) || existsSync(path.join(fullPath, 'mirror')))
        parts.push('Full Mirror');
      return {
        id: folderName,
        title: folderName,
        description: parts.join(' + ') || 'Target Folder',
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
        id: 'dashboard',
        title: 'Open Interactive HUD Dashboard (DASHBOARD.html)',
        description: 'View organized intelligence, subdomains, pages, Markdown & visual clone'
      },
      {
        id: 'preview',
        title: 'Launch Local 1:1 Clone Server',
        description: `http://localhost:${context.settings.previewPort || 4000}`
      },
      {
        id: 'explorer',
        title: 'Open Target Directory in Explorer',
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

    if (action.id === 'dashboard') {
      const dashPath = await updateTargetDashboard(selectedProject.fullPath);
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', '""', dashPath], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
      await pauseForEnter();
    } else if (action.id === 'explorer') {
      if (process.platform === 'win32') {
        spawn('explorer.exe', [selectedProject.fullPath], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
      await pauseForEnter();
    } else if (action.id === 'preview') {
      const port = context.settings.previewPort || 4000;
      const htmlCloneDir = path.join(selectedProject.fullPath, '01-html-clone');
      const serveDir = existsSync(htmlCloneDir) ? htmlCloneDir : selectedProject.fullPath;
      const server = createStaticServer(serveDir);
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
