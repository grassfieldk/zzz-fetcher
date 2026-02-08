
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CHARACTER_INDEX_URL = "https://api.hakush.in/zzz/data/character.json";
const CHARACTER_DETAIL_URL = "https://api.hakush.in/zzz/data/ja/character";
const OUTPUT_DIR = "output/character";
const TARGET_SKILL_LEVELS = [12, 16] as const;

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

function formatRarity(value: unknown) {
  if (value === 3 || value === 4) {
    return value === 3 ? "A" : "S";
  }
  return value;
}

function toLowerCamelCase(key: string) {
  return key
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

function stripHtmlTags(value: string) {
  return value.replace(/<([^>]+)>/g, (_, content) => (content.startsWith("IconMap:") ? `<${content}>` : ""));
}

function normalizeKeys(value: unknown): unknown {
  if (typeof value === "string") {
    return stripHtmlTags(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeKeys);
  }
  if (value && typeof value === "object") {
    const normalized: RawCharacter = {};
    for (const [key, entry] of Object.entries(value as RawCharacter)) {
      normalized[toLowerCamelCase(key)] = normalizeKeys(entry);
    }
    return normalized;
  }
  return value;
}

function shouldNormalizeAsPercent(key: string, format?: unknown) {
  const normalizedKey = key.toLowerCase();
  const formatString = typeof format === "string" ? format : "";
  if (normalizedKey === "main" && formatString.includes("%")) {
    return true;
  }
  return normalizedKey.includes("percentage") || normalizedKey.includes("ratio");
}

function buildLevelValues(stat: RawCharacter): RawCharacter {
  const format = stat.format;
  const levelValues: RawCharacter = {};
  for (const level of TARGET_SKILL_LEVELS) {
    const values: RawCharacter = {};
    for (const [key, entry] of Object.entries(stat)) {
      if (typeof entry !== "number" || key.endsWith("Growth")) {
        continue;
      }
      const growthKey = `${key}Growth`;
      const growthValue = typeof stat[growthKey] === "number" ? (stat[growthKey] as number) : 0;
      const raw = entry + (level - 1) * growthValue;
      values[key] = shouldNormalizeAsPercent(key, format) ? raw / 100 : raw;
    }
    if (Object.keys(values).length) {
      levelValues[level.toString()] = values;
    }
  }
  return levelValues;
}

function convertParamStat(stat: RawCharacter): RawCharacter {
  if (stat.levelValues && typeof stat.levelValues === "object") {
    return stat;
  }
  const levelValues = buildLevelValues(stat);
  const metadata: RawCharacter = {};
  for (const [key, entry] of Object.entries(stat)) {
    if (typeof entry !== "number" || key.endsWith("Growth")) {
      metadata[key] = entry;
    }
  }
  if (Object.keys(levelValues).length) {
    metadata.levelValues = levelValues;
  }
  return metadata;
}

function transformSkillParams(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(transformSkillParams);
  }
  if (value && typeof value === "object") {
    const transformed: RawCharacter = {};
    for (const [key, entry] of Object.entries(value as RawCharacter)) {
      if (key === "param" && entry && typeof entry === "object" && !Array.isArray(entry)) {
        const converted: RawCharacter = {};
        for (const [paramKey, paramValue] of Object.entries(entry as RawCharacter)) {
          if (paramValue && typeof paramValue === "object" && !Array.isArray(paramValue)) {
            converted[paramKey] = convertParamStat(paramValue as RawCharacter);
          } else {
            converted[paramKey] = paramValue;
          }
        }
        transformed[key] = converted;
        continue;
      }
      transformed[key] = transformSkillParams(entry);
    }
    return transformed;
  }
  return value;
}

function simplifyCharacter(detail: RawCharacter): RawCharacter {
  const simplified: RawCharacter = {
    Id: detail.Id,
    Name: detail.Name,
    CodeName: detail.CodeName,
    Rarity: formatRarity(detail.Rarity),
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
  const normalized = normalizeKeys(simplified) as RawCharacter;
  if (normalized.skill) {
    normalized.skill = transformSkillParams(normalized.skill);
  }
  return normalized;
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function getIndexFileName(key: string, indexEntry: RawCharacter) {
  const code = getString(indexEntry.CodeName ?? indexEntry.code);
  if (!code) return key;
  const slug = slugify(code);
  return slug.length ? slug : key;
}

async function saveSimplified(outputName: string, data: RawCharacter) {
  await ensureDirectory(OUTPUT_DIR);
  const destination = join(OUTPUT_DIR, `${outputName}.json`);
  await ensureDirectory(dirname(destination));
  await writeFile(destination, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const characterIndex = await fetchJson<Record<string, unknown>>(CHARACTER_INDEX_URL);
    await ensureDirectory(OUTPUT_DIR);
    let fetchedCount = 0;
    let skippedCount = 0;
    for (const key of Object.keys(characterIndex)) {
      const indexEntry = characterIndex[key] as RawCharacter | undefined;
      const outputName = getIndexFileName(key, indexEntry ?? {});
      const destination = join(OUTPUT_DIR, `${outputName}.json`);
      if (await fileExists(destination)) {
        skippedCount += 1;
        continue;
      }
      const detailUrl = `${CHARACTER_DETAIL_URL}/${encodeURIComponent(key)}.json`;
      const detail = await fetchJson<RawCharacter>(detailUrl);
      const simplified = simplifyCharacter(detail);
      await saveSimplified(outputName, simplified);
      fetchedCount += 1;
    }
    console.log(`saved ${fetchedCount} characters, skipped ${skippedCount} already downloaded`);
  } catch (error) {
    console.error("Unable to fetch or save character data:", error);
    process.exitCode = 1;
  }
}

void main();
