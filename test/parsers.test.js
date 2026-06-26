"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createFilePickerItems,
  filterFilePickerItems,
  filterScoredItems,
  fuzzyScore,
  getFileIcon
} = require("../src/filePicker");
const {
  buildPathspecInput,
  parseBranches,
  parseLsTree,
  parsePorcelainPaths,
  sortBranches
} = require("../src/parsers");

test("parseBranches returns local and remote branches and skips remote HEAD", () => {
  const output = [
    [
      "refs/heads/dev",
      "abc1234",
      "1750000000",
      "1 day ago",
      "Rav",
      "fix branch"
    ].join("\0"),
    [
      "refs/remotes/upstream/dev",
      "def5678",
      "1760000000",
      "2 days ago",
      "Bhav",
      "remote branch"
    ].join("\0"),
    [
      "refs/remotes/upstream/HEAD",
      "aaa0000",
      "1740000000",
      "1 week ago",
      "Bot",
      "head ref"
    ].join("\0")
  ].join("\n");

  assert.deepEqual(parseBranches(output), [
    {
      kind: "local",
      name: "dev",
      ref: "dev",
      commit: "abc1234",
      commitDate: 1750000000,
      commitRelativeDate: "1 day ago",
      author: "Rav",
      subject: "fix branch"
    },
    {
      kind: "remote",
      name: "upstream/dev",
      ref: "upstream/dev",
      commit: "def5678",
      commitDate: 1760000000,
      commitRelativeDate: "2 days ago",
      author: "Bhav",
      subject: "remote branch"
    }
  ]);
});

test("sortBranches follows configured ordering", () => {
  const branches = [
    { name: "zeta", commitDate: 10 },
    { name: "alpha", commitDate: 20 }
  ];

  assert.deepEqual(
    sortBranches(branches, "alphabetically").map((branch) => branch.name),
    ["alpha", "zeta"]
  );
  assert.deepEqual(
    sortBranches(branches, "committerdate").map((branch) => branch.name),
    ["alpha", "zeta"]
  );
});

test("parseLsTree keeps blobs and skips submodule entries", () => {
  const output = Buffer.from(
    [
      "100644 blob abc123\tpackage.json",
      "100755 blob def456\tsrc/run.js",
      "160000 commit fed321\tvendor/submodule",
      ""
    ].join("\0")
  );

  assert.deepEqual(parseLsTree(output), {
    files: ["package.json", "src/run.js"],
    skippedEntries: 1
  });
});

test("buildPathspecInput uses NUL delimiters", () => {
  assert.deepEqual(
    buildPathspecInput(["a file.txt", "src/example.js"]),
    Buffer.from("a file.txt\0src/example.js\0")
  );
});

test("parsePorcelainPaths reads modified, untracked, and renamed paths", () => {
  const output = Buffer.from(
    " M src/a.js\0?? new file.txt\0R  src/new.js\0src/old.js\0"
  );

  assert.deepEqual(parsePorcelainPaths(output), [
    "src/a.js",
    "new file.txt",
    "src/new.js",
    "src/old.js"
  ]);
});

test("createFilePickerItems formats Ctrl+P-style labels and paths", () => {
  assert.deepEqual(
    createFilePickerItems(
      ["package.json", "src/features/search-file.ts"],
      process.platform === "win32" ? "C:\\work\\demo" : "C:/work/demo"
    ).map((item) => ({
      file: item.file,
      basename: item.basename,
      displayDirectory: item.displayDirectory,
      iconClass: item.iconClass
    })),
    [
      {
        file: "package.json",
        basename: "package.json",
        displayDirectory: "demo",
        iconClass: "icon-node"
      },
      {
        file: "src/features/search-file.ts",
        basename: "search-file.ts",
        displayDirectory: "demo\\src\\features",
        iconClass: "icon-ts"
      }
    ]
  );
});

test("filterFilePickerItems searches basename and repository path", () => {
  const items = createFilePickerItems(
    ["src/components/Button.tsx", "docs/button-guide.md", "package.json"],
    "C:\\work\\demo"
  );

  assert.deepEqual(
    filterFilePickerItems(items, "btn").map((item) => item.file),
    ["docs/button-guide.md", "src/components/Button.tsx"]
  );
  assert.deepEqual(
    filterFilePickerItems(items, "but").map((item) => item.file),
    ["src/components/Button.tsx", "docs/button-guide.md"]
  );
  assert.deepEqual(
    filterFilePickerItems(items, "srcbut").map((item) => item.file),
    ["src/components/Button.tsx"]
  );
});

test("filterFilePickerItems ranks Ctrl+P-style multi-token file queries", () => {
  const items = createFilePickerItems(
    [
      "new/inc/api/class-ht-ctc-rest-api.php",
      "tests/php/fixtures/ctc-pro-test-bootstrap.php",
      "new/inc/class-ht-ctc-register.php",
      "new/tools/woo/ht-ctc-woo.php",
      "new/inc/assets/img/ht-ctc-svg-images.php",
      "new/admin/components/list/ht-ctc-admin-list-page.php",
      "new/admin/admin_commons/ht-ctc-admin-formatting.php",
      "src/Button.tsx"
    ],
    "C:\\work\\click-to-chat-for-whatsapp"
  );

  const result = filterFilePickerItems(items, "ht ctc -rest -php").map(
    (item) => item.file
  );

  assert.equal(result[0], "new/inc/api/class-ht-ctc-rest-api.php");
  assert.ok(result.includes("new/tools/woo/ht-ctc-woo.php"));
  assert.ok(result.includes("tests/php/fixtures/ctc-pro-test-bootstrap.php"));
  assert.ok(!result.includes("src/Button.tsx"));
});

test("filterScoredItems supports Ctrl+P-style branch queries", () => {
  const branches = [
    {
      label: "dev",
      description: "1 day ago - current",
      detail: "raviteja-ht e2c4960 fix branch",
      branch: { ref: "dev", kind: "local" }
    },
    {
      label: "upstream/dev",
      description: "2 days ago",
      detail: "bhvreddy b28e4967 feature branch",
      branch: { ref: "upstream/dev", kind: "remote" }
    },
    {
      label: "origin/feature/newinterface-preview-2",
      description: "2 days ago",
      detail: "raviteja-ht dd380a64 preview work",
      branch: {
        ref: "origin/feature/newinterface-preview-2",
        kind: "remote"
      }
    }
  ];

  const result = filterScoredItems(
    branches,
    "up dev",
    (item) => [
      { value: item.label, weight: 1.35 },
      { value: item.branch.ref, weight: 1.2 },
      { value: item.description, weight: 0.75 },
      { value: item.detail, weight: 0.65 }
    ],
    10
  ).map((item) => item.label);

  assert.deepEqual(result, ["upstream/dev"]);
});

test("fuzzyScore and file icons handle known and unknown file types", () => {
  assert.ok(fuzzyScore("pkg", "package.json") > Number.NEGATIVE_INFINITY);
  assert.equal(fuzzyScore("zzz", "package.json"), Number.NEGATIVE_INFINITY);
  assert.equal(getFileIcon("Controller.php").assetName, "php");
  assert.equal(getFileIcon("Dockerfile").assetName, "docker");
  assert.equal(getFileIcon("query.sql").assetName, "database");
  assert.deepEqual(getFileIcon("README.md"), {
    label: "markdown",
    className: "icon-markdown",
    assetName: "markdown",
    assetPath: "icons/files/markdown.svg"
  });
  assert.deepEqual(getFileIcon("unknown.lock"), {
    label: "lock",
    className: "icon-lock",
    assetName: "lock",
    assetPath: "icons/files/lock.svg"
  });
});
