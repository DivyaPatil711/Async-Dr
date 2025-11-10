import fs from 'fs';
import path from 'path';
import { Linter, Rule } from 'eslint';
import { extractSnippet, extractFunction } from './utils/snippets';
import { buildImportGraph, Graph } from './utils/importGraph';

// rules
import awaitInLoopRule from './rules/awaitInLoop';
import asyncAwaitedReturnRule from './rules/asyncFunctionAwaitedReturn';
import promiseResolveThenRule from './rules/promiseResolveThen';
import executorOneArgUsedRule from './rules/executorOneArgUsed';
import customPromisificationRule from './rules/customPromisification';
import reactionReturnsPromiseRule from './rules/reactionReturnsPromise';
import asyncExecutorInPromiseRule from './rules/asyncExecutorInPromise';
import redundantNewPromiseWrapperRule from './rules/redundantNewPromiseWrapper';


export type Finding = {
  id: number;
  rule: string;
  message: string;
  file: string;
  line: number;
  column: number;
  fixable: boolean;
  snippet: string;
  snippetStart: number;
    funcSnippet: string;    // WHOLE function text
  funcStart: number;      // function start line
};

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(e.name)) out.push(full);
    }
  }
  return out;
}

export function runAnalysis(rootDir: string): {
  findings: Finding[];
  byRule: Record<string, number>;
  byFile: Record<string, number>;
  graph: Graph;
  filesAnalyzed: number;
} {
  const linter = new Linter();
  // register rules
  linter.defineRule('await-in-loop', awaitInLoopRule as unknown as Rule.RuleModule);
  linter.defineRule('async-function-awaited-return', asyncAwaitedReturnRule as unknown as Rule.RuleModule);
  linter.defineRule('promise-resolve-then', promiseResolveThenRule as unknown as Rule.RuleModule);
  linter.defineRule('executor-one-arg-used', executorOneArgUsedRule as unknown as Rule.RuleModule);
  linter.defineRule('custom-promisification', customPromisificationRule as unknown as Rule.RuleModule);
  linter.defineRule('reaction-returns-promise', reactionReturnsPromiseRule as unknown as Rule.RuleModule);
  linter.defineRule('async-executor-in-promise', asyncExecutorInPromiseRule as unknown as Rule.RuleModule);
  linter.defineRule('redundant-new-promise-wrapper', redundantNewPromiseWrapperRule as unknown as Rule.RuleModule);

  // TS parser
  const tsParser = require('@typescript-eslint/parser');
  linter.defineParser('ts-parser', tsParser);

  const config: Linter.LegacyConfig = {
    parser: 'ts-parser',
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    rules: {
      'await-in-loop': 'error',
      'async-function-awaited-return': 'error',
      'promise-resolve-then': 'error',
      'executor-one-arg-used': 'error',
      'custom-promisification': 'error',
      'reaction-returns-promise': 'error',
      'async-executor-in-promise': 'error',
      'redundant-new-promise-wrapper': 'error'
    }
  };

  const files = collectFiles(rootDir);
  const findings: Finding[] = [];
  const byRule: Record<string, number> = {};
  const byFileAbs = new Map<string, number>();

  for (const filePath of files) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const msgs = linter.verify(code, config, { filename: filePath });
    for (const m of msgs) {
      const rule = m.ruleId || 'unknown';
    const { snippet, startLine } = extractSnippet(filePath, m.line, 4);
const { snippet: funcSnippet, startLine: funcStart } = extractFunction(filePath, m.line);

findings.push({
  id: 0,
  rule,
  message: m.message,
  file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
  line: m.line,
  column: m.column,
  fixable: Boolean((m as any).fix),
  snippet,
  snippetStart: startLine,
  funcSnippet,
  funcStart
});
      byRule[rule] = (byRule[rule] || 0) + 1;
      byFileAbs.set(filePath, (byFileAbs.get(filePath) || 0) + 1);
    }
  }

  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  findings.forEach((f, i) => (f.id = i + 1));

  const byFile: Record<string, number> = {};
  for (const [abs, count] of byFileAbs.entries()) {
    const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
    byFile[rel] = count;
  }

  // module import graph with counts overlaid
  const graph = buildImportGraph(rootDir, files, byFileAbs);

  return { findings, byRule, byFile, graph, filesAnalyzed: files.length };
}
