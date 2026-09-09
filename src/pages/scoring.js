// ============================================================================
// scoring.js — AnimalPlaceThing shared scoring module
// ----------------------------------------------------------------------------
// The SINGLE source of truth for scoring. Imported by BOTH the live game screen
// (for the "will this be a duplicate?" hint) and the reveal screen (final
// tally). Never reimplement any of this logic elsewhere — divergence between
// two copies is the #1 cause of "the number changed at reveal" bugs.
//
// Design guarantees:
//   • Pure: no Date, no randomness, no I/O. Same input → same output, always.
//   • Deterministic across devices: no locale-dependent operations.
//   • Order-independent: scoring depends on the SET of answers, not order.
//   • Single normalization: first-letter check and dedup key derive from ONE
//     canonical string, so they can never disagree.
//
// No external dependencies (keeps the hub's no-new-npm constraint).
// ============================================================================

export const RULES_VERSION = 1;

export const CATEGORIES = ["Object", "Name", "Animal", "Place", "Food"];

export const SCORE_UNIQUE = 10; // valid answer nobody else gave
export const SCORE_SHARED = 5; // valid answer at least one other player gave
export const SCORE_INVALID = 0; // blank, or wrong first letter

// Leading articles stripped before the first-letter check and before deduping,
// so "the antelope" counts as an A and matches "antelope".
// Keep this list tiny and English-only on purpose; expanding it invites
// surprises. If you want STRICT mode (answer must literally start with the
// letter), set STRIP_ARTICLES = false.
const STRIP_ARTICLES = true;
const ARTICLES = new Set(["a", "an", "the"]);

// ── Normalization ───────────────────────────────────────────────────────────
// Returns the canonical form of a raw answer. Everything downstream — the
// first-letter test AND the duplicate key — reads from THIS and nothing else.
//
// Pipeline (order matters, and must be identical on every device):
//   1. String coercion + trim
//   2. NFD decompose, strip combining marks  → de-accent (é → e)
//   3. toLowerCase (NOT toLocaleLowerCase — locale independence)
//   4. strip surrounding punctuation, collapse internal whitespace
//   5. strip a single leading article (if STRIP_ARTICLES)
export function normalize(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s) return "";

  // De-accent: decompose then drop the combining marks.
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Locale-independent lowercase. Do not swap for toLocaleLowerCase.
  s = s.toLowerCase();

  // Strip leading/trailing punctuation, collapse internal whitespace.
  s = s
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();

  if (STRIP_ARTICLES) {
    const parts = s.split(" ");
    if (parts.length > 1 && ARTICLES.has(parts[0])) {
      s = parts.slice(1).join(" ");
    }
  }

  return s;
}

// ── Letter validity ─────────────────────────────────────────────────────────
// An answer is valid for the round if its NORMALIZED form is non-empty and
// begins with the (normalized) round letter.
export function isValidForLetter(raw, letter) {
  const norm = normalize(raw);
  if (!norm) return false;
  const l = normalize(letter);
  if (!l) return false;
  return norm.startsWith(l[0]);
}

// ── Per-answer status (used by the live hint AND the reveal table) ───────────
// status: "blank" | "invalid" | "unique" | "shared"
// Same function drives both screens, so they can never disagree.
function statusFor(raw, letter, duplicateKeys) {
  const norm = normalize(raw);
  if (!norm) return "blank";
  if (!isValidForLetter(raw, letter)) return "invalid";
  return duplicateKeys.has(norm) ? "shared" : "unique";
}

function pointsForStatus(status) {
  if (status === "unique") return SCORE_UNIQUE;
  if (status === "shared") return SCORE_SHARED;
  return SCORE_INVALID; // blank or invalid
}

// ── Round scoring ───────────────────────────────────────────────────────────
// Pure. Input is a snapshot; output is fully determined by it.
//
// @param {string} letter                    the round's letter, e.g. "A"
// @param {Object<string, {answers: Object}>} submissionsByUser
//        keyed by userId → { answers: { Object, Name, Animal, Place, Food } }
//
// @returns {Object} {
//   rulesVersion,
//   letter,
//   byUser: {
//     [userId]: {
//       total,                                     // points this round
//       categories: { [cat]: { raw, status, points } }
//     }
//   }
// }
//
// Duplicate detection considers ONLY valid answers, so a wrong-letter entry
// never accidentally marks a correct one as shared.
export function scoreRound(letter, submissionsByUser) {
  const userIds = Object.keys(submissionsByUser || {});

  // Build per-category counts of valid, normalized answers.
  // dupKeys[cat] = Set of normalized values that appear 2+ times.
  const dupKeys = {};
  for (const cat of CATEGORIES) {
    const counts = new Map();
    for (const uid of userIds) {
      const raw = submissionsByUser[uid]?.answers?.[cat];
      if (!isValidForLetter(raw, letter)) continue; // invalid/blank excluded
      const key = normalize(raw);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const shared = new Set();
    for (const [key, n] of counts) if (n > 1) shared.add(key);
    dupKeys[cat] = shared;
  }

  const byUser = {};
  for (const uid of userIds) {
    const categories = {};
    let total = 0;
    for (const cat of CATEGORIES) {
      const raw = submissionsByUser[uid]?.answers?.[cat] ?? "";
      const status = statusFor(raw, letter, dupKeys[cat]);
      const points = pointsForStatus(status);
      categories[cat] = { raw, status, points };
      total += points;
    }
    byUser[uid] = { total, categories };
  }

  return { rulesVersion: RULES_VERSION, letter, byUser };
}

// ── Cross-round totals ──────────────────────────────────────────────────────
// Derive session totals from ALL submission rows (framework decision: never
// store totals; always recompute). Pure and order-independent.
//
// @param {Array<{letter: string, submissionsByUser: Object}>} rounds
// @returns {Object<string, number>} userId → cumulative points
export function totalScores(rounds) {
  const totals = {};
  for (const { letter, submissionsByUser } of rounds || []) {
    const { byUser } = scoreRound(letter, submissionsByUser);
    for (const [uid, r] of Object.entries(byUser)) {
      totals[uid] = (totals[uid] || 0) + r.total;
    }
  }
  return totals;
}

// ── Shaping helper for Supabase rows ────────────────────────────────────────
// Turn flat game_submissions rows into the { letter, submissionsByUser }
// shape scoreRound/totalScores expect. Pass the session's used_letters so each
// round maps to its letter. Rows with a round index beyond used_letters are
// ignored defensively.
//
// @param {Array<{round:number,user_id:string,answers:object}>} rows
// @param {string[]} usedLetters  index i = letter for round (i+1)
export function shapeRounds(rows, usedLetters) {
  const byRound = new Map();
  for (const row of rows || []) {
    const letter = usedLetters?.[row.round - 1];
    if (!letter) continue;
    if (!byRound.has(row.round)) {
      byRound.set(row.round, { letter, submissionsByUser: {} });
    }
    byRound.get(row.round).submissionsByUser[row.user_id] = {
      answers: row.answers || {},
    };
  }
  // Sorted by round for stable, readable output.
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
}
