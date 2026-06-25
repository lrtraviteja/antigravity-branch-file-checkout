"use strict";

const path = require("node:path");
const vscode = require("vscode");
const { escapeLogText, log } = require("../logging/output");

async function resolveRepository(gitApi, scmContext) {
  const contextUri = getContextUri(scmContext);
  if (contextUri) {
    const contextRepository = gitApi.getRepository(contextUri);
    if (contextRepository) {
      log(`Repository selected from SCM context: ${escapeLogText(contextRepository.rootUri.fsPath)}`);
      return contextRepository;
    }
  }

  const repositories = [...gitApi.repositories];
  const selectedRepositories = repositories.filter(
    (repository) => repository.ui && repository.ui.selected
  );
  if (selectedRepositories.length === 1) {
    log(`Repository selected from Git UI state: ${escapeLogText(selectedRepositories[0].rootUri.fsPath)}`);
    return selectedRepositories[0];
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const activeRepository = gitApi.getRepository(activeUri);
    if (activeRepository) {
      log(`Repository selected from active editor: ${escapeLogText(activeRepository.rootUri.fsPath)}`);
      return activeRepository;
    }
  }

  if (repositories.length === 1) {
    log(`Repository auto-selected: ${escapeLogText(repositories[0].rootUri.fsPath)}`);
    return repositories[0];
  }

  if (repositories.length === 0) {
    await vscode.window.showWarningMessage("No open Git repositories found.");
    return undefined;
  }

  const repositoryItems = repositories.map((repository) => ({
    label: path.basename(repository.rootUri.fsPath),
    description: repository.rootUri.fsPath,
    iconPath: new vscode.ThemeIcon("repo"),
    repository
  }));

  log(`Opening repository picker with ${repositoryItems.length} repository item(s)`);
  const picked = await vscode.window.showQuickPick(repositoryItems, {
    title: "Checkout Files from Branch",
    placeHolder: "Select a Git repository",
    matchOnDescription: true,
    ignoreFocusOut: true
  });
  if (picked?.repository) {
    log(`Repository picked manually: ${escapeLogText(picked.repository.rootUri.fsPath)}`);
  }
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

module.exports = {
  resolveRepository
};
