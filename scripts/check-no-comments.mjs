import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const roots = [
  'web/src',
  'web/tests',
  'web/scripts',
  'web/fixtures',
  'web/openapi.yaml',
  'collector',
  'savereader',
  'mod',
  'scripts',
  'tools',
  'art',
  'site',
  '.github',
  'docker-compose.yml'
];
const excludedDirectories = new Set(['bin', 'dist', 'obj', 'out', 'node_modules', '.svelte-kit']);
const extensions = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.svelte',
  '.css',
  '.cs',
  '.go',
  '.py',
  '.html',
  '.ps1',
  '.sh',
  '.yaml',
  '.yml',
  '.toml',
  '.lua'
]);
const generatedExemptions = [];

const regexPrecedingKeywords = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await'
]);

function collectFiles(target, out) {
  const stats = statSync(target);
  if (stats.isFile()) {
    if (extensions.has(extname(target))) out.push(target);
    return;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) collectFiles(join(target, entry.name), out);
    } else if (extensions.has(extname(entry.name))) {
      out.push(join(target, entry.name));
    }
  }
}

function skipQuoted(text, start, quote, allowEscapes) {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (allowEscapes && c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    if (c === '\n') return i;
    i++;
  }
  return i;
}

function skipTemplate(text, start) {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') return i + 1;
    if (c === '$' && text[i + 1] === '{') {
      i = skipBraces(text, i + 1);
      continue;
    }
    i++;
  }
  return i;
}

function skipBraces(text, start) {
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = skipQuoted(text, i, c, true);
      continue;
    }
    if (c === '`') {
      i = skipTemplate(text, i);
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return i;
}

function skipRegex(text, start) {
  let i = start + 1;
  let inClass = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '\n') return start + 1;
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      i++;
      while (i < text.length && /[a-z]/i.test(text[i])) i++;
      return i;
    }
    i++;
  }
  return i;
}

function skipVerbatim(text, start) {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '"') {
      if (text[i + 1] === '"') {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return i;
}

function skipRawString(text, start) {
  let quotes = 0;
  while (text[start + quotes] === '"') quotes++;
  let i = start + quotes;
  while (i < text.length) {
    if (text[i] === '"') {
      let run = 0;
      while (text[i + run] === '"') run++;
      if (run >= quotes) return i + run;
      i += run;
      continue;
    }
    i++;
  }
  return i;
}

function skipCSharpString(text, start) {
  if (text.startsWith('"""', start)) return skipRawString(text, start);
  return skipQuoted(text, start, '"', true);
}

function scanCLike(text, language) {
  const findings = [];
  const isJs = language === 'js';
  const isCs = language === 'cs';
  const isGo = language === 'go';
  let i = 0;
  let lastChar = '';
  let lastWord = '';
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      findings.push({ index: i, message: 'line comment' });
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      findings.push({ index: i, message: 'block comment' });
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (isCs && c === '@' && next === '"') {
      i = skipVerbatim(text, i + 1);
      lastChar = '"';
      continue;
    }
    if (isCs && c === '$' && next === '"') {
      i = skipCSharpString(text, i + 1);
      lastChar = '"';
      continue;
    }
    const verbatimInterpolated =
      isCs &&
      ((c === '$' && next === '@' && text[i + 2] === '"') ||
        (c === '@' && next === '$' && text[i + 2] === '"'));
    if (verbatimInterpolated) {
      i = skipVerbatim(text, i + 2);
      lastChar = '"';
      continue;
    }
    if (c === '"') {
      i = isCs ? skipCSharpString(text, i) : skipQuoted(text, i, '"', true);
      lastChar = '"';
      continue;
    }
    if (c === "'") {
      i = skipQuoted(text, i, "'", true);
      lastChar = "'";
      continue;
    }
    if (isGo && c === '`') {
      const end = text.indexOf('`', i + 1);
      i = end === -1 ? text.length : end + 1;
      lastChar = '`';
      continue;
    }
    if (isJs && c === '`') {
      i = skipTemplate(text, i);
      lastChar = '`';
      continue;
    }
    if (isJs && c === '/') {
      const regexAllowed =
        lastChar === '' ||
        /[(,=:[!&|?{};+\-*%<>~^]/.test(lastChar) ||
        regexPrecedingKeywords.has(lastWord);
      if (regexAllowed) {
        i = skipRegex(text, i);
        lastChar = '/';
        lastWord = '';
        continue;
      }
    }
    if (isCs && c === '#' && (i === 0 || text[i - 1] === '\n')) {
      const lineEnd = text.indexOf('\n', i);
      const directive = text.slice(i, lineEnd === -1 ? text.length : lineEnd);
      if (/^#\s*(region|endregion)\b/.test(directive)) {
        findings.push({ index: i, message: 'region marker' });
      }
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$]/.test(text[j])) j++;
      lastWord = text.slice(i, j);
      lastChar = text[j - 1];
      i = j;
      continue;
    }
    lastChar = c;
    lastWord = '';
    i++;
  }
  return findings;
}

