export function findSystemLeakage({ systemFiles, tokens, ignoredFiles = new Set() }) {
  const failures = [];
  for (const file of systemFiles) {
    if (ignoredFiles.has(file.path) || file.path.endsWith(".test.mjs")) continue;
    for (const token of tokens) {
      if (!token.value || token.value.length < 5) continue;
      if (file.content.includes(token.value)) failures.push({ path: file.path, token: token.value, kind: token.kind });
    }
  }
  return failures;
}
