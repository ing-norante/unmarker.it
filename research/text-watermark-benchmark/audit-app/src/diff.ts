export type DiffKind = "equal" | "added" | "removed";

export interface DiffSegment {
  kind: DiffKind;
  value: string;
}

export interface ParallelDiff {
  source: DiffSegment[];
  candidate: DiffSegment[];
}

const TOKEN_PATTERN =
  /(\s+|\p{L}[\p{L}\p{M}'’-]*|\p{N}+(?:[.,]\p{N}+)*|[^\s])/gu;

function tokenize(text: string): string[] {
  return text.match(TOKEN_PATTERN) ?? [];
}

function comparisonValue(token: string): string {
  return /^\s+$/u.test(token) ? " " : token;
}

function append(segments: DiffSegment[], kind: DiffKind, value: string): void {
  const previous = segments.at(-1);
  if (previous?.kind === kind) previous.value += value;
  else segments.push({ kind, value });
}

export function createParallelDiff(
  sourceText: string,
  candidateText: string,
): ParallelDiff {
  const sourceTokens = tokenize(sourceText);
  const candidateTokens = tokenize(candidateText);
  const rows = sourceTokens.length + 1;
  const columns = candidateTokens.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (
    let sourceIndex = sourceTokens.length - 1;
    sourceIndex >= 0;
    sourceIndex -= 1
  ) {
    for (
      let candidateIndex = candidateTokens.length - 1;
      candidateIndex >= 0;
      candidateIndex -= 1
    ) {
      table[sourceIndex][candidateIndex] =
        comparisonValue(sourceTokens[sourceIndex]) ===
        comparisonValue(candidateTokens[candidateIndex])
          ? table[sourceIndex + 1][candidateIndex + 1] + 1
          : Math.max(
              table[sourceIndex + 1][candidateIndex],
              table[sourceIndex][candidateIndex + 1],
            );
    }
  }

  const source: DiffSegment[] = [];
  const candidate: DiffSegment[] = [];
  let sourceIndex = 0;
  let candidateIndex = 0;

  while (
    sourceIndex < sourceTokens.length &&
    candidateIndex < candidateTokens.length
  ) {
    if (
      comparisonValue(sourceTokens[sourceIndex]) ===
      comparisonValue(candidateTokens[candidateIndex])
    ) {
      append(source, "equal", sourceTokens[sourceIndex]);
      append(candidate, "equal", candidateTokens[candidateIndex]);
      sourceIndex += 1;
      candidateIndex += 1;
    } else if (
      table[sourceIndex + 1][candidateIndex] >=
      table[sourceIndex][candidateIndex + 1]
    ) {
      append(source, "removed", sourceTokens[sourceIndex]);
      sourceIndex += 1;
    } else {
      append(candidate, "added", candidateTokens[candidateIndex]);
      candidateIndex += 1;
    }
  }

  while (sourceIndex < sourceTokens.length) {
    append(source, "removed", sourceTokens[sourceIndex]);
    sourceIndex += 1;
  }
  while (candidateIndex < candidateTokens.length) {
    append(candidate, "added", candidateTokens[candidateIndex]);
    candidateIndex += 1;
  }

  return { source, candidate };
}
