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

  let useResourceUri = false;
  try {
    const testPicker = vscode.window.createQuickPick();
    testPicker.items = [{ label: 'test', resourceUri: vscode.Uri.file(__filename) }];
    useResourceUri = true;
    testPicker.dispose();
  } catch (e) {
    useResourceUri = false;
  }
  
  if (useResourceUri) {
    log("Using both iconPath and resourceUri (API available).");
  } else {
    log("Falling back to iconPath only (resourceUri API unavailable).");
  }

  const allItems = createFilePickerItems(files, repositoryRoot).map((item) => {
    const pickItem = {
      label: item.basename,
      description: item.displayDirectory,
      file: item.file,
      basename: item.basename,
      displayDirectory: item.displayDirectory,
      iconPath: vscode.Uri.file(path.join(extensionRoot, "assets", "theme-symbols", item.assetPath))
    };
    
    if (useResourceUri) {
      pickItem.resourceUri = vscode.Uri.file(path.join(repositoryRoot, item.file));
    }
    
    return pickItem;
  });

  let accepted = false;

  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick();
    picker.canSelectMany = true;
    picker.matchOnDescription = true;
    picker.matchOnDetail = false;
    picker.ignoreFocusOut = false;
    picker.title = `Select Files from ${branchRef}`;
    picker.placeholder =
      "Search files by name (append : to go to line or @ to go to symbol)";

    picker.items = allItems;
    picker.activeItems = allItems.length > 0 ? [allItems[0]] : [];

    const disposables = [
      picker.onDidAccept(() => {
        let result = picker.selectedItems.map((item) => item.file);
        if (result.length === 0 && picker.activeItems[0]) {
          result = [picker.activeItems[0].file];
        }
        accepted = true;
        picker.hide();

        log(`[IPC] User accepted QuickPick. Received ${result.length} files from the Main Process.`);
        resolve(result);
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
    picker.show();
  });
}

module.exports = {
  pickFiles
};
