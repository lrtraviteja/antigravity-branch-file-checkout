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

function fuzzyScore(query, value) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedValue = value.toLowerCase();
  let queryIndex = 0;
  let score = 0;
  let previousMatchIndex = -1;

  for (
    let valueIndex = 0;
    valueIndex < normalizedValue.length &&
    queryIndex < normalizedQuery.length;
    valueIndex += 1
  ) {
    if (normalizedValue[valueIndex] !== normalizedQuery[queryIndex]) {
      continue;
    }

    score += 10;
    if (valueIndex === 0 || isBoundary(normalizedValue[valueIndex - 1])) {
      score += 8;
    }
    if (previousMatchIndex === valueIndex - 1) {
      score += 6;
    }

    previousMatchIndex = valueIndex;
    queryIndex += 1;
  }

  if (queryIndex !== normalizedQuery.length) {
    return Number.NEGATIVE_INFINITY;
  }

  return score - normalizedValue.length / 100;
}

const PATH_IDENTITY_SCORE = 1 << 18;
const LABEL_PREFIX_SCORE_THRESHOLD = 1 << 17;
const LABEL_SCORE_THRESHOLD = 1 << 16;

function prepareQuery(original) {
  if (typeof original !== "string") {
    original = "";
  }

  const originalLowercase = original.toLowerCase();
  const normalized = normalizeQuery(original);
  const originalSplit = original.split(" ");
  let values;

  if (originalSplit.length > 1) {
    for (const originalPiece of originalSplit) {
      const normalizedPiece = normalizeQuery(originalPiece);
      if (normalizedPiece.normalized) {
        if (!values) {
          values = [];
        }
        values.push({
          original: originalPiece,
          originalLowercase: originalPiece.toLowerCase(),
          ...normalizedPiece,
          expectContiguousMatch: queryExpectsExactMatch(originalPiece)
        });
      }
    }
  }

  return {
    original,
    originalLowercase,
    ...normalized,
    values,
    containsPathSeparator: /[\\/]/.test(normalized.pathNormalized),
    expectContiguousMatch: queryExpectsExactMatch(original)
  };
}

