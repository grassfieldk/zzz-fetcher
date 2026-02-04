import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CHARACTER_URL = "https://api.hakush.in/zzz/data/character.json";
const OUTPUT_PATH = "output/character.json";

async function fetchCharacterData() {
  const response = await fetch(CHARACTER_URL);
  if (!response.ok) {
    throw new Error(`Unexpected response: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function ensureOutputDirectory(path: string) {
  await mkdir(dirname(path), { recursive: true });
}

async function saveAsJson(path: string, data: unknown) {
  await ensureOutputDirectory(path);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const payload = await fetchCharacterData();
    await saveAsJson(OUTPUT_PATH, payload);
    console.log(`Saved characters to ${OUTPUT_PATH}`);
  } catch (error) {
    console.error("Unable to fetch or save character data:", error);
    process.exitCode = 1;
  }
}

void main();