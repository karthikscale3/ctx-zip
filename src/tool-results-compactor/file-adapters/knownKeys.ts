// In-memory registry of known storage keys per storage URI, scoped to this process

const storageUriToKeys: Map<string, Set<string>> = new Map();

export function registerKnownKey(storageUri: string, key: string): void {
  if (!storageUri || !key) return;
  const uri = storageUri;
  const set = storageUriToKeys.get(uri) ?? new Set<string>();
  set.add(key);
  storageUriToKeys.set(uri, set);
}

export function isKnownKey(storageUri: string, key: string): boolean {
  const set = storageUriToKeys.get(storageUri);
  if (!set) return false;
  return set.has(key);
}

export function getKnownKeys(storageUri?: string): string[] {
  if (storageUri) {
    return Array.from(storageUriToKeys.get(storageUri) ?? []);
  }
  const all: string[] = [];
  for (const set of storageUriToKeys.values()) {
    for (const key of set) all.push(key);
  }
  return all;
}
