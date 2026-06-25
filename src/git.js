"use strict";

const { spawn } = require("node:child_process");

class GitCommandError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "GitCommandError";
    this.args = details.args;
    this.exitCode = details.exitCode;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
    this.code = details.code;
  }
}

function runGit(gitPath, cwd, args, options = {}) {
  const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    if (options.token?.isCancellationRequested) {
      reject(
        new GitCommandError("Git command was canceled.", {
          args,
          exitCode: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          code: "GIT_CANCELLED"
        })
      );
      return;
    }

    const child = spawn(gitPath, args, {
      cwd,
      env: {
        ...process.env,
        ...options.env
      },
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let canceled = false;
    let cancellationDisposable;

    const finishWithError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      disposeCancellation();
      reject(error);
    };

    const enforceOutputLimit = () => {
      if (stdoutBytes + stderrBytes <= maxOutputBytes) {
        return;
      }
      child.kill();
      finishWithError(
        new GitCommandError(
          `Git output exceeded the ${maxOutputBytes} byte safety limit.`,
          {
            args,
            exitCode: null,
            stdout: Buffer.concat(stdoutChunks),
            stderr: Buffer.concat(stderrChunks),
            code: "GIT_OUTPUT_LIMIT"
          }
        )
      );
    };

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.length;
      enforceOutputLimit();
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
      enforceOutputLimit();
    });

    child.on("error", (error) => {
      finishWithError(
        new GitCommandError(error.message, {
          args,
          exitCode: null,
          stdout: Buffer.concat(stdoutChunks),
          stderr: Buffer.concat(stderrChunks),
          code: error.code
        })
      );
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      disposeCancellation();

      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);
      if (canceled) {
        reject(
          new GitCommandError("Git command was canceled.", {
            args,
            exitCode,
            stdout,
            stderr,
            code: "GIT_CANCELLED"
          })
        );
        return;
      }
      if (exitCode !== 0) {
        reject(
          new GitCommandError(
            stderr.toString("utf8").trim() ||
              `Git exited with code ${exitCode}.`,
            {
              args,
              exitCode,
              stdout,
              stderr,
              code: "GIT_COMMAND_FAILED"
            }
          )
        );
        return;
      }

      resolve({
        args,
        exitCode,
        stdout,
        stderr
      });
    });

    cancellationDisposable = options.token?.onCancellationRequested(
      () => {
        canceled = true;
        child.kill();
      }
    );
    function disposeCancellation() {
      cancellationDisposable?.dispose();
    }

    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

module.exports = {
  GitCommandError,
  runGit
};
