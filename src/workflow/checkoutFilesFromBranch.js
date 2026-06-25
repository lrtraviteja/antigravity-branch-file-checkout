"use strict";

const vscode = require("vscode");
const { getGitApi } = require("../git/api");
const { listBranches } = require("../git/branches");
const { checkoutSelectedFiles } = require("../git/checkout");
const { getDirtySelectedPaths } = require("../git/status");
const { listBranchFiles } = require("../git/tree");
const {
  escapeLogText,
  formatError,
  log,
  logDivider,
  logFailure,
  revealOutputForMode,
  showOutput
} = require("../logging/output");
const { pickBranch } = require("../pickers/branchPicker");
const { pickFiles } = require("../pickers/branchFilePicker");
const { resolveRepository } = require("../pickers/repositoryPicker");

async function checkoutFilesFromBranch(_context, scmContext) {
  const startedAt = Date.now();
  logDivider();
  log("Started branch file checkout");
  revealOutputForMode("always");

  try {
    const gitApi = await getGitApi();
    const repository = await resolveRepository(gitApi, scmContext);
    if (!repository) {
      log("Canceled: no Git repository was selected");
      return;
    }

    const repositoryRoot = repository.rootUri.fsPath;
    const gitPath = gitApi.git.path;
    const gitEnv = gitApi.git.env;
    log(`Repository: ${escapeLogText(repositoryRoot)}`);

    const branches = await listBranches({
      repository,
      repositoryRoot,
      gitPath,
      gitEnv
    });
    const branch = await pickBranch({
      branches,
      currentBranch: repository.state.HEAD?.name
    });
    if (!branch) {
      log("Canceled: no branch was selected");
      return;
    }
    log(`Branch selected: ${escapeLogText(branch.ref)}`);

    const files = await listBranchFiles({
      branch,
      repositoryRoot,
      gitPath,
      gitEnv
    });
    if (files.length === 0) {
      log("No files were found on the selected branch");
      await vscode.window.showInformationMessage(
        `No files were found on ${branch.ref}.`
      );
      return;
    }

    const selectedFiles = await pickFiles(files, branch.ref, repositoryRoot);
    if (!selectedFiles || selectedFiles.length === 0) {
      log("Canceled: no files were selected");
      return;
    }

    log(`Files selected: ${selectedFiles.length}`);
    for (const file of selectedFiles) {
      log(`  - ${escapeLogText(file)}`);
    }

    const dirtyPaths = await getDirtySelectedPaths({
      repositoryRoot,
      gitPath,
      gitEnv,
      selectedFiles
    });

    if (dirtyPaths.length > 0) {
      log(`Warning: ${dirtyPaths.length} selected file(s) have local changes`);
      for (const file of dirtyPaths) {
        log(`  ! ${escapeLogText(file)}`);
      }

      const shouldContinue = await confirmDirtyFileCheckout(
        branch.ref,
        dirtyPaths
      );
      if (!shouldContinue) {
        log("Canceled: local changes were not overwritten");
        return;
      }
    }

    await checkoutSelectedFiles({
      branchRef: branch.ref,
      repositoryRoot,
      gitPath,
      gitEnv,
      selectedFiles
    });

    try {
      await repository.status();
    } catch (error) {
      log(`Repository refresh warning: ${formatError(error)}`);
      await vscode.commands.executeCommand("git.refresh", repository);
    }

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    log(`Completed successfully in ${elapsedSeconds}s`);

    const showOutputAction = "Show Output";
    const action = await vscode.window.showInformationMessage(
      `Checked out ${selectedFiles.length} file(s) from ${branch.ref}.`,
      showOutputAction
    );
    if (action === showOutputAction) {
      showOutput(true);
    }
  } catch (error) {
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    logFailure(error, elapsedSeconds);
    revealOutputForMode("onError");

    const message =
      error && error.code === "GIT_CANCELLED"
        ? "Branch file checkout was canceled."
        : `Branch file checkout failed: ${formatError(error)}`;
    await vscode.window.showErrorMessage(message);
  }
}

async function confirmDirtyFileCheckout(branchRef, dirtyPaths) {
  const shouldConfirm = vscode.workspace
    .getConfiguration("branchFileCheckout")
    .get("confirmDirtyFiles", true);
  if (!shouldConfirm) {
    return true;
  }

  const checkoutAction = "Checkout and Overwrite";
  const message =
    dirtyPaths.length === 1
      ? `${dirtyPaths[0]} has local changes that may be overwritten by ${branchRef}.`
      : `${dirtyPaths.length} selected files have local changes that may be overwritten by ${branchRef}.`;
  const choice = await vscode.window.showWarningMessage(
    message,
    { modal: true, detail: "Review the Branch File Checkout Output for paths." },
    checkoutAction
  );
  return choice === checkoutAction;
}

module.exports = {
  checkoutFilesFromBranch
};