function skipPythonString(text, start) {
  const quote = text[start];
  if (text.startsWith(quote.repeat(3), start)) {
    const end = text.indexOf(quote.repeat(3), start + 3);
    return end === -1 ? text.length : end + 3;
  }
  return skipQuoted(text, start, quote, true);
}

function scanPython(text) {
  const findings = [];
  let i = 0;
  if (text.startsWith('#!')) {
    const end = text.indexOf('\n');
    i = end === -1 ? text.length : end + 1;
  }
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = skipPythonString(text, i);
      continue;
    }
    if (c === '#') {
      findings.push({ index: i, message: 'line comment' });
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    i++;
  }
  return findings;
}

function scanCss(text) {
  const findings = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      findings.push({ index: i, message: 'block comment' });
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipQuoted(text, i, c, true);
      continue;
    }
    if (text.startsWith('url(', i)) {
      const end = text.indexOf(')', i);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    i++;
  }
  return findings;
}

function scanSvelte(text) {
  const findings = [];
  const regions = [];
  const blockPattern = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = blockPattern.exec(text)) !== null) {
    const contentStart = match.index + match[0].indexOf(match[2]);
    regions.push({ start: match.index, end: match.index + match[0].length });
    const inner = match[1] === 'script' ? scanCLike(match[2], 'js') : scanCss(match[2]);
    for (const finding of inner) {
      findings.push({
        index: contentStart + finding.index,
        message: finding.message
      });
    }
  }
  let cursor = 0;
  for (const region of [...regions, { start: text.length, end: text.length }]) {
    const markup = text.slice(cursor, region.start);
    let at = markup.indexOf('<!--');
    while (at !== -1) {
      findings.push({ index: cursor + at, message: 'html comment' });
      at = markup.indexOf('<!--', at + 4);
    }
    cursor = region.end;
  }
  return findings;
}

function skipHeredoc(text, start) {
  const heredoc = /^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(text.slice(start));
  if (!heredoc) return -1;
  const lineEnd = text.indexOf('\n', start);
  if (lineEnd === -1) return text.length;
  const terminator = heredoc[2];
  let lineStart = lineEnd + 1;
  while (lineStart < text.length) {
    let nextEnd = text.indexOf('\n', lineStart);
    if (nextEnd === -1) nextEnd = text.length;
    const line = text.slice(lineStart, nextEnd).replace(/^\t+/, '').trimEnd();
    lineStart = nextEnd + 1;
    if (line === terminator) break;
  }
  return Math.min(lineStart, text.length);
}

function scanShell(text) {
  const findings = [];
  let i = 0;
  if (text.startsWith('#!')) {
    const end = text.indexOf('\n');
    i = end === -1 ? text.length : end + 1;
  }
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (c === '"') {
      i = skipQuoted(text, i, '"', true);
      continue;
    }
    if (c === '<' && text[i + 1] === '<') {
      const after = skipHeredoc(text, i);
      if (after !== -1) {
        i = after;
        continue;
      }
    }
    if (c === '#') {
      const prev = i === 0 ? '' : text[i - 1];
      if (prev === '' || /[\s;(&|]/.test(prev)) {
        findings.push({ index: i, message: 'line comment' });
        while (i < text.length && text[i] !== '\n') i++;
        continue;
      }
    }
    i++;
  }
  return findings;
}

function skipPowerShellHereString(text, start) {
  const closer = text[start + 1] + '@';
  const end = text.indexOf('\n' + closer, start + 2);
  return end === -1 ? text.length : end + 1 + closer.length;
}

function skipPowerShellSingle(text, start) {
  let j = start + 1;
  while (j < text.length) {
    if (text[j] === "'") {
      if (text[j + 1] === "'") {
        j += 2;
        continue;
      }
      break;
    }
    j++;
  }
  return j + 1;
}

function skipPowerShellDouble(text, start) {
  let j = start + 1;
  while (j < text.length) {
    if (text[j] === '`') {
      j += 2;
      continue;
    }
    if (text[j] === '"') {
      if (text[j + 1] === '"') {
        j += 2;
        continue;
      }
      break;
    }
    j++;
  }
  return j + 1;
}

