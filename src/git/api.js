"use strict";

const vscode = require("vscode");

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

module.exports = {
  getGitApi
};
