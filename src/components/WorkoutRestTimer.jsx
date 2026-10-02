// src/components/WorkoutRestTimer.jsx
// Rest timer for the workout tracker. It counts down to a stored end time
// rather than ticking a counter, so closing the page, switching apps or the
// phone locking doesn't stretch the rest: coming back shows the true time
// left, or how long ago it ran out.

import { useState, useEffect, useRef } from "react";
import { restLeft, beep } from "../lib/workoutLive";

export default function WorkoutRestTimer({ rest, inline = false, onTogglePause, onDismiss }) {
  const [, setNow] = useState(Date.now());
  const left = restLeft(rest);
  const paused = rest.pausedLeft != null;
  const done = left <= 0;
  const beeped = useRef(left <= 0); // a rest that ended while the page was shut stays quiet
  const wakeRef = useRef(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    if (done && !beeped.current && document.visibilityState === "visible") {
      beeped.current = true;
      beep();
    }
    if (!done) beeped.current = false;
  }, [done]);

  // keep the screen awake while resting; the lock drops whenever the page is
  // hidden, so take it again on the way back
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeRef.current) {
          const lock = await navigator.wakeLock.request("screen");
          if (cancelled) { lock.release(); return; }
          wakeRef.current = lock;
          lock.addEventListener?.("release", () => { wakeRef.current = null; });
        }
      } catch { /* not supported, no problem */ }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      try { wakeRef.current?.release(); } catch { /* already gone */ }
      wakeRef.current = null;
    };
  }, []);

  const pct = Math.max(0, Math.min(100, (left / rest.total) * 100));
  const abs = Math.abs(left);
  const clock = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;

  return (
    <div className={`fh-workout-timer${inline ? " fh-workout-timer--inline" : ""}`} data-done={done}>
      <div className="fh-workout-timer__count">{done ? (abs >= 1 ? `+${clock}` : "Go") : clock}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="fh-workout-timer__label">
          {done ? `Rest over · ${rest.label}` : paused ? `Paused · ${rest.label}` : `Resting · ${rest.label}`}
        </div>
        <div className="fh-workout-timer__bar"><span style={{ width: `${pct}%` }} /></div>
      </div>
      {!done && <button onClick={onTogglePause}>{paused ? "Resume" : "Pause"}</button>}
      <button onClick={onDismiss}>{done ? "Done" : "Skip"}</button>
    </div>
  );
}