function scanPowerShell(text) {
  const findings = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '<' && text[i + 1] === '#') {
      findings.push({ index: i, message: 'block comment' });
      const end = text.indexOf('#>', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (c === '@' && (text[i + 1] === '"' || text[i + 1] === "'")) {
      i = skipPowerShellHereString(text, i);
      continue;
    }
    if (c === "'") {
      i = skipPowerShellSingle(text, i);
      continue;
    }
    if (c === '"') {
      i = skipPowerShellDouble(text, i);
      continue;
    }
    if (c === '#') {
      const prev = i === 0 ? '' : text[i - 1];
      if (prev === '' || /[\s({;,=|]/.test(prev)) {
        findings.push({ index: i, message: 'line comment' });
        while (i < text.length && text[i] !== '\n') i++;
        continue;
      }
    }
    i++;
  }
  return findings;
}

function scanYamlLine(line, offset, findings) {
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === "'") {
      i = skipPowerShellSingle(line, i);
      continue;
    }
    if (c === '"') {
      i = skipQuoted(line, i, '"', true);
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      findings.push({ index: offset + i, message: 'line comment' });
      return;
    }
    i++;
  }
}

function scanYaml(text) {
  const findings = [];
  let offset = 0;
  let blockIndent = -1;
  for (const line of text.split('\n')) {
    const indent = line.length - line.trimStart().length;
    const blank = line.trim() === '';
    if (blockIndent >= 0 && (blank || indent > blockIndent)) {
      offset += line.length + 1;
      continue;
    }
    blockIndent = -1;
    scanYamlLine(line, offset, findings);
    if (!blank && /(^|[\s:-])[|>][-+0-9]*\s*$/.test(line)) {
      blockIndent = indent;
    }
    offset += line.length + 1;
  }
  return findings;
}

function scanToml(text) {
  const findings = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (text.startsWith('"""', i) || text.startsWith("'''", i)) {
      const closer = text.slice(i, i + 3);
      const end = text.indexOf(closer, i + 3);
      i = end === -1 ? text.length : end + 3;
      continue;
    }
    if (c === '"') {
      i = skipQuoted(text, i, '"', true);
      continue;
    }
    if (c === "'") {
      i = skipQuoted(text, i, "'", false);
      continue;
    }
    if (c === '#') {
      findings.push({ index: i, message: 'line comment' });
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    i++;
  }
  return findings;
}

function skipLongBracket(text, start) {
  const open = /^\[(=*)\[/.exec(text.slice(start, start + 64));
  if (!open) return -1;
  const closer = `]${open[1]}]`;
  const end = text.indexOf(closer, start + open[0].length);
  return end === -1 ? text.length : end + closer.length;
}

function scanLua(text) {
  const findings = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '-' && text[i + 1] === '-') {
      const after = skipLongBracket(text, i + 2);
      findings.push({ index: i, message: after === -1 ? 'line comment' : 'block comment' });
      if (after !== -1) {
        i = after;
        continue;
      }
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipQuoted(text, i, c, true);
      continue;
    }
    if (c === '[') {
      const after = skipLongBracket(text, i);
      if (after !== -1) {
        i = after;
        continue;
      }
    }
    i++;
  }
  return findings;
}

const scanners = {
  '.ts': (text) => scanCLike(text, 'js'),
  '.js': (text) => scanCLike(text, 'js'),
  '.mjs': (text) => scanCLike(text, 'js'),
  '.cs': (text) => scanCLike(text, 'cs'),
  '.go': (text) => scanCLike(text, 'go'),
  '.py': scanPython,
  '.html': scanSvelte,
  '.css': scanCss,
  '.svelte': scanSvelte,
  '.ps1': scanPowerShell,
  '.sh': scanShell,
  '.yaml': scanYaml,
  '.yml': scanYaml,
  '.toml': scanToml,
  '.lua': scanLua
};

function scanMarkers(text) {
  const findings = [];
  const words = ['TO' + 'DO', 'FIX' + 'ME'];
  const pattern = new RegExp(`\\b(${words.join('|')})\\b`, 'g');
  let match;
  while ((match = pattern.exec(text)) !== null) {
    findings.push({ index: match.index, message: `${match[1]} marker` });
  }
  return findings;
}

function locate(text, index) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

const files = [];
for (const entry of roots) {
  const target = join(root, entry);
  try {
    statSync(target);
  } catch {
    continue;
  }
  collectFiles(target, files);
}

let problems = 0;
for (const file of files) {
  const relativePath = relative(root, file).split('\\').join('/');
  if (generatedExemptions.includes(relativePath)) continue;
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const findings = [...scanners[extname(file)](text), ...scanMarkers(text)].sort(
    (a, b) => a.index - b.index
  );
  for (const finding of findings) {
    const { line, column } = locate(text, finding.index);
    console.log(`${relativePath}:${line}:${column}: ${finding.message}`);
    problems++;
  }
}

if (problems > 0) {
  console.error(`check-no-comments: ${problems} comment token(s) found in ${files.length} file(s)`);
  process.exit(1);
}
console.log(`check-no-comments: ${files.length} file(s) clean`);
