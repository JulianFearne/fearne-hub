// src/lib/workoutLive.js
// Fearne Hub :: the in-progress workout, kept on the device so closing the
// page (or the phone locking) loses nothing: the open session, the sets
// ticked off so far for each exercise, and the rest timer's end time.
// No Supabase here; sets reach the database when an exercise is finished.

const key = (programId) => `fh-workout-live-${programId}`;

// a session left open longer than this is treated as abandoned
const STALE_MS = 12 * 60 * 60 * 1000;

export const emptyLive = () => ({ sessionId: null, sessionStart: null, drafts: {}, rest: null });

export function loadLive(programId) {
  try {
    const raw = localStorage.getItem(key(programId));
    if (!raw) return emptyLive();
    const live = { ...emptyLive(), ...JSON.parse(raw) };
    const lastTouched = live.touchedAt ?? live.sessionStart ?? 0;
    if (Date.now() - lastTouched > STALE_MS) return emptyLive();
    return live;
  } catch {
    return emptyLive();
  }
}

export function saveLive(programId, live) {
  try {
    localStorage.setItem(key(programId), JSON.stringify({ ...live, touchedAt: Date.now() }));
  } catch { /* private mode or storage full: the workout still runs, it just won't survive a reload */ }
}

export function clearLive(programId) {
  try { localStorage.removeItem(key(programId)); } catch { /* ignore */ }
}

/** Seconds left on a rest, negative once it has run over. */
export function restLeft(rest, now = Date.now()) {
  if (!rest) return 0;
  if (rest.pausedLeft != null) return rest.pausedLeft;
  return Math.ceil((rest.endAt - now) / 1000);
}

export const startRest = (seconds, label) => ({ endAt: Date.now() + seconds * 1000, total: seconds, label, pausedLeft: null });

export function togglePause(rest) {
  if (!rest) return rest;
  if (rest.pausedLeft != null) return { ...rest, endAt: Date.now() + rest.pausedLeft * 1000, pausedLeft: null };
  return { ...rest, pausedLeft: Math.max(0, restLeft(rest)) };
}

// ---------------------------------------------------------------------------
// Sound. iPhones ignore navigator.vibrate, so a short beep is the cue that a
// rest is over. iOS only lets a page make sound after a tap, so primeBeep()
// is called from the tap that ticks a set off.
// ---------------------------------------------------------------------------

let audioCtx = null;

export function primeBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* no audio, no problem */ }
}

export function beep() {
  try {
    if (!audioCtx || audioCtx.state !== "running") return;
    const t0 = audioCtx.currentTime;
    [0, 0.22].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.18);
    });
  } catch { /* ignore */ }
  if ("vibrate" in navigator) {
    try { navigator.vibrate([120, 60, 120]); } catch { /* ignore */ }
  }
}
