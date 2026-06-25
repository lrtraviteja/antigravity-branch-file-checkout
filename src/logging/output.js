"use strict";

const vscode = require("vscode");

const OUTPUT_CHANNEL_NAME = "Branch File Checkout";

/** @type {vscode.OutputChannel | undefined} */
let outputChannel;

function initializeOutputChannel(context) {
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);
  return outputChannel;
}

function showOutput(preserveFocus = true) {
  outputChannel?.show(preserveFocus);
}

function revealOutputForMode(requiredMode) {
  const configuredMode = vscode.workspace
    .getConfiguration("branchFileCheckout")
    .get("revealOutput", "onError");
  if (configuredMode === requiredMode) {
    showOutput(true);
  }
}

function logGitArgs(purpose, args) {
  log(`Git argv (${purpose}): ${args.map(formatArgument).join(" ")}`);
}

function logGitResult(result, startedAt) {
  const stdout = result.stdout.toString("utf8").trim();
  const stderr = result.stderr.toString("utf8").trim();
  log(`Git exit code: ${result.exitCode}`);
  if (stdout) {
    logMultiline("Git stdout", stdout);
  }
  if (stderr) {
    logMultiline("Git stderr", stderr);
  }
  log(`Git duration: ${Date.now() - startedAt}ms`);
}

function logFailure(error, elapsedSeconds) {
  if (error?.name === "GitCommandError") {
    log(`Failed Git argv: ${error.args.map(formatArgument).join(" ")}`);
    log(`Git exit code: ${error.exitCode}`);
    const stdout = error.stdout.toString("utf8").trim();
    const stderr = error.stderr.toString("utf8").trim();
    if (stdout) {
      logMultiline("Git stdout", stdout);
    }
    if (stderr) {
      logMultiline("Git stderr", stderr);
    }
  } else {
    log(`Failure: ${formatError(error)}`);
  }
  log(`Operation ended after ${elapsedSeconds}s`);
}

function logMultiline(label, value) {
  log(`${label}:`);
  for (const line of value.split(/\r?\n/)) {
    log(`  ${escapeLogText(line)}`);
  }
}

function logDivider() {
  outputChannel?.appendLine("");
  outputChannel?.appendLine("=".repeat(72));
}

function log(message) {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

function formatArgument(argument) {
  return /\s|["]/.test(argument) ? JSON.stringify(argument) : argument;
}

function escapeLogText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
}

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return error.message || String(error);
}

module.exports = {
  escapeLogText,
  formatArgument,
  formatError,
  initializeOutputChannel,
  log,
  logDivider,
  logFailure,
  logGitArgs,
  logGitResult,
  logMultiline,
  revealOutputForMode,
  showOutput
};
