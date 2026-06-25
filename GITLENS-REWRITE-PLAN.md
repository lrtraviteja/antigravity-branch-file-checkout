# GitLens Reference Rewrite Plan

Date: 2026-06-25

Goal: rebuild Branch File Checkout with a cleaner GitLens-style flow while keeping our required behavior:

- choose the correct repository from Source Control context
- choose a local or remote branch
- search files from that branch with Ctrl+P-like fuzzy matching
- show file icons
- support multi-select files
- run `git checkout <branch> -- <selected files>`
- log selected repo, selected branch, selected files, command, and result

## Findings

### Installed GitLens

- Installed extension found at `C:\Users\lrtra\.antigravity-ide\extensions\eamodio.gitlens-18.2.0-universal`.
- Installed package is bundled into `dist`, so readable architecture is better studied from the public source.
- Public source was checked out to `C:\Users\lrtra\Downloads\plugins\gitlens-source`.

### GitLens API Boundary

- GitLens exposes a small public API, not its internal repository services or picker services.
- Its internal pickers are not a stable API for this extension.
- So the extension should not depend on GitLens at runtime.
- We can copy patterns from MIT-licensed source carefully, but not wire to private internals.

### Source Control Integration

- GitLens contributes commands and SCM menu entries.
- It does not get a hidden private Source Control picker API for branch/file checkout.
- Our current `scm/title` and `scm/repository` menu contribution is the right route for showing the action near repos.

### Branch Picker Pattern

Reference: `gitlens-source/src/quickpicks/branchPicker.ts`

- Uses `window.createQuickPick()`.
- Sets:
  - `matchOnDescription = true`
  - `matchOnDetail = true`
  - `ignoreFocusOut`
- Accepts the active item on Enter.
- Branch items are prepared outside the picker, then passed in.

Implication for our rewrite:

- Keep a dedicated `branchPicker` module.
- Build branch items with local/remote/current metadata.
- Apply our Ctrl+P-like scorer before assigning `quickpick.items`, because extension QuickPick filtering alone is not equal to Ctrl+P.

### Revision File Picker Pattern

Reference: `gitlens-source/src/quickpicks/revisionFilesPicker.ts`

- Uses `window.createQuickPick()`.
- Sets placeholder to `Search files by name`.
- Uses `matchOnDescription = true`.
- Gets files from a Git tree for a revision.
- Sets `resourceUri` and `ThemeIcon.File` / `ThemeIcon.Folder` when supported.
- Supports navigation behavior for folders.
- Does not support multi-select in that picker.

Implication for our rewrite:

- We need our own file picker, not GitLens' exact one.
- It should use `canSelectMany = true`.
- It should set `resourceUri` to get IDE/native icon theming where possible.
- It should also keep the copied Symbol icon theme fallback for extensions where `resourceUri` is not enough.

### Wizard Pattern

Reference: `gitlens-source/src/commands/quick-wizard/quickWizardCommandBase.ts`

- GitLens splits complex flows into steps.
- Each step owns title, placeholder, items, selected items, and accept behavior.
- It has explicit cleanup of quick input disposables.
- Multi-select support is handled centrally:
  - `quickpick.canSelectMany`
  - `quickpick.selectedItems`
  - `onDidChangeSelection`
  - accept selected items instead of only active item

Implication for our rewrite:

- Split one large command into workflow steps.
- Add a tiny local wizard helper only if it removes duplication.
- Do not overbuild the whole GitLens wizard framework.

### Switch/Checkout Workflow

Reference: `gitlens-source/src/commands/git/switch.ts`

- GitLens switch command flow:
  - pick repo
  - pick branch/tag
  - confirm action
  - run git operation with progress
- For remote branches it handles local branch creation/switch details.

Implication for our rewrite:

- Our workflow is simpler:
  - pick repo
  - pick branch
  - list files in branch
  - multi-select files
  - run path-limited checkout
- Remote branch selection is valid as the checkout source ref, for example `upstream/dev`.

### Repository Picker Pattern

Reference: `gitlens-source/src/quickpicks/repositoryPicker.ts`

- Auto-picks when only one repository exists and there is no ambiguity.
- Supports multi-repo selection elsewhere, but our feature should use one repo at a time.
- Separates directive/action rows from selectable repo rows.

Implication for our rewrite:

- Use the Source Control command context when available.
- If context is missing, auto-pick the only repo.
- If multiple repos exist, show a repo picker.
- Log how the repo was selected.

### Ctrl+P Search Reality

- VS Code/Antigravity Ctrl+P is implemented in workbench internals, not extension API.
- Public extension API gives `QuickPick` filtering and `matchOnDescription` / `matchOnDetail`, but not the exact internal Ctrl+P provider.
- Therefore exact internal Ctrl+P cannot be called directly from this extension.

### Antigravity Internal Quick Access Search

Searched local Antigravity install:

- `C:\Users\lrtra\AppData\Local\Programs\Antigravity IDE\resources\app\out\vs\workbench\workbench.desktop.main.js`
- `C:\Users\lrtra\AppData\Local\Programs\Antigravity IDE\resources\app\out\vs\workbench\api\node\extensionHostProcess.js`
- `C:\Users\lrtra\.antigravity-ide`
- `C:\Users\lrtra\.gemini\antigravity-ide`

Findings:

