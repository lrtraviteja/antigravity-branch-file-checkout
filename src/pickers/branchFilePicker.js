"use strict";

const path = require("node:path");
const vscode = require("vscode");
const { createFilePickerItems } = require("../filePicker");
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

  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick();
    picker.canSelectMany = true;
    picker.matchOnDescription = true;
    picker.matchOnDetail = false;
    picker.ignoreFocusOut = false;
    picker.title = `Select Files from ${branchRef}`;
    picker.placeholder = "Search files by name (append : to go to line or @ to go to symbol)";
    
    // Assign items exactly ONCE. The Main Process handles all fuzzy filtering, sorting, and highlighting!
    picker.items = allItems;
    
    picker.onDidChangeSelection((selection) => {
      picker.title = `Select Files from ${branchRef} - ${selection.length} selected`;
    });

    let accepted = false;

    picker.onDidAccept(() => {
      accepted = true;
      picker.hide();
      
      const selected = picker.selectedItems;
      log(`[IPC] User accepted QuickPick. Received ${selected.length} checked items from the Main Process.`);
      
      if (selected.length > 0) {
        resolve(selected.map(item => item.file));
      } else if (picker.activeItems.length > 0) {
        log(`[IPC] Fallback: No checked items. Using active item: ${picker.activeItems[0].file}`);
        resolve([picker.activeItems[0].file]);
      } else {
        log(`[IPC] No items checked or active.`);
        resolve(undefined);
      }
    });

    picker.onDidHide(() => {
      picker.dispose();
      if (!accepted) {
        log(`[IPC] QuickPick was cancelled/hidden by the user.`);
        resolve(undefined);
      }
    });

    log(`[IPC] Handing ${allItems.length} items to the Main Process for native filtering and highlighting...`);
    picker.show();
  });
}

module.exports = {
  pickFiles
};
