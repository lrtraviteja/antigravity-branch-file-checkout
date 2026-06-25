# Branch File Checkout

An Antigravity IDE and VS Code-compatible extension that checks out selected files from another Git branch without switching the current branch.

## Usage

1. Open Source Control.
2. Click **Checkout Files from Branch** in the Source Control title bar.
3. Select a local or remote branch such as `upstream/dev`.
4. Search files by name or path and select one or more files from that branch.
5. Confirm if selected files have local changes.

The extension performs the equivalent of:

```bash
git checkout <branch> -- <selected files>
```

Large selections are passed through Git's NUL-delimited `--pathspec-from-file` support so spaces and special characters are preserved.

## Output

Open **Output: Branch File Checkout** to inspect:

- selected repository
- selected branch
- discovered and selected file counts
- selected repository-relative paths
- Git arguments, exit code, stdout, stderr, and duration

## Development

```bash
npm test
```
