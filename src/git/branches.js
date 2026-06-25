"use strict";

const vscode = require("vscode");
const { log, logGitArgs } = require("../logging/output");
const { runGit } = require("../git");
const { parseBranches, sortBranches } = require("../parsers");

async function listBranches({ repository, repositoryRoot, gitPath, gitEnv }) {
  const branchSortOrder = vscode.workspace
    .getConfiguration("git", repository.rootUri)
    .get("branchSortOrder", "committerdate");
  const sortArgument =
    branchSortOrder === "alphabetically" ? "refname" : "-committerdate";
  const args = [
    "for-each-ref",
    `--sort=${sortArgument}`,
    "--format=%(refname)%00%(objectname:short)%00%(committerdate:unix)%00%(committerdate:relative)%00%(authorname)%00%(contents:subject)",
    "refs/heads",
    "refs/remotes"
  ];

  const startedAt = Date.now();
  logGitArgs("enumerate branches", args);
  const result = await runGit(gitPath, repositoryRoot, args, { env: gitEnv });
  const branches = sortBranches(
    parseBranches(result.stdout.toString("utf8")),
    branchSortOrder
  );
  log(`Branches discovered: ${branches.length} in ${Date.now() - startedAt}ms`);

  return branches;
}

module.exports = {
  listBranches
};
