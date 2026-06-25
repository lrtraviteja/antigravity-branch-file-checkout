"use strict";

const vscode = require("vscode");
const { log, logGitArgs } = require("../logging/output");
const { runGit } = require("../git");
const { parseLsTree } = require("../parsers");

async function listBranchFiles({ branch, repositoryRoot, gitPath, gitEnv }) {
  const args = ["ls-tree", "-r", "-z", branch.ref];
  const startedAt = Date.now();
  logGitArgs("list branch files", args);

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Reading files from ${branch.ref}`,
      cancellable: true
    },
    (_progress, token) =>
      runGit(gitPath, repositoryRoot, args, {
        env: gitEnv,
        token,
        maxOutputBytes: 256 * 1024 * 1024
      })
  );

  const parsed = parseLsTree(result.stdout);
  log(
    `Files discovered on branch: ${parsed.files.length} in ${
      Date.now() - startedAt
    }ms`
  );
  if (parsed.skippedEntries > 0) {
    log(`Skipped non-file tree entries: ${parsed.skippedEntries}`);
  }
  return parsed.files;
}

module.exports = {
  listBranchFiles
};
