import fs from "node:fs";
import path from "node:path";

const root = "C:/user/tim/warhammer/battle-cal";
const armiesDir = path.join(root, "armies");
const outputPath = path.join(root, "supabase_army_seed.sql");

function sql(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function charMap(profile) {
  const result = {};
  for (const characteristic of profile.characteristics || []) {
    result[characteristic.name] = characteristic.$text || "";
  }
  return result;
}

function walk(selection, fn) {
  fn(selection);
  for (const child of selection.selections || []) walk(child, fn);
}

function isUnitProfile(profile) {
  return profile.typeName === "Einheit";
}

function isWeaponProfile(profile) {
  return /waffe/i.test(profile.typeName || "");
}

function parseIntText(value) {
  const match = String(value || "").match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function cleanKeywordText(value) {
  return String(value || "")
    .replace(/^[-–]$/, "")
    .split(/[,;]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function collectTopLevelUnits(roster) {
  const output = [];
  for (const force of roster.forces || []) {
    for (const selection of force.selections || []) {
      const categories = selection.categories || [];
      const isConfiguration = categories.some(category => category.name === "Konfiguration");
      if (isConfiguration || selection.type === "upgrade") continue;

      let hasUnit = false;
      walk(selection, node => {
        if ((node.profiles || []).some(isUnitProfile)) hasUnit = true;
      });
      if (hasUnit) output.push(selection);
    }
  }
  return output;
}

function extractUnit(selection, rosterId, sourceFile) {
  const unitProfiles = [];
  const weapons = [];
  let modelCount = 0;

  walk(selection, node => {
    const profiles = node.profiles || [];
    const nodeUnitProfiles = profiles.filter(isUnitProfile);
    if (nodeUnitProfiles.length) {
      modelCount += Number(node.number || 1);
      unitProfiles.push(...nodeUnitProfiles.map(profile => ({ node, profile })));
    }

    for (const profile of profiles.filter(isWeaponProfile)) {
      const chars = charMap(profile);
      weapons.push({
        id: `${rosterId}::${selection.id}::${node.id}::${profile.id}`,
        roster_id: rosterId,
        unit_id: `${rosterId}::${selection.id}`,
        name: profile.name,
        weapon_type: profile.typeName || "",
        count: Number(node.number || 1),
        range_text: chars.Reichweite || "",
        attacks_text: chars.A || "",
        skill_text: chars.KG || chars.BF || "",
        strength_text: chars.S || "",
        ap_text: chars.DS || "",
        damage_text: chars.SW || "",
        keywords: cleanKeywordText(chars.Schlüsselwort || chars.Schluesselwort || ""),
        raw_profile: profile
      });
    }
  });

  const primary = unitProfiles[0]?.profile;
  const primaryChars = primary ? charMap(primary) : {};

  return {
    unit: {
      id: `${rosterId}::${selection.id}`,
      roster_id: rosterId,
      source_file: sourceFile,
      name: selection.name,
      model_count: modelCount || Number(selection.number || 1),
      profile_name: primary?.name || selection.name,
      movement_text: primaryChars.B || "",
      toughness: parseIntText(primaryChars.W),
      save: parseIntText(primaryChars.RW),
      wounds_per_model: parseIntText(primaryChars.LP),
      leadership_text: primaryChars.MW || "",
      objective_control: parseIntText(primaryChars.MK),
      raw_selection: selection
    },
    weapons
  };
}

const rosters = [];
const units = [];
const weapons = [];

for (const file of fs.readdirSync(armiesDir).filter(item => item.endsWith(".json")).sort()) {
  const fullPath = path.join(armiesDir, file);
  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const roster = parsed.roster;
  const rosterId = slug(roster.name || file);

  rosters.push({
    id: rosterId,
    name: roster.name || file.replace(/\.json$/i, ""),
    source_file: `armies/${file}`,
    catalogue_name: roster.catalogueName || "",
    game_system_name: roster.gameSystemName || ""
  });

  for (const selection of collectTopLevelUnits(roster)) {
    const extracted = extractUnit(selection, rosterId, file);
    units.push(extracted.unit);
    weapons.push(...extracted.weapons);
  }
}

const lines = [];
lines.push("-- Generated from local armies/*.json files.");
lines.push("-- Run supabase_army_schema.sql first, then this file.");
lines.push("begin;");
lines.push("");

for (const roster of rosters) {
  lines.push(`insert into public.army_rosters (id, name, source_file, catalogue_name, game_system_name) values (${sql(roster.id)}, ${sql(roster.name)}, ${sql(roster.source_file)}, ${sql(roster.catalogue_name)}, ${sql(roster.game_system_name)}) on conflict (id) do update set name = excluded.name, source_file = excluded.source_file, catalogue_name = excluded.catalogue_name, game_system_name = excluded.game_system_name, updated_at = now();`);
}

lines.push("");

for (const unit of units) {
  lines.push(`insert into public.army_units (id, roster_id, source_file, name, model_count, profile_name, movement_text, toughness, save, wounds_per_model, leadership_text, objective_control, raw_selection) values (${sql(unit.id)}, ${sql(unit.roster_id)}, ${sql(unit.source_file)}, ${sql(unit.name)}, ${unit.model_count || 1}, ${sql(unit.profile_name)}, ${sql(unit.movement_text)}, ${unit.toughness ?? "null"}, ${unit.save ?? "null"}, ${unit.wounds_per_model ?? "null"}, ${sql(unit.leadership_text)}, ${unit.objective_control ?? "null"}, ${sql(JSON.stringify(unit.raw_selection))}::jsonb) on conflict (id) do update set name = excluded.name, model_count = excluded.model_count, profile_name = excluded.profile_name, movement_text = excluded.movement_text, toughness = excluded.toughness, save = excluded.save, wounds_per_model = excluded.wounds_per_model, leadership_text = excluded.leadership_text, objective_control = excluded.objective_control, raw_selection = excluded.raw_selection, updated_at = now();`);
}

lines.push("");

for (const weapon of weapons) {
  lines.push(`insert into public.army_weapons (id, roster_id, unit_id, name, weapon_type, count, range_text, attacks_text, skill_text, strength_text, ap_text, damage_text, keywords, raw_profile) values (${sql(weapon.id)}, ${sql(weapon.roster_id)}, ${sql(weapon.unit_id)}, ${sql(weapon.name)}, ${sql(weapon.weapon_type)}, ${weapon.count || 1}, ${sql(weapon.range_text)}, ${sql(weapon.attacks_text)}, ${sql(weapon.skill_text)}, ${sql(weapon.strength_text)}, ${sql(weapon.ap_text)}, ${sql(weapon.damage_text)}, array[${weapon.keywords.map(sql).join(", ")}]::text[], ${sql(JSON.stringify(weapon.raw_profile))}::jsonb) on conflict (id) do update set name = excluded.name, weapon_type = excluded.weapon_type, count = excluded.count, range_text = excluded.range_text, attacks_text = excluded.attacks_text, skill_text = excluded.skill_text, strength_text = excluded.strength_text, ap_text = excluded.ap_text, damage_text = excluded.damage_text, keywords = excluded.keywords, raw_profile = excluded.raw_profile, updated_at = now();`);
}

lines.push("");
lines.push("commit;");
lines.push("");

fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
console.log(`Wrote ${outputPath}`);
console.log(`${rosters.length} rosters, ${units.length} units, ${weapons.length} weapons`);
