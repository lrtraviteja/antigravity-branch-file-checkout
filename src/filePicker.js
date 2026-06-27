"use strict";

const path = require("node:path");
const SYMBOL_ICON_THEME = require("../assets/theme-symbols/symbol-icon-theme.json");

const QUERY_MAX_LENGTH = 64;


function createFilePickerItems(files, repositoryRoot) {
  const repositoryName = path.basename(repositoryRoot);
  return files.map((file, index) => {
    const directory = path.posix.dirname(file);
    const basename = path.posix.basename(file);
    const displayDirectory =
      directory === "."
        ? repositoryName
        : `${repositoryName}\\${directory.replaceAll("/", "\\")}`;
    const icon = getFileIcon(basename);

    return {
      index,
      file,
      basename,
      directory,
      displayDirectory,
      searchText: `${basename} ${file}`.toLowerCase(),
      iconLabel: icon.label,
      iconClass: icon.className,
      assetPath: icon.assetPath
    };
  });
}

function getFileIcon(basename) {
  const assetName = resolveThemeIconName(basename);
  const definition = SYMBOL_ICON_THEME.iconDefinitions?.[assetName];
  const assetPath = String(
    definition?.iconPath || `./icons/files/${assetName}.svg`
  )
    .trim()
    .replace(/^\.\//, "");

  return {
    label: assetName,
    className: `icon-${assetName}`,
    assetName,
    assetPath
  };
}

function resolveThemeIconName(basename) {
  const normalizedName = basename.toLowerCase();
  const fileNames = SYMBOL_ICON_THEME.fileNames || {};
  const exactNameMatch = fileNames[normalizedName];
  if (exactNameMatch) {
    return exactNameMatch;
  }

  const extensionMatch = resolveExtensionThemeIconName(normalizedName);
  return extensionMatch || SYMBOL_ICON_THEME.file || "document";
}

function resolveExtensionThemeIconName(normalizedName) {
  const fileExtensions = SYMBOL_ICON_THEME.fileExtensions || {};
  const languageIds = SYMBOL_ICON_THEME.languageIds || {};

  if (normalizedName.startsWith(".env")) {
    return fileExtensions.env;
  }

  const parts = normalizedName.split(".");
  for (let index = 0; index < parts.length; index += 1) {
    const candidate = parts.slice(index).join(".");
    if (candidate && fileExtensions[candidate]) {
      return fileExtensions[candidate];
    }
    if (candidate && languageIds[candidate]) {
      return languageIds[candidate];
    }
  }

  return undefined;
}

module.exports = {
  createFilePickerItems,
  getFileIcon,
  resolveThemeIconName
};
