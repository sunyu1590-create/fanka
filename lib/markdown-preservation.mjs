function withoutCodeFences(source) {
  return source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "");
}

function codeBlocks(source) {
  return [...source.matchAll(/^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm)]
    .map((match) => `${match[1]}${match[2]}\n${match[3]}`);
}

function linksAndImages(source) {
  return [...withoutCodeFences(source).matchAll(/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g)]
    .map((match) => match[1].replace(/^<|>$/g, ""));
}

function tableData(source) {
  return withoutCodeFences(source).split(/\r?\n/)
    .filter((line) => /^\s*\|.*\|\s*$/.test(line))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function markdownPreservationIssues(before, after) {
  const issues = [];
  if (!equal(codeBlocks(before), codeBlocks(after))) issues.push("代码块或语言标识发生变化");
  if (!equal(linksAndImages(before), linksAndImages(after))) issues.push("链接或图片地址发生变化");
  if (!equal(tableData(before), tableData(after))) issues.push("表格数据发生变化");
  return issues;
}
