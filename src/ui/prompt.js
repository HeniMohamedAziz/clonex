import readline from 'readline';
import chalk from 'chalk';

const RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

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
  const hint = defaultValue ? DIM(` [${defaultValue}]`) : '';
  const promptStr = `  ${ARC.bold('◈')} ${GOLD.bold(label)}${hint}${RED.bold(' > ')}`;

  return new Promise((resolve) => {
    rl.question(promptStr, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

export async function askUrl(label = 'TARGET URL') {
  while (true) {
    const raw = await askInput(label);
    if (!raw) continue;
    if (raw.toLowerCase() === 'back' || raw === '0') {
      return null;
    }
    try {
      let formatted = raw;
      if (!/^https?:\/\//i.test(formatted)) {
        formatted = `https://${formatted}`;
      }
      return new URL(formatted).href;
    } catch {
      console.log(RED(`  ✖ Invalid URL: ${raw}`));
    }
  }
}

export async function selectFromMenu(title, items, options = {}) {
  const { allowBack = false, backLabel = 'BACK' } = options;

  if (title) {
    console.log(`  ${GOLD.bold(title)}\n`);
  }

  let currentCategory = null;
  items.forEach((item, index) => {
    if (item.category && item.category !== currentCategory) {
      currentCategory = item.category;
      console.log(`  ${RED.bold('▸ ' + currentCategory.toUpperCase())}`);
    }
    const numBadge = GOLD.bold(`[${index + 1}]`);
    const itemTitle = chalk.white.bold(item.title);
    const desc = item.description ? DIM(` // ${item.description}`) : '';
    console.log(`   ${numBadge} ${itemTitle}${desc}`);
  });

  console.log('');
  console.log(`   ${RED.bold('[0]')} ${DIM(allowBack ? backLabel : 'SHUTDOWN')}\n`);

  while (true) {
    const raw = await askInput('SELECT', '1');
    const num = parseInt(raw, 10);

    if (raw === '0' || num === 0) {
      return null;
    }

    if (!isNaN(num) && num >= 1 && num <= items.length) {
      return items[num - 1];
    }

    console.log(RED(`  ✖ Out of range [0-${items.length}]`));
  }
}

export async function pauseForEnter(message = 'ENTER to continue...') {
  const rl = getReadline();
  await new Promise((resolve) => {
    rl.question(`\n  ${DIM(message)}`, () => resolve());
  });
}
