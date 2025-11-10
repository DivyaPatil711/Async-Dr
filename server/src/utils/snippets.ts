// src/utils/snippets.ts
import fs from 'fs';
import * as ts from 'typescript';

export function extractSnippet(
  filePath: string,
  line: number,
  context = 4
): { snippet: string; startLine: number; highlight: number } {
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/);
  const start = Math.max(0, line - 1 - context);
  const end = Math.min(lines.length, line - 1 + context + 1);
  return { snippet: lines.slice(start, end).join('\n'), startLine: start + 1, highlight: line };
}

/* ---- FIXED: strong typing + type guard ---- */
type FuncLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

function isFuncLike(n: ts.Node): n is FuncLike {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
  );
}

export function extractFunction(
  filePath: string,
  line: number
): { snippet: string; startLine: number } {
  const code = fs.readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);

  const targetPos = sf.getPositionOfLineAndCharacter(Math.max(0, line - 1), 0);

  // Keep as generic Node to avoid odd narrowing to never in some TS versions
  let best: ts.Node | null = null;

  const visit = (n: ts.Node) => {
    if (n.pos <= targetPos && targetPos < n.end) {
      if (isFuncLike(n)) best = n;
      n.forEachChild(visit);
    }
  };
  visit(sf);

  if (!best) {
    // Fallback: wide context
    const { snippet, startLine } = extractSnippet(filePath, line, 20);
    return { snippet, startLine };
  }

  const node = best as unknown as ts.Node;
  const startLC = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const endLC = sf.getLineAndCharacterOfPosition(node.getEnd());
  const block = code.split(/\r?\n/).slice(startLC.line, endLC.line + 1).join('\n');

  return { snippet: block, startLine: startLC.line + 1 };
}
