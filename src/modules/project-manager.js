import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { createStaticServer } from '../verifier.js';
import { printSectionHeader } from '../ui/banner.js';
import { selectFromMenu, askInput, pauseForEnter } from '../ui/prompt.js';

export const projectManagerModule = {
  id: 'project-manager',
  category: 'Workspace & Config',
  title: 'Browse & Preview Cloned Sites',
  description: 'Launch local preview server or open your cloned projects',

  async run(context) {
    printSectionHeader('Cloned Projects Manager', 'Manage and preview your captured websites');

    const rootClonesDir = path.resolve(process.cwd(), 'cloned-sites');
    if (!existsSync(rootClonesDir)) {
      console.log(chalk.yellow('  No cloned sites found yet in ./cloned-sites/'));
      await pauseForEnter();
      return;
    }

    const entries = await fs.readdir(rootClonesDir, { withFileTypes: true });
    const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    if (folders.length === 0) {
      console.log(chalk.yellow('  No cloned sites found yet in ./cloned-sites/'));
      await pauseForEnter();
      return;
    }

    const menuItems = folders.map((folderName) => {
      const fullPath = path.join(rootClonesDir, folderName);
      const hasReact = existsSync(path.join(fullPath, 'react'));
      return {
        id: folderName,
        title: folderName,
        description: hasReact ? 'HTML/CSS + React Project' : 'HTML/CSS / Assets',
        fullPath
      };
    });

    const selectedProject = await selectFromMenu('Select a cloned project:', menuItems, {
      allowBack: true
    });
    if (!selectedProject) return;

    console.log('');
    const actions = [
      {
        id: 'preview',
        title: 'Start Live Local Preview Server',
        description: `Serve ${selectedProject.title} at http://localhost:${context.settings.previewPort || 4000}`
      },
      {
        id: 'explorer',
        title: 'Open Folder in Windows Explorer',
        description: selectedProject.fullPath
      },
      {
        id: 'delete',
        title: 'Delete Cloned Project',
        description: 'Permanently remove this folder from ./cloned-sites/'
      }
    ];

    const action = await selectFromMenu(`Manage "${selectedProject.title}":`, actions, {
      allowBack: true,
      backLabel: 'Back'
    });

    if (!action) return;

    if (action.id === 'explorer') {
      if (process.platform === 'win32') {
        spawn('explorer.exe', [selectedProject.fullPath], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
      console.log(chalk.green(`\n  ✔ Opened ${selectedProject.fullPath}`));
      await pauseForEnter();
    } else if (action.id === 'preview') {
      const port = context.settings.previewPort || 4000;
      const server = createStaticServer(selectedProject.fullPath);
      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
      const previewUrl = `http://localhost:${port}`;
      console.log(
        `\n  ${chalk.bgHex('#00F5D4').black.bold(' LIVE ')} Serving ${chalk.white.bold(selectedProject.title)} at ${chalk.cyan.underline(previewUrl)}`
      );
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', previewUrl], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }
      await askInput('Press Enter to stop the preview server');
      server.close();
    } else if (action.id === 'delete') {
      const confirm = await askInput(`Type "yes" to delete ${selectedProject.title}`, 'no');
      if (confirm.toLowerCase() === 'yes') {
        await fs.rm(selectedProject.fullPath, { recursive: true, force: true });
        console.log(chalk.green(`\n  ✔ Deleted ${selectedProject.title}`));
      }
      await pauseForEnter();
    }
  }
};
