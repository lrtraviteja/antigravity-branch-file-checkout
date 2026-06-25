"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const test = require("node:test");
const { runGit } = require("../src/git");
const {
  buildPathspecInput,
  parseBranches,
  parseLsTree,
  parsePorcelainPaths
} = require("../src/parsers");

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  return execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });
}

test("Git workflow lists branches and checks out selected branch files", async (t) => {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), "branch-file-checkout-")
  );
  const resolvedTempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  assert.ok(path.resolve(repositoryRoot).startsWith(resolvedTempRoot));
  t.after(() =>
    rm(repositoryRoot, { recursive: true, force: true, maxRetries: 3 })
  );

  await git(repositoryRoot, ["init", "-b", "main"]);
  await git(repositoryRoot, ["config", "user.email", "test@example.com"]);
  await git(repositoryRoot, ["config", "user.name", "Branch Checkout Test"]);
  await git(repositoryRoot, ["config", "core.autocrlf", "false"]);

  await mkdir(path.join(repositoryRoot, "src"));
  await writeFile(path.join(repositoryRoot, "a file.txt"), "main\n");
  await writeFile(path.join(repositoryRoot, "src", "base.js"), "main\n");
  await git(repositoryRoot, ["add", "."]);
  await git(repositoryRoot, ["commit", "-m", "main files"]);

  await git(repositoryRoot, ["checkout", "-b", "feature"]);
  await writeFile(path.join(repositoryRoot, "a file.txt"), "feature\n");
  await writeFile(
    path.join(repositoryRoot, "src", "feature.js"),
    "module.exports = true;\n"
  );
  await git(repositoryRoot, ["add", "."]);
  await git(repositoryRoot, ["commit", "-m", "feature files"]);
  await git(repositoryRoot, ["checkout", "main"]);

  const branchResult = await runGit("git", repositoryRoot, [
    "for-each-ref",
    "--sort=refname",
    "--format=%(refname)%00%(objectname:short)%00%(committerdate:unix)%00%(committerdate:relative)%00%(authorname)%00%(contents:subject)",
    "refs/heads",
    "refs/remotes"
  ]);
  assert.deepEqual(
    parseBranches(branchResult.stdout.toString("utf8")).map(
      (branch) => branch.name
    ),
    ["feature", "main"]
  );

  const treeResult = await runGit("git", repositoryRoot, [
    "ls-tree",
    "-r",
    "-z",
    "feature"
  ]);
  assert.deepEqual(parseLsTree(treeResult.stdout).files, [
    "a file.txt",
    "src/base.js",
    "src/feature.js"
  ]);

  const selectedFiles = ["a file.txt", "src/feature.js"];
  const pathspecInput = buildPathspecInput(selectedFiles);
  await writeFile(path.join(repositoryRoot, "a file.txt"), "local change\n");

  const statusResult = await runGit("git", repositoryRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all"
  ]);
  const selectedPathSet = new Set(selectedFiles);
  assert.deepEqual(
    parsePorcelainPaths(statusResult.stdout).filter((file) =>
      selectedPathSet.has(file)
    ),
    ["a file.txt"]
  );

  await runGit(
    "git",
    repositoryRoot,
    [
      "checkout",
      "-q",
      "--pathspec-from-file=-",
      "--pathspec-file-nul",
      "feature"
    ],
    { input: pathspecInput }
  );

  assert.equal(
    await readFile(path.join(repositoryRoot, "a file.txt"), "utf8"),
    "feature\n"
  );
  assert.equal(
    await readFile(path.join(repositoryRoot, "src", "feature.js"), "utf8"),
    "module.exports = true;\n"
  );
});
