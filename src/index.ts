
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CHARACTER_INDEX_URL = "https://api.hakush.in/zzz/data/character.json";
const CHARACTER_DETAIL_URL = "https://api.hakush.in/zzz/data/ja/character";
const OUTPUT_DIR = "output/character";

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`unexpected response from ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function ensureDirectory(path: string) {
  await mkdir(path, { recursive: true });
}

async function saveDetail(key: string, data: unknown) {
  const destination = join(OUTPUT_DIR, `${key}.json`);
  await ensureDirectory(dirname(destination));
  await writeFile(destination, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const characterIndex = await fetchJson<Record<string, unknown>>(CHARACTER_INDEX_URL);
    await ensureDirectory(OUTPUT_DIR);
    for (const key of Object.keys(characterIndex)) {
      const detailUrl = `${CHARACTER_DETAIL_URL}/${encodeURIComponent(key)}.json`;
      const detail = await fetchJson(detailUrl);
      await saveDetail(key, detail);
      console.log(`saved ${key}`);
    }
  } catch (error) {
    console.error("Unable to fetch or save character data:", error);
    process.exitCode = 1;
  }
}

void main();
