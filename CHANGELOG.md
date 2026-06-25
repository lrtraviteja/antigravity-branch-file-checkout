# Changelog

## 0.1.5

- Port the branch/file picker search scorer closer to VS Code Ctrl+P's public fuzzy scorer.
- Apply the same prepared-query, label/description/path scoring path to both branch and file searches.
- Keep file multi-select support while preserving selected files across search changes.
- Support separator-prefixed file query pieces such as `ht ctc -rest -php`.

## 0.1.4

- Copy the full Antigravity-bundled `theme-symbols` icon theme into the extension.
- Resolve file picker icons from the copied icon-theme manifest by exact filename, longest extension, and language id.

## 0.1.3

- Replace the file selection step with a native `createQuickPick` picker.
- Add Ctrl+P-style dynamic fuzzy filtering over selected branch files.
- Preserve multi-selected files across search changes.
- Add file picker parser/model tests.

## 0.1.2

- Make the branch picker closer to Antigravity's native Git checkout picker.
- Show branch relative age plus author, short commit, and commit subject.
- Add remote branch cloud icons and native-style branch separators.

## 0.1.1

- Match the compact Ctrl+P file row layout.
- Render file icons from the active file icon theme.
- Show repository and directory context on the same line as each filename.

## 0.1.0

- Add Source Control action for selecting a local or remote branch.
- Add Ctrl+P-style fuzzy multi-file selection.
- Add dirty-file confirmation and safe NUL-delimited Git pathspec handling.
- Add detailed Output channel logging.
