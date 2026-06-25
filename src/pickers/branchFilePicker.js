"use strict";

const path = require("node:path");
const vscode = require("vscode");
const {
  createFilePickerItems,
  filterFilePickerItems
} = require("../filePicker");
const { log } = require("../logging/output");

async function pickFiles(files, branchRef, repositoryRoot) {
  // Determine extension root depending on whether we are running from src/pickers or dist/
  const isSrc = __dirname.includes('pickers');
  const extensionRoot = path.resolve(__dirname, isSrc ? '../../' : '../');

  // Check if VS Code allows us to use the Proposed API for resourceUri
  let useResourceUri = false;
  try {
    const testPicker = vscode.window.createQuickPick();
    testPicker.items = [{ label: 'test', resourceUri: vscode.Uri.file(__filename) }];
    useResourceUri = true;
    testPicker.dispose();
  } catch (e) {
    useResourceUri = false;
  }

  const allItems = createFilePickerItems(files, repositoryRoot).map((item) => {
    const pickItem = {
      label: item.basename,
      description: item.displayDirectory,
      alwaysShow: true,
      file: item.file,
      basename: item.basename,
      displayDirectory: item.displayDirectory
    };

    if (useResourceUri) {
      pickItem.resourceUri = vscode.Uri.file(path.join(repositoryRoot, item.file));
    } else {
      pickItem.iconPath = vscode.Uri.file(path.join(extensionRoot, "assets", "theme-symbols", item.assetPath));
    }

    return pickItem;
  });
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
    picker.title = `Select Files from ${branchRef}`;
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
      picker.title = `Select Files from ${branchRef} - ${selectedFiles.size} selected`;
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

    log(`Opening multi-select file picker with ${allItems.length} item(s)`);
    setVisibleItems();
    picker.show();
  });
}

module.exports = {
  pickFiles
};
