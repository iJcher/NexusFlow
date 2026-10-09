import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from '../backend-node/node_modules/typescript/lib/typescript.js';

// Mechanical, AST-checked repair. ESLint determines unused bindings; retain all
// initializers and function bodies, changing only their local identifier names.
interface Message { ruleId: string; line: number; column: number; message: string }
interface Entry { filePath: string; messages: Message[] }
const root = resolve(__dirname, '..');
const front = resolve(root, 'front');
const report: Entry[] = JSON.parse(readFileSync(resolve(root, 'artifacts/front-lint-debug.json'), 'utf8')) as Entry[];
const patches: string[] = ['*** Begin Patch'];
let repaired = 0;
for (const entry of report) {
  const messages = entry.messages.filter(m => m.ruleId === 'unused-imports/no-unused-vars');
  if (!messages.length) continue;
  const path = resolve(entry.filePath);
  const scope = relative(front, path);
  if (scope.startsWith('..') || isAbsolute(scope)) throw new Error('Repair outside front');
  const original = readFileSync(path, 'utf8');
  const lines = original.split(/\r?\n/);
  const startTag = path.endsWith('.vue') ? /<script\b[^>]*>/.exec(original) : undefined;
  const scriptStart = startTag ? startTag.index + startTag[0].length : 0;
  const scriptEnd = startTag ? original.indexOf('</script>', scriptStart) : original.length;
  const tree = ts.createSourceFile(path + '.ts', original.slice(scriptStart, scriptEnd), ts.ScriptTarget.Latest, true);
  const changes = new Map<number, string>();
  for (const message of [...messages].sort((a, b) => b.line - a.line || b.column - a.column)) {
    const name = /^'([^']+)'/.exec(message.message)?.[1];
    if (!name || name.startsWith('_')) throw new Error('Unrecognized unused identifier');
    const lineNumber = message.line - 1;
    const sourceLine = lines[lineNumber];
    const column = message.column - 1;
    if (sourceLine.slice(column, column + name.length) !== name) throw new Error('Stale lint location: ' + scope);
    const lineStart = original.split('\n').slice(0, lineNumber).reduce((sum, line) => sum + line.length + 1, 0);
    const offset = lineStart + column - scriptStart;
    let identifier: ts.Identifier | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.getStart(tree) === offset && node.text === name) identifier = node;
      node.forEachChild(visit);
    };
    visit(tree);
    if (!identifier) throw new Error('AST binding not found: ' + scope);
    const binding = identifier.parent;
    const replacement = ts.isBindingElement(binding) && binding.name === identifier && !binding.propertyName
      && ts.isObjectBindingPattern(binding.parent)
      ? name + ': _' + name : '_' + name;
    const line = changes.get(lineNumber) ?? sourceLine;
    changes.set(lineNumber, line.slice(0, column) + replacement + line.slice(column + name.length));
    repaired++;
  }
  patches.push('*** Update File: ' + path);
  for (const [line, replacement] of [...changes].sort((a, b) => a[0] - b[0]))
    patches.push('@@', '-' + lines[line], '+' + replacement);
}
patches.push('*** End Patch');
if (repaired) {
  const executable = process.argv[2];
  if (!executable || !isAbsolute(executable)) throw new Error('Explicit apply_patch executable required');
  execFileSync(executable, ['--codex-run-as-apply-patch', patches.join('\n')], { windowsHide: true, stdio: 'pipe' });
}
console.log('AST-checked unused binding repairs: ' + repaired);