- The app contains the internal quick access registry under `workbench.contributions.quickaccess`.
- `workbench.action.quickOpen` calls the internal quick access service: `quickAccess.show(...)`.
- Internal providers are registered through the workbench registry, not normal extension API imports.
- Antigravity also exposes a nonstandard extension-host bridge called `vscode.cider.registerQuickAccessProvider(...)`.
- That bridge validates non-empty prefixes, calls provider `getItems(query)`, and receives one accepted item through `itemAccepted(item, ...)`.
- The bridge item conversion supports fields like label, description, detail, icon path, and resource-based icon classes.
- The bridge does not expose a selected-items/multi-select contract.

Decision:

- Do not use internal workbench imports from a VSIX extension.
- Do not use `vscode.cider.registerQuickAccessProvider(...)` for the checkout file picker because it is single-accept oriented and does not satisfy the multi-select requirement.
- Keep normal `window.createQuickPick()` for the file picker because it supports `canSelectMany`.
- Reuse the observed internal behavior only as guidance:
  - resource-based file icons
  - quick access item shape
  - prefix/search mental model
  - active item accept behavior for single-pick branch/repo steps

Required local behavior:

- Keep our own Ctrl+P-like scorer.
- Support space-separated positive terms:
  - `ht ctc`
- Support negative terms:
  - `-rest`
  - `-php`
- Rank matches by basename, path, contiguous match, acronym-like match, and order.
- Apply the same scorer to branch search and file search.

## Proposed New Structure

```text
src/
  extension.js
  context.js
  workflow/
    checkoutFilesFromBranch.js
  pickers/
    repositoryPicker.js
    branchPicker.js
    branchFilePicker.js
    items.js
  git/
    api.js
    cli.js
    branches.js
    tree.js
    status.js
    checkout.js
  search/
    quickAccessScorer.js
  icons/
    fileIcons.js
  logging/
    output.js
  parsers.js
```

## Implementation Steps

1. Create `logging/output.js`.
   - Centralize output channel.
   - Log repo, branch, files, commands, stdout/stderr, timings.

2. Create Git service modules.
   - `branches.js`: parse local/remote branches with current/upstream/commit metadata.
   - `tree.js`: list files from selected ref.
   - `checkout.js`: run `git checkout <branch> -- <files>`.
   - `status.js`: detect dirty files before overwrite confirmation.

3. Create shared picker item factories.
   - Branch item factory.
   - File item factory.
   - Repo item factory.
   - Keep labels/descriptions/details consistent.

4. Create shared search scorer.
   - Use for both branch and file pickers.
   - Preserve existing tests and add cases for:
     - `ht ctc -rest -php`
     - `up dev`
     - `upstream/dev`
     - basename preferred over folder-only matches

5. Rebuild repo picker.
   - Source Control context first.
   - Git extension repositories second.
   - QuickPick fallback when ambiguous.

6. Rebuild branch picker.
   - GitLens-style `createQuickPick`.
   - Local and remote sections.
   - Same scorer as file search.
   - Log chosen branch.

7. Rebuild file picker.
   - GitLens-style `createQuickPick`.
   - `canSelectMany = true`.
   - `resourceUri` for native file icons.
   - copied Symbol icon fallback where needed.
   - selected count in title/buttons.
   - same scorer as Ctrl+P-like search.
   - log selected files.

8. Rebuild main workflow.
   - Repo -> branch -> files -> dirty confirmation -> checkout.
   - Use `window.withProgress`.
   - Show success/failure messages.
   - Reveal output depending on setting.

9. Package and install.
   - Build minified `dist/extension.js`.
   - Package VSIX.
   - Install into Antigravity.
   - Run test suite before package.

## Implementation Notes

Completed on 2026-06-25:

- Split the large root `extension.js` into GitLens-style modules:
  - `src/workflow/checkoutFilesFromBranch.js`
  - `src/pickers/repositoryPicker.js`
  - `src/pickers/branchPicker.js`
  - `src/pickers/branchFilePicker.js`
  - `src/git/api.js`
  - `src/git/branches.js`
  - `src/git/tree.js`
  - `src/git/status.js`
  - `src/git/checkout.js`
  - `src/logging/output.js`
- Kept the tested parser and git process helpers:
  - `src/parsers.js`
  - `src/git.js`
- File picker now prefers `resourceUri` for each branch file so Antigravity can render the active file icon theme like Ctrl+P.
- The copied Symbol icon theme assets remain packaged as fallback/reference assets, but the picker no longer forces custom `iconPath` over native file-theme rendering.
- Branch and file search continue to use the shared Ctrl+P-like scorer in `src/filePicker.js`.
- Multi-select remains implemented with `window.createQuickPick()` and `canSelectMany = true`.
- Output logging is centralized and logs:
  - selected repository
  - selected branch
  - selected files
  - git argv
  - git stdout/stderr
  - timings
  - dirty-file warnings

Verification:

- `npm test` passed: 11/11.
- `npm run build` generated minified `dist/extension.js`.
- Packaged VSIX: `branch-file-checkout-0.1.6-minified.vsix`.
- SHA-256: `2C64C0A706A56E34C2DCB40954ACDF74EA3EFC936FE1CBC233A970228F0E2C50`.
- Installed into Antigravity as `local.branch-file-checkout-0.1.6`.

Install note:

- Antigravity CLI printed `[createInstance] extensionManagementService depends on antigravityAnalytics which is NOT registered.`
- The same command still completed with `Extension 'branch-file-checkout-0.1.6-minified.vsix' was successfully installed.`

## Important Constraints

- Do not depend on GitLens runtime APIs.
- Do not copy GitLens `plus` code.
- If copying sizeable MIT source patterns, preserve required attribution.
- Do not promise 100 percent native Ctrl+P UI identity because extension APIs do not expose that internal provider.
- We can make search behavior and file icons close, and keep multi-select, which native Ctrl+P does not provide for opening files.
