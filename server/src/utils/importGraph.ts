import fs from 'fs';
import path from 'path';

export type Graph = {
  nodes: { id: string; label: string; count: number }[];
  edges: { source: string; target: string }[];
};

// very light import scanner (local relative imports only)
const importRe = /import\s+[^'"]*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

export function buildImportGraph(rootDir: string, filePaths: string[], countsByFile: Map<string, number>): Graph {
  const nodes: Record<string, { id: string; label: string; count: number }> = {};
  const edges: { source: string; target: string }[] = [];

  const toId = (abs: string) => path.relative(rootDir, abs).replace(/\\/g, '/');

  for (const absFile of filePaths) {
    const fileId = toId(absFile);
    nodes[fileId] = nodes[fileId] || { id: fileId, label: fileId, count: countsByFile.get(absFile) || 0 };

    const code = fs.readFileSync(absFile, 'utf8');
    for (const m of code.matchAll(importRe)) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue; // only show local graph
      // try resolve ts/js extensionless paths
      const targetAbs = resolveLocal(absFile, spec);
      if (!targetAbs) continue;
      const targetId = toId(targetAbs);
      nodes[targetId] = nodes[targetId] || { id: targetId, label: targetId, count: countsByFile.get(targetAbs) || 0 };
      edges.push({ source: fileId, target: targetId });
    }
  }

  return { nodes: Object.values(nodes), edges };
}

const EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
function resolveLocal(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, ...EXT.map(e => base + e), ...EXT.map(e => path.join(base, 'index' + e))];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
