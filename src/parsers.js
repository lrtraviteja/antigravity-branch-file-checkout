"use strict";

function parseBranches(output) {
  const branches = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const [
      refname,
      commit = "",
      commitDateValue = "0",
      commitRelativeDate = "",
      author = "",
      subject = ""
    ] = line.split("\0");
    if (refname.startsWith("refs/heads/")) {
      branches.push({
        kind: "local",
        name: refname.slice("refs/heads/".length),
        ref: refname.slice("refs/heads/".length),
        commit,
        commitDate: Number(commitDateValue) || 0,
        commitRelativeDate,
        author,
        subject
      });
      continue;
    }

    if (refname.startsWith("refs/remotes/")) {
      const name = refname.slice("refs/remotes/".length);
      if (name.endsWith("/HEAD")) {
        continue;
      }
      branches.push({
        kind: "remote",
        name,
        ref: name,
        commit,
        commitDate: Number(commitDateValue) || 0,
        commitRelativeDate,
        author,
        subject
      });
    }
  }

  return branches;
}

function sortBranches(branches, branchSortOrder) {
  const sorted = [...branches];
  if (branchSortOrder === "alphabetically") {
    return sorted.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );
  }

  return sorted.sort(
    (left, right) =>
      right.commitDate - left.commitDate ||
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}

function parseLsTree(output) {
  const files = [];
  let skippedEntries = 0;
  const text = Buffer.isBuffer(output) ? output.toString("utf8") : output;

  for (const record of text.split("\0")) {
    if (!record) {
      continue;
    }

    const separatorIndex = record.indexOf("\t");
    if (separatorIndex < 0) {
      skippedEntries += 1;
      continue;
    }

    const metadata = record.slice(0, separatorIndex).split(" ");
    const objectType = metadata[1];
    const filePath = record.slice(separatorIndex + 1);
    if (objectType === "blob") {
      files.push(filePath);
    } else {
      skippedEntries += 1;
    }
  }

  return { files, skippedEntries };
}

function buildPathspecInput(paths) {
  return Buffer.from(`${paths.join("\0")}\0`, "utf8");
}

function parsePorcelainPaths(output) {
  const text = Buffer.isBuffer(output) ? output.toString("utf8") : output;
  const records = text.split("\0");
  const paths = new Set();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) {
      continue;
    }

    const status = record.slice(0, 2);
    const filePath = record.slice(3);
    if (filePath) {
      paths.add(filePath);
    }

    if (status.includes("R") || status.includes("C")) {
      const originalPath = records[index + 1];
      if (originalPath) {
        paths.add(originalPath);
        index += 1;
      }
    }
  }

  return [...paths];
}

module.exports = {
  buildPathspecInput,
  parseBranches,
  parseLsTree,
  parsePorcelainPaths,
  sortBranches
};