function normalizeQuery(original) {
  const pathNormalized = String(original).replace(/\\/g, "/");
  const normalized = pathNormalized
    .replace(/[\*\u2026\s"]/g, "")
    .replace(/#$/g, "");

  return {
    pathNormalized,
    normalized,
    normalizedLowercase: normalized.toLowerCase()
  };
}

function queryExpectsExactMatch(query) {
  return query.startsWith('"') && query.endsWith('"');
}

function scoreFuzzy(target, query, queryLower, allowNonContiguousMatches) {
  if (!target || !query || target.length < query.length) {
    return [0, []];
  }

  // Early termination to prevent runaway DP calculations on pasted logs/long inputs
  if (query.length > QUERY_MAX_LENGTH) {
    return [0, []];
  }

  const targetLower = target.toLowerCase();
  const targetLength = target.length;
  const queryLength = query.length;
  const scores = [];
  const matches = [];

  for (let queryIndex = 0; queryIndex < queryLength; queryIndex += 1) {
    const queryIndexOffset = queryIndex * targetLength;
    const queryIndexPreviousOffset = queryIndexOffset - targetLength;
    const queryIndexGtNull = queryIndex > 0;
    const queryCharAtIndex = query[queryIndex];
    const queryLowerCharAtIndex = queryLower[queryIndex];

    for (let targetIndex = 0; targetIndex < targetLength; targetIndex += 1) {
      const targetIndexGtNull = targetIndex > 0;
      const currentIndex = queryIndexOffset + targetIndex;
      const leftIndex = currentIndex - 1;
      const diagIndex = queryIndexPreviousOffset + targetIndex - 1;
      const leftScore = targetIndexGtNull ? scores[leftIndex] || 0 : 0;
      const diagScore =
        queryIndexGtNull && targetIndexGtNull ? scores[diagIndex] || 0 : 0;
      const matchesSequenceLength =
        queryIndexGtNull && targetIndexGtNull ? matches[diagIndex] || 0 : 0;

      const score =
        !diagScore && queryIndexGtNull
          ? 0
          : computeCharScore(
              queryCharAtIndex,
              queryLowerCharAtIndex,
              target,
              targetLower,
              targetIndex,
              matchesSequenceLength
            );
      const isValidScore = score && diagScore + score >= leftScore;

      if (
        isValidScore &&
        (allowNonContiguousMatches ||
          queryIndexGtNull ||
          targetLower.startsWith(queryLower, targetIndex))
      ) {
        matches[currentIndex] = matchesSequenceLength + 1;
        scores[currentIndex] = diagScore + score;
      } else {
        matches[currentIndex] = 0;
        scores[currentIndex] = leftScore;
      }
    }
  }

  const positions = [];
  let queryIndex = queryLength - 1;
  let targetIndex = targetLength - 1;

  while (queryIndex >= 0 && targetIndex >= 0) {
    const currentIndex = queryIndex * targetLength + targetIndex;
    const match = matches[currentIndex];
    if (!match) {
      targetIndex -= 1;
    } else {
      positions.push(targetIndex);
      queryIndex -= 1;
      targetIndex -= 1;
    }
  }

  return [scores[queryLength * targetLength - 1] || 0, positions.reverse()];
}

function computeCharScore(
  queryCharAtIndex,
  queryLowerCharAtIndex,
  target,
  targetLower,
  targetIndex,
  matchesSequenceLength
) {
  if (!considerAsEqual(queryLowerCharAtIndex, targetLower[targetIndex])) {
    return 0;
  }

  let score = 1;
  if (matchesSequenceLength > 0) {
    score +=
      Math.min(matchesSequenceLength, 3) * 6 +
      Math.max(0, matchesSequenceLength - 3) * 3;
  }
  if (queryCharAtIndex === target[targetIndex]) {
    score += 1;
  }
  if (targetIndex === 0) {
    score += 8;
  } else {
    const separatorBonus = scoreSeparatorAtPos(target[targetIndex - 1]);
    if (separatorBonus) {
      score += separatorBonus;
    } else if (isUpper(target[targetIndex]) && matchesSequenceLength === 0) {
      score += 2;
    }
  }

  return score;
}

function considerAsEqual(a, b) {
  if (a === b) {
    return true;
  }
  return (a === "/" || a === "\\") && (b === "/" || b === "\\");
}

function scoreSeparatorAtPos(character) {
  if (character === "/" || character === "\\") {
    return 5;
  }
  if (
    character === "_" ||
    character === "-" ||
    character === "." ||
    character === " " ||
    character === "'" ||
    character === '"' ||
    character === ":"
  ) {
    return 4;
  }
  return 0;
}

function isUpper(character) {
  return character >= "A" && character <= "Z";
}

function scoreQuery(query, weightedValues) {
  const preparedQuery = prepareQuery(query);
  if (!preparedQuery.normalized) {
    return 0;
  }

  const item = createScoredItem(weightedValues);
  const result = scoreItemFuzzy(item, preparedQuery, true);
  return result.score || Number.NEGATIVE_INFINITY;
}

function createScoredItem(weightedValues) {
  const label = weightedValues.find((entry) => entry.role === "label") ||
    weightedValues[0] || { value: "" };
  const description = weightedValues.find(
    (entry) => entry.role === "description"
  );
  const pathValue = weightedValues.find((entry) => entry.role === "path");
  const extraValues = weightedValues.filter((entry) => entry.role === "extra");

  return {
    label: String(label.value || ""),
    description: description?.value ? String(description.value) : undefined,
    path: pathValue?.value ? String(pathValue.value) : undefined,
    extra: extraValues.map((entry) => String(entry.value || "")).join(" ")
  };
}

function filterScoredItems(items, query, getWeightedValues, limit = 250) {
  const preparedQuery = prepareQuery(query);
  if (!preparedQuery.normalized) {
    return items.slice(0, limit);
  }

  return items
    .map((item) => {
      const result = scoreItemFuzzy(
        createScoredItem(getWeightedValues(item)),
        preparedQuery,
        true
      );
      return {
        item,
        score: result.score,
        labelMatch: result.labelMatch,
        descriptionMatch: result.descriptionMatch
      };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        compareScoredItems(
          createScoredItem(getWeightedValues(left.item)),
          createScoredItem(getWeightedValues(right.item)),
          preparedQuery
        ) ||
        getSortableText(left.item).localeCompare(getSortableText(right.item))
    )
    .slice(0, limit)
    .map((entry) => {
      const item = entry.item;
      if (entry.labelMatch || entry.descriptionMatch) {
        item.highlights = {
          label: entry.labelMatch,
          description: entry.descriptionMatch
        };
      } else {
        item.highlights = undefined;
      }
      return item;
    });
}

function getSortableText(item) {
  return item.file || item.label || item.name || "";
}

function scoreItemFuzzy(item, query, allowNonContiguousMatches) {
  if (!item || !query.normalized || !item.label) {
    return { score: 0 };
  }

  const preferLabelMatches = !item.path || !query.containsPathSeparator;
  if (item.path && equalsIgnoreCase(query.pathNormalized, normalizePath(item.path))) {
    return { score: PATH_IDENTITY_SCORE };
  }

  if (query.values && query.values.length > 1) {
    return scoreItemFuzzyMultiple(
      item,
      query.values,
      preferLabelMatches,
      allowNonContiguousMatches
    );
  }

  return scoreItemFuzzySingle(
    item,
    query,
    preferLabelMatches,
    allowNonContiguousMatches
  );
}

function scoreItemFuzzyMultiple(
  item,
  queryPieces,
  preferLabelMatches,
  allowNonContiguousMatches
) {
  let totalScore = 0;
  let totalLabelMatch = [];
  let totalDescriptionMatch = [];

  for (let index = 0; index < queryPieces.length; index += 1) {
    const queryPiece = queryPieces[index];
    const result = scoreItemFuzzySingleWithAliases(
      item,
      queryPiece,
      preferLabelMatches,
      allowNonContiguousMatches
    );
    if (
      !result.score &&
      isSoftFilterToken(queryPiece.normalized) &&
      index < queryPieces.length - 1
    ) {
      continue;
    }
    if (!result.score) {
      return { score: 0 };
    }
    totalScore += result.score;
    if (result.labelMatch) {
      totalLabelMatch.push(...result.labelMatch);
    }
    if (result.descriptionMatch) {
      totalDescriptionMatch.push(...result.descriptionMatch);
    }
  }

  return { 
    score: totalScore, 
    labelMatch: totalLabelMatch.length ? totalLabelMatch : undefined,
    descriptionMatch: totalDescriptionMatch.length ? totalDescriptionMatch : undefined 
  };
}

function isSoftFilterToken(token) {
  return token.startsWith("-") && token.length > 1;
}

function scoreItemFuzzySingleWithAliases(
  item,
  query,
  preferLabelMatches,
  allowNonContiguousMatches
) {
  const result = scoreItemFuzzySingle(
    item,
    query,
    preferLabelMatches,
    allowNonContiguousMatches
  );
  if (result.score || !isSoftFilterToken(query.normalized)) {
    return result;
  }

  return scoreItemFuzzySingle(
    item,
    {
      ...query,
      normalized: query.normalized.slice(1),
      normalizedLowercase: query.normalizedLowercase.slice(1)
    },
    preferLabelMatches,
    allowNonContiguousMatches
  );
}

function scoreItemFuzzySingle(
  item,
  query,
  preferLabelMatches,
  allowNonContiguousMatches
) {
  if (preferLabelMatches || !item.description) {
    const labelResult = scoreTarget(item.label, query, allowNonContiguousMatches);
    const labelScore = labelResult[0];
    if (labelScore > 0) {
      const labelPrefixMatch = matchesPrefix(query.normalized, item.label);
      let baseScore = LABEL_SCORE_THRESHOLD;
      if (labelPrefixMatch) {
        baseScore =
          LABEL_PREFIX_SCORE_THRESHOLD +
          Math.round((query.normalized.length / item.label.length) * 100);
      }
      return { score: baseScore + labelScore, labelMatch: createMatches(labelResult[1]) };
    }
  }

  if (item.description) {
    const descriptionAndLabel = `${item.description}/${item.label}`;
    const descResult = scoreTarget(
      descriptionAndLabel,
      query,
      allowNonContiguousMatches
    );
    const descriptionScore = descResult[0];
    if (descriptionScore > 0) {
      const positions = descResult[1];
      const descLength = item.description.length;
      
      const descPositions = positions.filter(p => p < descLength);
      const labelPositions = positions.filter(p => p > descLength).map(p => p - descLength - 1);
      
      return { 
        score: descriptionScore, 
        labelMatch: createMatches(labelPositions),
        descriptionMatch: createMatches(descPositions)
      };
    }
  }

  if (item.extra) {
    const extraScore = scoreTarget(item.extra, query, allowNonContiguousMatches)[0];
    if (extraScore > 0) {
      return { score: Math.max(1, Math.floor(extraScore / 2)) };
    }
  }

  return { score: 0 };
}

function scoreTarget(target, query, allowNonContiguousMatches) {
  return scoreFuzzy(
    target,
    query.normalized,
    query.normalizedLowercase,
    allowNonContiguousMatches && !query.expectContiguousMatch
  );
}

function createMatches(positions) {
  const matches = [];
  if (!positions || positions.length === 0) {
    return matches;
  }
  let currentMatch = { start: positions[0], end: positions[0] + 1 };
  for (let i = 1; i < positions.length; i += 1) {
    const pos = positions[i];
    if (pos === currentMatch.end) {
      currentMatch.end += 1;
    } else {
      matches.push(currentMatch);
      currentMatch = { start: pos, end: pos + 1 };
    }
  }
  matches.push(currentMatch);
  return matches.map((m) => ({ start: m.start, end: m.end }));
}

function compareScoredItems(itemA, itemB, query) {
  const scoreA = scoreItemFuzzy(itemA, query, true).score;
  const scoreB = scoreItemFuzzy(itemB, query, true).score;

  if (scoreA !== scoreB) {
    return scoreA > scoreB ? -1 : 1;
  }

  if (
    scoreA > LABEL_SCORE_THRESHOLD &&
    itemA.label.length !== itemB.label.length
  ) {
    return itemA.label.length - itemB.label.length;
  }

  const lengthA =
    itemA.label.length + (itemA.description ? itemA.description.length : 0);
  const lengthB =
    itemB.label.length + (itemB.description ? itemB.description.length : 0);
  if (lengthA !== lengthB) {
    return lengthA - lengthB;
  }

  return itemA.label.localeCompare(itemB.label, undefined, {
    sensitivity: "base"
  });
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}

function equalsIgnoreCase(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function matchesPrefix(query, target) {
  return target.toLowerCase().startsWith(query.toLowerCase());
}

function isBoundary(character) {
  return character === "/" || character === "\\" || character === "-" ||
    character === "_" || character === "." || character === " ";
}

function filterFilePickerItems(items, query, limit = 250) {
  return filterScoredItems(
    items,
    query,
    (item) => [
      { role: "label", value: item.basename },
      { role: "description", value: item.displayDirectory },
      { role: "path", value: item.file }
    ],
    limit
  );
}

module.exports = {
  createFilePickerItems,
  filterFilePickerItems,
  filterScoredItems,
  fuzzyScore,
  getFileIcon,
  prepareQuery,
  resolveThemeIconName,
  scoreQuery
};
