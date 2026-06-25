"use strict";

const path = require("node:path");
const vscode = require("vscode");
const {
  createFilePickerItems,
  filterFilePickerItems,
  filterScoredItems,
  getFileIcon
} = require("./src/filePicker");
const { GitCommandError, runGit } = require("./src/git");
const {
  buildPathspecInput,
  parseBranches,
  parseLsTree,
  parsePorcelainPaths,
  sortBranches
} = require("./src/parsers");

const CHECKOUT_COMMAND = "branchFileCheckout.checkoutFilesFromBranch";
const SHOW_OUTPUT_COMMAND = "branchFileCheckout.showOutput";
const OUTPUT_CHANNEL_NAME = "Branch File Checkout";

/** @type {vscode.OutputChannel | undefined} */
let outputChannel;

function activate(context) {
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(CHECKOUT_COMMAND, (scmContext) =>
      checkoutFilesFromBranch(context, scmContext)
    ),
    vscode.commands.registerCommand(SHOW_OUTPUT_COMMAND, () =>
      outputChannel.show(true)
    )
  );

  log("Extension activated");
}

function deactivate() {}

async function checkoutFilesFromBranch(context, scmContext) {
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

    const branch = await pickBranch({
      repository,
      repositoryRoot,
      gitPath,
      gitEnv
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

    const selectedFiles = await pickFiles(
      files,
      branch.ref,
      repositoryRoot,
      context.extensionUri
    );
    if (!selectedFiles || selectedFiles.length === 0) {
      log("Canceled: no files were selected");
      return;
    }

    log(`Files selected: ${selectedFiles.length}`);
    for (const file of selectedFiles) {
      log(`  - ${escapeLogText(file)}`);
    }

    const pathspecInput = buildPathspecInput(selectedFiles);
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

    const checkoutStartedAt = Date.now();
    const checkoutArgs = [
      "checkout",
      "-q",
      `--pathspec-from-file=-`,
      "--pathspec-file-nul",
      branch.ref
    ];
    logGitArgs("checkout", checkoutArgs);

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Checking out ${selectedFiles.length} file(s) from ${branch.ref}`,
        cancellable: true
      },
      (_progress, token) =>
        runGit(gitPath, repositoryRoot, checkoutArgs, {
          env: gitEnv,
          input: pathspecInput,
          token
        })
    );

    logGitResult(result, checkoutStartedAt);

    try {
      await repository.status();
    } catch (error) {
      log(`Repository refresh warning: ${formatError(error)}`);
      await vscode.commands.executeCommand("git.refresh", repository);
    }

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    log(`Completed successfully in ${elapsedSeconds}s`);

    const showOutput = "Show Output";
    const action = await vscode.window.showInformationMessage(
      `Checked out ${selectedFiles.length} file(s) from ${branch.ref}.`,
      showOutput
    );
    if (action === showOutput) {
      outputChannel.show(true);
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

async function getGitApi() {
  const gitExtension = vscode.extensions.getExtension("vscode.git");
  if (!gitExtension) {
    throw new Error("The built-in Git extension is not available.");
  }

  const exports = gitExtension.isActive
    ? gitExtension.exports
    : await gitExtension.activate();
  if (!exports || typeof exports.getAPI !== "function") {
    throw new Error("The built-in Git extension API is unavailable.");
  }

  return exports.getAPI(1);
}

async function resolveRepository(gitApi, scmContext) {
  const contextUri = getContextUri(scmContext);
  if (contextUri) {
    const contextRepository = gitApi.getRepository(contextUri);
    if (contextRepository) {
      return contextRepository;
    }
  }

  const repositories = [...gitApi.repositories];
  const selectedRepositories = repositories.filter(
    (repository) => repository.ui && repository.ui.selected
  );
  if (selectedRepositories.length === 1) {
    return selectedRepositories[0];
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const activeRepository = gitApi.getRepository(activeUri);
    if (activeRepository) {
      return activeRepository;
    }
  }

  if (repositories.length === 1) {
    return repositories[0];
  }

  if (repositories.length === 0) {
    await vscode.window.showWarningMessage("No open Git repositories found.");
    return undefined;
  }

  const repositoryItems = repositories.map((repository) => ({
    label: path.basename(repository.rootUri.fsPath),
    description: repository.rootUri.fsPath,
    repository
  }));

  const picked = await vscode.window.showQuickPick(repositoryItems, {
    title: "Checkout Files from Branch",
    placeHolder: "Select a Git repository",
    matchOnDescription: true,
    ignoreFocusOut: true
  });
  return picked?.repository;
}

function getContextUri(scmContext) {
  if (!scmContext) {
    return undefined;
  }

  const candidates = [
    scmContext.rootUri,
    scmContext.resourceUri,
    scmContext.sourceControl?.rootUri,
    scmContext.repository?.rootUri
  ];

  for (const candidate of candidates) {
    if (candidate instanceof vscode.Uri) {
      return candidate;
    }
    if (candidate && typeof candidate === "object" && candidate.scheme) {
      return vscode.Uri.from(candidate);
    }
  }

  return undefined;
}

async function pickBranch({ repository, repositoryRoot, gitPath, gitEnv }) {
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
  log(
    `Branches discovered: ${branches.length} in ${Date.now() - startedAt}ms`
  );

  if (branches.length === 0) {
    await vscode.window.showWarningMessage(
      "No local or remote Git branches were found."
    );
    return undefined;
  }

  const currentBranch = repository.state.HEAD?.name;
  const localItems = branches
    .filter((branch) => branch.kind === "local")
    .map((branch) => toBranchQuickPickItem(branch, currentBranch));
  const remoteItems = branches
    .filter((branch) => branch.kind === "remote")
    .map((branch) => toBranchQuickPickItem(branch, currentBranch));

  return pickBranchItem(localItems, remoteItems);
}

function toBranchQuickPickItem(branch, currentBranch) {
  const isCurrent =
    branch.kind === "local" && branch.name === currentBranch;
  const descriptionParts = [];
  if (branch.commitRelativeDate) {
    descriptionParts.push(branch.commitRelativeDate);
  }
  if (isCurrent) {
    descriptionParts.push("current");
  }

  return {
    label: branch.name,
    description: descriptionParts.join(" - ") || undefined,
    detail: buildBranchDetail(branch),
    iconPath:
      branch.kind === "remote" ? new vscode.ThemeIcon("cloud") : undefined,
    branch
  };
}

function pickBranchItem(localItems, remoteItems) {
  const maxResults = 512;
  let accepted = false;

  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick();
    picker.canSelectMany = false;
    picker.matchOnDescription = false;
    picker.matchOnDetail = false;
    picker.ignoreFocusOut = true;
    picker.placeholder = "Select a local or remote branch to checkout files from";

    const setVisibleItems = () => {
      const filteredLocalItems = filterBranchItems(
        localItems,
        picker.value,
        maxResults
      );
      const remainingLimit = Math.max(0, maxResults - filteredLocalItems.length);
      const filteredRemoteItems = filterBranchItems(
        remoteItems,
        picker.value,
        remainingLimit
      );
      const items = [];

      if (filteredLocalItems.length > 0) {
        items.push({
          label: "branches",
          kind: vscode.QuickPickItemKind.Separator
        });
        items.push(...filteredLocalItems);
      }
      if (filteredRemoteItems.length > 0) {
        items.push({
          label: "remote branches",
          kind: vscode.QuickPickItemKind.Separator
        });
        items.push(...filteredRemoteItems);
      }

      picker.items = items;
      picker.activeItems =
        items.find((item) => item.kind !== vscode.QuickPickItemKind.Separator)
          ? [items.find((item) => item.kind !== vscode.QuickPickItemKind.Separator)]
          : [];
      picker.busy = false;
    };

    const disposables = [
      picker.onDidChangeValue(() => {
        picker.busy = true;
        setVisibleItems();
      }),
      picker.onDidAccept(() => {
        const picked = picker.activeItems.find(
          (item) => item.kind !== vscode.QuickPickItemKind.Separator
        );
        accepted = true;
        picker.hide();
        resolve(picked?.branch);
      }),
      picker.onDidHide(() => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
        picker.dispose();
        if (!accepted) {
          resolve(undefined);
        }
      })
    ];

    log(
      `Opening branch picker with ${localItems.length} local and ${remoteItems.length} remote branch item(s)`
    );
    setVisibleItems();
    picker.show();
  });
}

function filterBranchItems(items, query, limit) {
  return filterScoredItems(
    items,
    query,
    (item) => [
      { role: "label", value: item.label },
      { role: "description", value: item.description },
      { role: "path", value: item.branch?.ref },
      { role: "extra", value: item.detail },
      { role: "extra", value: item.branch?.kind },
      { role: "extra", value: item.branch?.author },
      { role: "extra", value: item.branch?.subject },
      { role: "extra", value: item.branch?.commit }
    ],
    limit
  );
}

function buildBranchDetail(branch) {
  const parts = [branch.author, branch.commit, branch.subject].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : undefined;
}

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

async function pickFiles(files, branchRef, repositoryRoot, extensionUri) {
  const allItems = createFilePickerItems(files, repositoryRoot).map((item) => ({
    label: item.basename,
    description: item.displayDirectory,
    iconPath: getFileQuickPickIconPath(item.basename, extensionUri),
    alwaysShow: true,
    file: item.file,
    basename: item.basename,
    displayDirectory: item.displayDirectory
  }));
  const selectedFiles = new Set();
  const selectedVisibleFiles = new Set();
  const maxResults = 512;
  let accepted = false;
  let visibleItems = [];

  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick();
    picker.canSelectMany = true;
    picker.matchOnDescription = true;
    picker.matchOnDetail = false;
    picker.ignoreFocusOut = true;
    picker.placeholder =
      "Search files by name (append : to go to line or @ to go to symbol)";

    const setVisibleItems = () => {
      visibleItems = filterFilePickerItems(allItems, picker.value, maxResults);
      picker.items = visibleItems;
      const checkedVisibleItems = visibleItems.filter((item) =>
        selectedFiles.has(item.file)
      );
      selectedVisibleFiles.clear();
      for (const item of checkedVisibleItems) {
        selectedVisibleFiles.add(item.file);
      }
      picker.selectedItems = checkedVisibleItems;
      picker.activeItems = visibleItems.length > 0 ? [visibleItems[0]] : [];
      picker.busy = false;
      picker.buttons = [];
    };

    const syncVisibleSelection = (selection) => {
      const nextVisibleFiles = new Set(selection.map((item) => item.file));
      for (const item of selection) {
        selectedFiles.add(item.file);
      }
      for (const file of selectedVisibleFiles) {
        if (!nextVisibleFiles.has(file)) {
          selectedFiles.delete(file);
        }
      }
      selectedVisibleFiles.clear();
      for (const file of nextVisibleFiles) {
        selectedVisibleFiles.add(file);
      }
    };

    const disposables = [
      picker.onDidChangeValue(() => {
        picker.busy = true;
        setVisibleItems();
      }),
      picker.onDidChangeSelection((selection) => {
        syncVisibleSelection(selection);
      }),
      picker.onDidAccept(() => {
        syncVisibleSelection(picker.selectedItems);
        if (selectedFiles.size === 0 && picker.activeItems[0]) {
          selectedFiles.add(picker.activeItems[0].file);
        }
        accepted = true;
        picker.hide();
        resolve([...selectedFiles]);
      }),
      picker.onDidHide(() => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
        picker.dispose();
        if (!accepted) {
          resolve(undefined);
        }
      })
    ];

    log(`Opening native file picker with ${allItems.length} item(s)`);
    setVisibleItems();
    picker.show();
  });
}

function getFileQuickPickIconPath(basename, extensionUri) {
  const icon = getFileIcon(basename);
  const assetSegments = icon.assetPath.split(/[\\/]/).filter(Boolean);
  return vscode.Uri.joinPath(
    extensionUri,
    "assets",
    "theme-symbols",
    ...assetSegments
  );
}

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

function revealOutputForMode(requiredMode) {
  const configuredMode = vscode.workspace
    .getConfiguration("branchFileCheckout")
    .get("revealOutput", "onError");
  if (configuredMode === requiredMode) {
    outputChannel.show(true);
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
  if (error instanceof GitCommandError) {
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
  outputChannel.appendLine("");
  outputChannel.appendLine("=".repeat(72));
}

function log(message) {
  outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
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
  activate,
  deactivate
};
