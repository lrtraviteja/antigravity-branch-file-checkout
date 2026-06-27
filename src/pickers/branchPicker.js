"use strict";

const vscode = require("vscode");
const { escapeLogText, log } = require("../logging/output");

async function pickBranch({ branches, currentBranch }) {
  if (branches.length === 0) {
    await vscode.window.showWarningMessage(
      "No local or remote Git branches were found."
    );
    return undefined;
  }

  const localItems = branches
    .filter((branch) => branch.kind === "local")
    .map((branch) => toBranchQuickPickItem(branch, currentBranch));
  const remoteItems = branches
    .filter((branch) => branch.kind === "remote")
    .map((branch) => toBranchQuickPickItem(branch, currentBranch));

  return pickBranchItem(localItems, remoteItems);
}

function toBranchQuickPickItem(branch, currentBranch) {
  const isCurrent = branch.kind === "local" && branch.name === currentBranch;
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
  let accepted = false;

  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick();
    picker.canSelectMany = false;
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;
    picker.ignoreFocusOut = true;
    picker.title = "Checkout Files from Branch";
    picker.placeholder = "Select a local or remote branch to checkout files from";

    const items = [];
    if (localItems.length > 0) {
      items.push({
        label: "branches",
        kind: vscode.QuickPickItemKind.Separator
      });
      items.push(...localItems);
    }
    if (remoteItems.length > 0) {
      items.push({
        label: "remote branches",
        kind: vscode.QuickPickItemKind.Separator
      });
      items.push(...remoteItems);
    }

    picker.items = items;

    picker.onDidAccept(() => {
      const picked = picker.activeItems.find(
        (item) => item.kind !== vscode.QuickPickItemKind.Separator
      );
      accepted = true;
      picker.hide();
      if (picked?.branch) {
        log(`Branch picked: ${escapeLogText(picked.branch.ref)}`);
      }
      resolve(picked?.branch);
    });

    picker.onDidHide(() => {
      picker.dispose();
      if (!accepted) {
        resolve(undefined);
      }
    });

    log(
      `Opening branch picker with ${localItems.length} local and ${remoteItems.length} remote branch item(s)`
    );
    picker.show();
  });
}

function buildBranchDetail(branch) {
  const parts = [branch.author, branch.commit, branch.subject].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : undefined;
}

module.exports = {
  pickBranch
};
