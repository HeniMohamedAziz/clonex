import chalk from 'chalk';

const LOGO_LINES = [
  '   ██████╗██╗      ██████╗ ███╗   ██╗███████╗██╗  ██╗',
  '  ██╔════╝██║     ██╔═══██╗████╗  ██║██╔════╝╚██╗██╔╝',
  '  ██║     ██║     ██║   ██║██╔██╗ ██║█████╗   ╚███╔╝ ',
  '  ██║     ██║     ██║   ██║██║╚██╗██║██╔══╝   ██╔██╗ ',
  '  ╚██████╗███████╗╚██████╔╝██║ ╚████║███████╗██╔╝ ██╗',
  '   ╚═════╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝'
];

const PALETTE = ['#00F5D4', '#00BBF9', '#4361EE', '#7209B7', '#F72585', '#FF007F'];

export function clearScreen() {
  process.stdout.write('\x1Bc');
}

export function renderBanner(subtitle = 'Web Design Capture & Reverse-Engineering Suite v1.1.0') {
  console.log('');
  LOGO_LINES.forEach((line, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    console.log(chalk.hex(color).bold(line));
  });
  console.log(
    chalk.gray('  ─────────────────────────────────────────────────────────')
  );
  console.log(
    `  ${chalk.bgHex('#7209B7').white.bold(' CLONEX ')} ${chalk.hex('#00F5D4')(subtitle)}`
  );
  console.log(
    chalk.gray('  ─────────────────────────────────────────────────────────\n')
  );
}

export async function playBootAnimation(skip = false) {
  if (skip) return;
  clearScreen();
  console.log('');
  LOGO_LINES.forEach((line, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    console.log(chalk.hex(color).bold(line));
  });
  console.log('');

  const steps = [
    'Initializing CloneX Core...',
    'Binding Playwright Chromium Engine...',
    'Loading DOM & CSSOM Serializers...',
    'Mounting Module Registry...',
    'CloneX Ready.'
  ];

  const barWidth = 28;
  for (let i = 0; i <= barWidth; i += 2) {
    const ratio = i / barWidth;
    const filled = '█'.repeat(i);
    const empty = '░'.repeat(barWidth - i);
    const percent = String(Math.round(ratio * 100)).padStart(3, ' ');
    const stepIdx = Math.min(steps.length - 1, Math.floor(ratio * steps.length));
    const stepText = steps[stepIdx];

    process.stdout.write(
      `\r  ${chalk.hex('#00F5D4')('[')}${chalk.hex('#7209B7')(filled)}${chalk.gray(empty)}${chalk.hex('#00F5D4')(']')} ${chalk.bold.white(`${percent}%`)} ${chalk.gray('│')} ${chalk.cyan(stepText.padEnd(36, ' '))}`
    );
    await new Promise((r) => setTimeout(r, 32));
  }
  await new Promise((r) => setTimeout(r, 180));
  clearScreen();
}

export function createCloneXSpinner(initialText = 'Processing...') {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
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
          `\r  ${chalk.bgHex('#4361EE').white.bold(' CloneX ')} ${chalk.hex('#00F5D4').bold(frame)} ${chalk.white(currentText.padEnd(58, ' '))}`
        );
      }, 80);
      return this;
    },
    update(text) {
      currentText = text;
    },
    succeed(text) {
      if (timer) clearInterval(timer);
      timer = null;
      process.stdout.write(
        `\r  ${chalk.bgHex('#00F5D4').black.bold(' CloneX ')} ${chalk.green.bold('✔')} ${chalk.green.bold((text || currentText).padEnd(58, ' '))}\n`
      );
    },
    fail(text) {
      if (timer) clearInterval(timer);
      timer = null;
      process.stdout.write(
        `\r  ${chalk.bgHex('#F72585').white.bold(' CloneX ')} ${chalk.red.bold('✖')} ${chalk.red.bold((text || currentText).padEnd(58, ' '))}\n`
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
    `\n  ${chalk.hex('#00F5D4').bold('▸')} ${chalk.white.bold(title.toUpperCase())}${subtitle ? chalk.gray(` — ${subtitle}`) : ''}`
  );
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));
}
