import chalk from 'chalk';

const RED = chalk.hex('#DC2626');
const BRIGHT_RED = chalk.hex('#EF4444');
const GOLD = chalk.hex('#F59E0B');
const BRIGHT_GOLD = chalk.hex('#FBBF24');
const ARC = chalk.hex('#00E5FF');
const DIM = chalk.hex('#52525B');

const LOGO_LINES = [
  '   ██████╗██╗      ██████╗ ███╗   ██╗███████╗██╗  ██╗',
  '  ██╔════╝██║     ██╔═══██╗████╗  ██║██╔════╝╚██╗██╔╝',
  '  ██║     ██║     ██║   ██║██╔██╗ ██║█████╗   ╚███╔╝ ',
  '  ██║     ██║     ██║   ██║██║╚██╗██║██╔══╝   ██╔██╗ ',
  '  ╚██████╗███████╗╚██████╔╝██║ ╚████║███████╗██╔╝ ██╗',
  '   ╚═════╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝'
];

const IRON_GRADIENT = ['#EF4444', '#DC2626', '#F59E0B', '#FBBF24', '#F59E0B', '#DC2626'];

export function clearScreen() {
  process.stdout.write('\x1Bc');
}

export function renderBanner(moduleTag = 'HUD // READY') {
  console.log('');
  LOGO_LINES.forEach((line, idx) => {
    console.log(chalk.hex(IRON_GRADIENT[idx]).bold(line));
  });
  console.log(DIM('  ═════════════════════════════════════════════════════════'));
  console.log(
    `  ${chalk.bgHex('#B91C1C').hex('#FBBF24').bold(' ◈ MARK-I ')} ${GOLD.bold('CLONEX')} ${DIM('//')} ${ARC(moduleTag)}`
  );
  console.log(DIM('  ═════════════════════════════════════════════════════════\n'));
}

export async function playBootAnimation(depSummary = null) {
  clearScreen();
  console.log('');
  LOGO_LINES.forEach((line, idx) => {
    console.log(chalk.hex(IRON_GRADIENT[idx]).bold(line));
  });
  console.log(DIM('  ═════════════════════════════════════════════════════════'));

  if (depSummary) {
    console.log(`  ${GOLD.bold('DIAGNOSTICS')}`);
    for (const item of depSummary) {
      await new Promise((r) => setTimeout(r, 35));
      console.log(
        `   ${ARC('◈')} ${chalk.white(item.name.padEnd(20, ' '))} ${DIM(item.detail || 'ONLINE')}`
      );
    }
    console.log('');
  }

  const stages = [
    'IGNITING ARC REACTOR CORE',
    'CALIBRATING CHROMIUM OPTICS',
    'ARMING DOM & CSSOM EXTRACTORS',
    'LINKING RECON & ASSET MODULES',
    'ALL SYSTEMS ONLINE'
  ];

  const barWidth = 28;
  for (let i = 0; i <= barWidth; i += 2) {
    const ratio = i / barWidth;
    const filled = '█'.repeat(i);
    const empty = '░'.repeat(barWidth - i);
    const pct = String(Math.round(ratio * 100)).padStart(3, ' ');
    const stage = stages[Math.min(stages.length - 1, Math.floor(ratio * stages.length))];

    process.stdout.write(
      `\r  ${RED('[')}${BRIGHT_GOLD(filled)}${DIM(empty)}${RED(']')} ${ARC.bold(`${pct}%`)} ${DIM('│')} ${GOLD(stage.padEnd(32, ' '))}`
    );
    await new Promise((r) => setTimeout(r, 24));
  }
  await new Promise((r) => setTimeout(r, 150));
  clearScreen();
}

export function createCloneXSpinner(initialText = 'WORKING') {
  const frames = ['◈', '◇', '◈', '◆'];
  let frameIdx = 0;
  let currentText = initialText;
  let timer = null;

  return {
    start(text) {
      if (text) currentText = text;
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        const frame = frames[frameIdx % frames.length];
        frameIdx++;
        process.stdout.write(
          `\r  ${chalk.bgHex('#B91C1C').hex('#FBBF24').bold(' CLONEX ')} ${ARC.bold(frame)} ${GOLD(currentText.padEnd(56, ' '))}`
        );
      }, 90);
      return this;
    },
    update(text) {
      currentText = text;
    },
    succeed(text) {
      if (timer) clearInterval(timer);
      timer = null;
      process.stdout.write(
        `\r  ${chalk.bgHex('#F59E0B').black.bold(' CLONEX ')} ${ARC.bold('◈')} ${BRIGHT_GOLD.bold((text || currentText).padEnd(56, ' '))}\n`
      );
    },
    fail(text) {
      if (timer) clearInterval(timer);
      timer = null;
      process.stdout.write(
        `\r  ${chalk.bgHex('#DC2626').white.bold(' CLONEX ')} ${BRIGHT_RED.bold('✖')} ${BRIGHT_RED.bold((text || currentText).padEnd(56, ' '))}\n`
      );
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      process.stdout.write('\r' + ' '.repeat(75) + '\r');
    }
  };
}

export function printSectionHeader(title, subtitle = '') {
  console.log(
    `\n  ${BRIGHT_RED.bold('◢')} ${BRIGHT_GOLD.bold(title.toUpperCase())}${subtitle ? DIM(` // ${subtitle}`) : ''}`
  );
  console.log(DIM('  ─────────────────────────────────────────────────────────'));
}
