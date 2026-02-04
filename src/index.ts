
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CHARACTER_INDEX_URL = "https://api.hakush.in/zzz/data/character.json";
const CHARACTER_DETAIL_URL = "https://api.hakush.in/zzz/data/ja/character";
const OUTPUT_DIR = "output/character";

type RawCharacter = Record<string, unknown>;

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

function pickFirstValue(value: RawCharacter | undefined) {
  if (!value) return undefined;
  for (const entry of Object.values(value)) {
    if (entry !== undefined) return entry;
  }
  return undefined;
}

function simplifyStats(stats: RawCharacter | undefined): RawCharacter | undefined {
  if (!stats) return undefined;
  const simplified: RawCharacter = {};
  for (const [key, entry] of Object.entries(stats)) {
    if (typeof entry === "number") {
      simplified[key] = entry;
    }
  }
  return Object.keys(simplified).length ? simplified : undefined;
}

function getString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return undefined;
}

function simplifyCharacter(detail: RawCharacter): RawCharacter {
  const simplified: RawCharacter = {
    Id: detail.Id,
    Name: detail.Name,
    CodeName: detail.CodeName,
    Rarity: detail.Rarity,
    WeaponType: pickFirstValue(detail.WeaponType as RawCharacter | undefined),
    ElementType: pickFirstValue(detail.ElementType as RawCharacter | undefined),
    SpecialElementType: getString((detail.SpecialElementType as RawCharacter | undefined)?.Name),
    HitType: pickFirstValue(detail.HitType as RawCharacter | undefined),
    Camp: pickFirstValue(detail.Camp as RawCharacter | undefined)
  };
  const stats = simplifyStats(detail.Stats as RawCharacter | undefined);
  if (stats) simplified.Stats = stats;
  for (const key of [
    "Level",
    "ExtraLevel",
    "LevelEXP",
    "Skill",
    "SkillList",
    "Passive",
    "Talent",
    "FairyRecommend",
    "Potential",
    "PotentialDetail",
    "Live2D"
  ] as const) {
    const entry = detail[key];
    if (entry !== undefined) {
      simplified[key] = entry;
    }
  }
  return simplified;
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

function getFileName(key: string, detail: RawCharacter) {
  const codeName = getString(detail.CodeName);
  if (!codeName) return key;
  const slug = slugify(codeName);
  return slug.length ? slug : key;
}

async function saveSimplified(key: string, detail: RawCharacter, data: RawCharacter) {
  const destination = join(OUTPUT_DIR, `${getFileName(key, detail)}.json`);
  await ensureDirectory(dirname(destination));
  await writeFile(destination, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const characterIndex = await fetchJson<Record<string, unknown>>(CHARACTER_INDEX_URL);
    await ensureDirectory(OUTPUT_DIR);
    for (const key of Object.keys(characterIndex)) {
      const detailUrl = `${CHARACTER_DETAIL_URL}/${encodeURIComponent(key)}.json`;
      const detail = await fetchJson<RawCharacter>(detailUrl);
      const simplified = simplifyCharacter(detail);
      await saveSimplified(key, detail, simplified);
      console.log(`saved ${key}`);
    }
  } catch (error) {
    console.error("Unable to fetch or save character data:", error);
    process.exitCode = 1;
  }
}

void main();
