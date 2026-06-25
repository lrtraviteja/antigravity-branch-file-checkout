"use strict";

const vscode = require("vscode");
const {
  initializeOutputChannel,
  log,
  showOutput
} = require("./src/logging/output");
const {
  checkoutFilesFromBranch
} = require("./src/workflow/checkoutFilesFromBranch");

const CHECKOUT_COMMAND = "branchFileCheckout.checkoutFilesFromBranch";
const SHOW_OUTPUT_COMMAND = "branchFileCheckout.showOutput";

function activate(context) {
  initializeOutputChannel(context);

  context.subscriptions.push(
    vscode.commands.registerCommand(CHECKOUT_COMMAND, (scmContext) =>
      checkoutFilesFromBranch(context, scmContext)
    ),
    vscode.commands.registerCommand(SHOW_OUTPUT_COMMAND, () => showOutput(true))
  );

  log("Extension activated");
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
