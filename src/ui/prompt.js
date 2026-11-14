import readline from 'readline';
import chalk from 'chalk';

let rlInstance = null;

function getReadline() {
  if (!rlInstance) {
    rlInstance = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rlInstance;
}

export function closePrompt() {
  if (rlInstance) {
    rlInstance.close();
    rlInstance = null;
  }
}

export function askInput(label, defaultValue = '') {
  const rl = getReadline();
  const hint = defaultValue ? chalk.gray(` (${defaultValue})`) : '';
  const promptStr = `  ${chalk.hex('#00F5D4').bold('?')} ${chalk.white.bold(label)}${hint}${chalk.hex('#00F5D4').bold(': ')}`;

  return new Promise((resolve) => {
    rl.question(promptStr, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

export async function askUrl(label = 'Enter target webpage URL') {
  while (true) {
    const raw = await askInput(label);
    if (!raw) {
      console.log(chalk.red('  ✖ Please enter a URL (or type "back" to cancel).'));
      continue;
    }
    if (raw.toLowerCase() === 'back' || raw.toLowerCase() === '0') {
      return null;
    }
    try {
      let formatted = raw;
      if (!/^https?:\/\//i.test(formatted)) {
        formatted = `https://${formatted}`;
      }
      const parsed = new URL(formatted);
      return parsed.href;
    } catch {
      console.log(chalk.red(`  ✖ Invalid URL "${raw}". Try something like https://example.com`));
    }
  }
}

export async function selectFromMenu(title, items, options = {}) {
  const { allowBack = false, backLabel = 'Back to Main Menu' } = options;

  if (title) {
    console.log(`  ${chalk.white.bold(title)}\n`);
  }

  let currentCategory = null;
  items.forEach((item, index) => {
    if (item.category && item.category !== currentCategory) {
      currentCategory = item.category;
      console.log(`  ${chalk.gray.bold(currentCategory.toUpperCase())}`);
    }
    const numBadge = chalk.hex('#00F5D4').bold(`[${index + 1}]`);
    const itemTitle = chalk.white.bold(item.title);
    const desc = item.description ? chalk.gray(` — ${item.description}`) : '';
    console.log(`   ${numBadge} ${itemTitle}${desc}`);
  });

  console.log('');
  if (allowBack) {
    console.log(`   ${chalk.hex('#F72585').bold('[0]')} ${chalk.gray(backLabel)}\n`);
  } else {
    console.log(`   ${chalk.hex('#F72585').bold('[0]')} ${chalk.gray('Exit CloneX')}\n`);
  }

  while (true) {
    const raw = await askInput('Select option', '1');
    const num = parseInt(raw, 10);

    if (raw === '0' || num === 0) {
      return null;
    }

    if (!isNaN(num) && num >= 1 && num <= items.length) {
      return items[num - 1];
    }

    console.log(
      chalk.red(`  ✖ Invalid choice "${raw}". Enter a number between 0 and ${items.length}.`)
    );
  }
}

export async function pauseForEnter(message = 'Press Enter to return to menu...') {
  const rl = getReadline();
  await new Promise((resolve) => {
    rl.question(`\n  ${chalk.gray(message)}`, () => resolve());
  });
}
