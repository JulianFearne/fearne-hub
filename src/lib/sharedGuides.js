// src/lib/sharedGuides.js
// Fearne Hub :: the family's shared library of exercise how-to cues
// (exercise_guides table, _reference/workout-schema-v6.sql). Fetched once
// per page load and kept in memory; components read it through
// useSharedGuides(). If the table isn't there yet, it's simply empty.

import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { guideKey } from "../data/exerciseGuides";

let cache = null;     // Map key -> { name, guide }
let pending = null;   // in-flight fetch
const listeners = new Set();

async function fetchAll() {
  const { data, error } = await supabase.from("exercise_guides").select("key, name, guide");
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [r.key, { name: r.name, guide: r.guide }]));
}

export function loadSharedGuides() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetchAll().then((m) => {
      cache = m;
      pending = null;
      listeners.forEach((fn) => fn(cache));
      return cache;
    });
  }
  return pending;
}

/** The shared library as a Map, re-rendering when it loads or changes. */
export function useSharedGuides() {
  const [map, setMap] = useState(cache ?? new Map());
  useEffect(() => {
    const fn = (m) => setMap(new Map(m));
    listeners.add(fn);
    loadSharedGuides().then(fn);
    return () => listeners.delete(fn);
  }, []);
  return map;
}

export const sharedGuideFor = (map, name) => map.get(guideKey(name))?.guide ?? null;

const hasContent = (g) => g && (g.setup?.length || g.cues?.length || g.mistakes?.length);

/**
 * Add a programme's cues to the shared library, only for exercises that
 * have none there yet: the first version is kept. Best effort.
 */
export async function addMissingGuides(definition) {
  const rows = new Map();
  (definition?.chains || []).forEach((c) =>
    (c.exercises || []).forEach((e) => {
      if (hasContent(e.guide) && !rows.has(guideKey(e.name))) {
        rows.set(guideKey(e.name), { key: guideKey(e.name), name: e.name, guide: e.guide });
      }
    })
  );
  if (!rows.size) return;
  const { error } = await supabase
    .from("exercise_guides")
    .upsert([...rows.values()], { onConflict: "key", ignoreDuplicates: true });
  if (!error) { cache = null; loadSharedGuides(); }
}

/** Save cues someone edited on purpose: these replace the shared copy. */
export async function saveSharedGuides(entries) {
  const rows = entries.filter((e) => hasContent(e.guide)).map((e) => ({
    key: guideKey(e.name),
    name: e.name,
    guide: e.guide,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await supabase.from("exercise_guides").upsert(rows, { onConflict: "key" });
  if (error) throw new Error("Couldn't save to the shared cue library. Has workout-schema-v6.sql been run?");
  cache = null;
  await loadSharedGuides();
}
