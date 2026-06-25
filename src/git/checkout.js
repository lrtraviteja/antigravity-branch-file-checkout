"use strict";

const vscode = require("vscode");
const { buildPathspecInput } = require("../parsers");
const { runGit } = require("../git");
const { logGitArgs, logGitResult } = require("../logging/output");

async function checkoutSelectedFiles({
  branchRef,
  repositoryRoot,
  gitPath,
  gitEnv,
  selectedFiles
}) {
  const checkoutStartedAt = Date.now();
  const checkoutArgs = [
    "checkout",
    "-q",
    "--pathspec-from-file=-",
    "--pathspec-file-nul",
    branchRef
  ];
  logGitArgs("checkout", checkoutArgs);

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Checking out ${selectedFiles.length} file(s) from ${branchRef}`,
      cancellable: true
    },
    (_progress, token) =>
      runGit(gitPath, repositoryRoot, checkoutArgs, {
        env: gitEnv,
        input: buildPathspecInput(selectedFiles),
        token
      })
  );

  logGitResult(result, checkoutStartedAt);
  return result;
}

module.exports = {
  checkoutSelectedFiles
};
