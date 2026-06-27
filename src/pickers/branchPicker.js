"use strict";

const vscode = require("vscode");
const { filterScoredItems } = require("../filePicker");
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
    alwaysShow: true,
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
    picker.title = "Checkout Files from Branch";
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
      const firstItem = items.find(
        (item) => item.kind !== vscode.QuickPickItemKind.Separator
      );
      picker.activeItems = firstItem ? [firstItem] : [];
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
        if (picked?.branch) {
          log(`Branch picked: ${escapeLogText(picked.branch.ref)}`);
        }
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
  return parts.length > 0 ? parts.join(" - ") : undefined;
}

module.exports = {
  pickBranch
};
