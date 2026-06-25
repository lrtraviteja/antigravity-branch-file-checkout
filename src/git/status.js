"use strict";

const { logGitArgs } = require("../logging/output");
const { runGit } = require("../git");
const { parsePorcelainPaths } = require("../parsers");

async function getDirtySelectedPaths({
  repositoryRoot,
  gitPath,
  gitEnv,
  selectedFiles
}) {
  const args = [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all"
  ];
  logGitArgs("check selected files", args);

  const result = await runGit(gitPath, repositoryRoot, args, {
    env: gitEnv
  });
  const selectedPathSet = new Set(selectedFiles);
  return parsePorcelainPaths(result.stdout).filter((file) =>
    selectedPathSet.has(file)
  );
}

module.exports = {
  getDirtySelectedPaths
};
