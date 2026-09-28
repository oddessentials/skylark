const jsonModules = import.meta.glob('/fixtures/api/**/*.json', {
  eager: true,
  import: 'default'
}) as Record<string, unknown>;

const prefix = '/fixtures/api/';

const documents = new Map<string, unknown>();
for (const [modulePath, document] of Object.entries(jsonModules)) {
  documents.set(modulePath.slice(prefix.length, modulePath.length - '.json'.length), document);
}

export function getFixture(name: string): unknown {
  return documents.get(name);
}

export function hasFixture(name: string): boolean {
  return documents.has(name);
}

export function fixtureNames(): string[] {
  return [...documents.keys()].sort();
}

export function cloneFixture<T>(name: string): T | undefined {
  const document = documents.get(name);
  return document === undefined ? undefined : (structuredClone(document) as T);
}
