let activeToken = null;

export function beginAbortable() {
  const token = { aborted: false };
  activeToken = token;
  return token;
}

export function endAbortable() {
  activeToken = null;
}

export function installSigintHandler(onExit) {
  process.on('SIGINT', () => {
    if (activeToken && !activeToken.aborted) {
      activeToken.aborted = true;
      process.stdout.write('\n  \x1b[38;2;251;191;36m◈ Abort received — finishing in-flight requests and saving partial results...\x1b[0m\n');
      return;
    }
    if (onExit) onExit();
    process.stdout.write('\n');
    process.exit(130);
  });
}
