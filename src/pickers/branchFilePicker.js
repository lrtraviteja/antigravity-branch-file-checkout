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
      alwaysShow: true,
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

  const selectedFiles = new Set();
  const selectedVisibleFiles = new Set();
  const maxResults = 512;
  let accepted = false;
  let visibleItems = [];
  let debounceTimer = null;
  const debounceMs = allItems.length > 1000 ? 150 : (allItems.length > 500 ? 100 : 50);

  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick();
    picker.canSelectMany = true;
    picker.matchOnDescription = true;
    picker.matchOnDetail = false;
    picker.ignoreFocusOut = false;
    picker.title = `Select Files from ${branchRef}`;
    picker.placeholder =
      "Search files by name (append : to go to line or @ to go to symbol)";

    let isUpdatingItems = false;

    const setVisibleItems = () => {
      isUpdatingItems = true;
      // map to shallow copy to force VS Code to redraw highlights
      visibleItems = filterFilePickerItems(allItems, picker.value, maxResults).map(item => ({ ...item }));
      
      if (picker.value) {
        log(`--- Mathematical Highlight Ranges for "${picker.value}" ---`);
        for (const item of visibleItems.slice(0, 5)) {
          log(`[${item.basename}] Label: ${JSON.stringify(item.highlights?.label)} | Desc: ${JSON.stringify(item.highlights?.description)}`);
        }
      }

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
      isUpdatingItems = false;
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
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          setVisibleItems();
          debounceTimer = null;
        }, debounceMs);
      }),
      picker.onDidChangeSelection((selection) => {
        if (isUpdatingItems) return;
        syncVisibleSelection(selection);
      }),
      picker.onDidAccept(() => {
        syncVisibleSelection(picker.selectedItems);
        if (selectedFiles.size === 0 && picker.activeItems[0]) {
          selectedFiles.add(picker.activeItems[0].file);
        }
        accepted = true;
        picker.hide();
        log(`[IPC] User accepted QuickPick. Selected files: ${[...selectedFiles]}`);
        resolve([...selectedFiles]);
      }),
      picker.onDidHide(() => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
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
