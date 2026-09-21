/**
 * The build that goes to S3, started the same way on every machine.
 *
 * `PANEL_STATIC_EXPORT=1 next build` is a POSIX sentence. pnpm hands a script to
 * the platform's shell, and on Windows that is cmd.exe, which reads the whole
 * thing as the name of a program and answers:
 *
 *     'PANEL_STATIC_EXPORT' is not recognized as an internal or external command
 *
 * So the deploy worked in CI, on Linux, and failed on the laptop this project is
 * written on — for a product whose deploy script exists precisely so that "one
 * way to deploy" is true. Setting the variable here and spawning the build keeps
 * it true without adding a dependency to do what four lines do.
 */
import { spawn } from 'node:child_process';

const build = spawn('next', ['build'], {
  stdio: 'inherit',
  // Windows resolves `next` through next.cmd, which needs a shell to be found.
  shell: true,
  env: { ...process.env, PANEL_STATIC_EXPORT: '1' },
});

build.on('exit', (code, signal) => {
  // A build killed by a signal has not succeeded, and exiting 0 there would
  // upload whatever happened to be in `out/` from the last one.
  process.exit(code ?? (signal === null ? 1 : 1));
});
