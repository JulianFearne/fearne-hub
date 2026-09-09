// ============================================================================
// AnimalPlaceThing.jsx — Fearne Hub game component
// ----------------------------------------------------------------------------
// Supabase-backed multiplayer. Imports scoring from ./scoring (single source
// of truth) and DB access from ./animalPlaceThingData (mirrors the
// recipesData.js pattern — pages never touch the Supabase client directly).
// Styling scoped under .animal-place-thing (see AnimalPlaceThing.css) so
// nothing leaks into the hub shell — mirrors the .recipe-book pattern.
//
// User identity comes from useAuth(), like every other page in the hub —
// this component takes no props.
// ============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  CATEGORIES,
  RULES_VERSION,
  scoreRound,
  totalScores,
  shapeRounds,
} from "./scoring";
import {
  loadSessionSnapshot,
  subscribeToSessionChanges,
  unsubscribeFromSession,
  insertGameSession,
  getSessionByCode,
  upsertPlayer,
  removePlayer,
  updateSession,
  upsertSubmission,
  getSubmittedUserCount,
} from "./animalPlaceThingData";
import "./AnimalPlaceThing.css";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
// Hard letters (framework P2 #15): excluded from the pool except in alphabet
// mode, so younger kids aren't stumped by X/Q/Z.
const HARD = new Set(["Q", "X", "Z"]);
const ROUND_SECONDS = 90;

const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
const randCode = () =>
  Array.from({ length: 6 }, () => codeChars[Math.floor(Math.random() * codeChars.length)]).join("");

function pickLetter(used, endCondition) {
  const pool = LETTERS.filter((l) => !used.includes(l)).filter(
    (l) => endCondition === "alphabet" || !HARD.has(l)
  );
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function AnimalPlaceThing() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Hub profiles don't carry a display name column, so fall back to the
  // part of the email before the @ (same pattern as Home.jsx's greeting).
  const displayName = user?.email ? user.email.split("@")[0] : "Player";

  const [screen, setScreen] = useState("home"); // home|lobby|game|roundResult|final
  const [createCode, setCreateCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]); // [{user_id, display_name, joined_at}]
  const [submissions, setSubmissions] = useState([]); // rows for the whole session

  const [myAnswers, setMyAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  const [endCondition, setEndCondition] = useState("manual");
  const [pointGoal, setPointGoal] = useState(50);

  const answersRef = useRef({}); // framework P0 #2: timer reads live answers
  const timerRef = useRef(null);
  const channelRef = useRef(null);
  const sessionId = session?.id || null;

  // Derived, never stored locally (framework P0 #4).
  const isHost = !!session && session.host_id === userId;

  useEffect(() => {
    answersRef.current = myAnswers;
  }, [myAnswers]);

  // ── Load a full session snapshot ──────────────────────────────────────────
  const loadAll = useCallback(async (sid) => {
    const { session: s, players: p, submissions: subs } = await loadSessionSnapshot(sid);
    if (s) setSession(s);
    if (p) setPlayers(p);
    if (subs) setSubmissions(subs);
  }, []);

  // ── Realtime subscription (framework Phase 1: replaces polling) ───────────
  useEffect(() => {
    if (!sessionId) return;
    const ch = subscribeToSessionChanges(sessionId, {
      onSessionUpdate: (row) => setSession(row),
      onPlayersChange: () => loadAll(sessionId), // player set changed; re-pull (also handles host migration)
      onSubmissionsChange: () => loadAll(sessionId),
    });
    channelRef.current = ch;

    // Slow safety-net poll for reconnect gaps only (framework Phase 1 note).
    const safety = setInterval(() => loadAll(sessionId), 10000);

    return () => {
      unsubscribeFromSession(ch);
      clearInterval(safety);
    };
  }, [sessionId, loadAll]);

  // ── React to phase changes ────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const phase = session.phase;

    if (phase === "playing" && (screen === "lobby" || screen === "roundResult")) {
      setScreen("game");
      setMyAnswers({});
      setSubmitted(false);
    } else if (phase === "round_result" && screen !== "roundResult") {
      setScreen("roundResult");
    } else if (phase === "final" && screen !== "final") {
      setScreen("final");
    }
  }, [session?.phase, session?.round]); // eslint-disable-line

  // Track whether I've already submitted this round (survives refresh).
  useEffect(() => {
    if (!session || session.phase !== "playing") return;
    const mine = submissions.find((r) => r.round === session.round && r.user_id === userId);
    setSubmitted(!!mine);
  }, [submissions, session?.round, session?.phase, userId]);

  // ── Timer (framework P0 #1 & #2) ─────────────────────────────────────────
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!session || session.phase !== "playing" || !session.deadline) {
      setTimeLeft(null);
      return;
    }
    const deadlineMs = new Date(session.deadline).getTime();
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        clearInterval(timerRef.current);
        // Auto-submit CURRENT answers via the ref (not a stale closure).
        finalize(answersRef.current);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => clearInterval(timerRef.current);
  }, [session?.phase, session?.round, session?.deadline]); // eslint-disable-line

  // ── Scoring (derived, never stored) ───────────────────────────────────────
  const usedLetters = session?.used_letters || [];
  const totals = useMemo(
    () => totalScores(shapeRounds(submissions, usedLetters)),
    [submissions, usedLetters]
  );
  const roundResult = useMemo(() => {
    if (!session?.current_letter) return null;
    const roundSubs = submissions.filter((r) => r.round === session.round);
    const byUser = {};
    roundSubs.forEach((r) => (byUser[r.user_id] = { answers: r.answers || {} }));
    return scoreRound(session.current_letter, byUser);
  }, [submissions, session?.round, session?.current_letter]);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => (totals[b.user_id] || 0) - (totals[a.user_id] || 0)),
    [players, totals]
  );

  const nameOf = useCallback(
    (uid) => players.find((p) => p.user_id === uid)?.display_name || "Player",
    [players]
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  async function createSession() {
    const code = randCode();
    let data;
    try {
      data = await insertGameSession({
        id: code,
        hostId: userId,
        endCondition,
        pointGoal,
        rulesVersion: RULES_VERSION,
      });
    } catch (err) {
      return setJoinError("Couldn't create game. Try again.");
    }
    await upsertPlayer(code, userId, displayName);
    setCreateCode(code);
    setSession(data);
    await loadAll(code);
    setScreen("lobby");
  }

  async function joinSession() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    const s = await getSessionByCode(code);
    if (!s) return setJoinError("Session not found.");
    if (s.phase !== "lobby") return setJoinError("That game has already started.");
    // Version check the hub way: the session stamped its rules_version at
    // creation; if this device's bundle differs, scoring could diverge.
    if (s.rules_version != null && s.rules_version !== RULES_VERSION) {
      return setJoinError("This game was made on a newer version. Refresh the page, then rejoin.");
    }
    await upsertPlayer(code, userId, displayName);
    setSession(s);
    await loadAll(code);
    setScreen("lobby");
    setJoinError("");
  }

  async function startRound() {
    const letter = pickLetter(session.used_letters || [], session.end_condition);
    if (!letter) {
      await updateSession(sessionId, { phase: "final" });
      return;
    }
    await updateSession(sessionId, {
      phase: "playing",
      current_letter: letter,
      used_letters: [...(session.used_letters || []), letter],
      round: (session.round || 0) + 1,
      deadline: new Date(Date.now() + ROUND_SECONDS * 1000).toISOString(),
    });
  }

  // Single submission path for both manual submit and timer expiry
  // (framework P0 #1: no divergent code paths).
  const finalize = useCallback(
    async (answers) => {
      if (!session || session.phase !== "playing") return;
      if (submitted) return;
      setSubmitted(true);
      await upsertSubmission(session.id, session.round, userId, answers || {});
      // If everyone's in, whoever detects it flips the phase. Idempotent —
      // the update is a no-op if another client already flipped it.
      const submittedCount = await getSubmittedUserCount(session.id, session.round);
      if (submittedCount >= players.length) {
        await revealRound();
      }
    },
    [session, submitted, userId, players.length] // eslint-disable-line
  );

  async function revealRound() {
    await updateSession(sessionId, { phase: "round_result" });
  }

  async function nextRound() {
    // Win-condition checks (framework: derived from live totals, guarded).
    const scores = Object.values(totals);
    const maxScore = scores.length ? Math.max(...scores) : 0; // #14 guard
    const hitGoal =
      session.end_condition === "points" && session.point_goal && maxScore >= session.point_goal;
    const alphabetDone =
      session.end_condition === "alphabet" && (session.used_letters || []).length >= 26;

    if (hitGoal || alphabetDone) {
      await updateSession(sessionId, { phase: "final" });
    } else {
      await startRound();
    }
  }

  async function endGame() {
    await updateSession(sessionId, { phase: "final" });
  }

  async function leaveToHome() {
    if (sessionId) {
      await removePlayer(sessionId, userId);
    }
    setScreen("home");
    setSession(null);
    setPlayers([]);
    setSubmissions([]);
    setCreateCode("");
    setJoinCode("");
  }

  const submittedThisRound = useMemo(
    () => new Set(submissions.filter((r) => r.round === session?.round).map((r) => r.user_id)),
    [submissions, session?.round]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animal-place-thing">
      {screen === "home" && (
        <div className="apt-center">
          <div className="apt-hero">
            <div className="apt-big-letter">A</div>
            <h1 className="apt-title">Animal<span className="apt-accent">Place</span>Thing</h1>
            <p className="apt-subtitle">The fast-thinking alphabet game</p>
          </div>

          <div className="apt-card">
            <div className="apt-block">
              <span className="apt-block-label">Create a game</span>
              <label className="apt-field">
                <span>Win condition</span>
                <select value={endCondition} onChange={(e) => setEndCondition(e.target.value)}>
                  <option value="manual">Host ends the game</option>
                  <option value="points">First to a point goal</option>
                  <option value="alphabet">Play the whole alphabet</option>
                </select>
              </label>
              {endCondition === "points" && (
                <label className="apt-field">
                  <span>Point goal</span>
                  <input
                    type="number"
                    min={10}
                    value={pointGoal}
                    onChange={(e) => setPointGoal(Number(e.target.value))}
                  />
                </label>
              )}
              <button className="apt-btn apt-btn-primary" onClick={createSession}>
                Create game
              </button>
            </div>

            <div className="apt-or"><span>or</span></div>

            <div className="apt-block">
              <span className="apt-block-label">Join a game</span>
              <input
                className="apt-code-input"
                placeholder="GAME CODE"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  if (joinError) setJoinError(""); // framework #12
                }}
                maxLength={6}
              />
              {joinError && <p className="apt-error">{joinError}</p>}
              <button className="apt-btn apt-btn-ghost" onClick={joinSession}>
                Join game
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "lobby" && session && (
        <div className="apt-center">
          <div className="apt-card">
            <p className="apt-hint">Share this code</p>
            <div className="apt-code-display">
              {createCode || session.id}
              <button
                className="apt-copy"
                onClick={() => navigator.clipboard?.writeText(createCode || session.id)}
                title="Copy code"
              >
                Copy
              </button>
            </div>

            <div className="apt-players">
              <span className="apt-players-count">{players.length} in the lobby</span>
              {players.map((p) => (
                <div key={p.user_id} className="apt-player-chip">
                  <span className="apt-dot" />
                  {p.display_name}
                  {p.user_id === userId ? " (you)" : ""}
                  {p.user_id === session.host_id ? " · host" : ""}
                </div>
              ))}
            </div>

            {isHost ? (
              <button
                className="apt-btn apt-btn-primary"
                onClick={startRound}
                disabled={players.length < 2}
              >
                {players.length < 2 ? "Waiting for players…" : "Start first round →"}
              </button>
            ) : (
              <p className="apt-hint">Waiting for the host to start…</p>
            )}
            <button className="apt-btn apt-btn-text" onClick={leaveToHome}>
              Leave
            </button>
          </div>
        </div>
      )}

      {screen === "game" && session?.current_letter && (
        <div className="apt-game">
          <div className="apt-game-head">
            <div className="apt-letter-badge">{session.current_letter}</div>
            <div className="apt-round-info">
              <span className="apt-round-label">Round {session.round}</span>
              {timeLeft !== null && (
                <div
                  className={
                    "apt-timer" +
                    (timeLeft <= 10 ? " apt-timer-critical" : timeLeft <= 15 ? " apt-timer-warn" : "")
                  }
                >
                  {timeLeft}s
                </div>
              )}
            </div>
            <div className="apt-mini-scores">
              {sortedPlayers.slice(0, 3).map((p) => (
                <span key={p.user_id} className={p.user_id === userId ? "apt-mini-me" : ""}>
                  {p.display_name.split(" ")[0]}: {totals[p.user_id] || 0}
                </span>
              ))}
            </div>
          </div>

          <div className="apt-answers">
            {CATEGORIES.map((cat) => (
              <label key={cat} className="apt-answer-row">
                <span className="apt-cat">{cat}</span>
                <input
                  disabled={submitted}
                  placeholder={`${cat} with ${session.current_letter}…`}
                  value={myAnswers[cat] || ""}
                  onChange={(e) => setMyAnswers((prev) => ({ ...prev, [cat]: e.target.value }))}
                />
              </label>
            ))}
          </div>

          {!submitted ? (
            <button className="apt-btn apt-btn-primary" onClick={() => finalize(myAnswers)}>
              Submit answers
            </button>
          ) : (
            <p className="apt-hint">
              Waiting for others… {submittedThisRound.size}/{players.length} in
            </p>
          )}

          {isHost && (
            <button className="apt-btn apt-btn-text" onClick={revealRound}>
              Reveal now (skip stragglers)
            </button>
          )}
        </div>
      )}

      {screen === "roundResult" && roundResult && (
        <div className="apt-center">
          <div className="apt-card apt-card-wide">
            <h2 className="apt-result-title">
              Round {session.round} · <span className="apt-accent">{session.current_letter}</span>
            </h2>

            {/* Desktop table */}
            <div className="apt-result-table">
              <div className="apt-result-head">
                <span>Player</span>
                {CATEGORIES.map((c) => (
                  <span key={c}>{c}</span>
                ))}
                <span>+Pts</span>
              </div>
              {players.map((p) => {
                const r = roundResult.byUser[p.user_id];
                return (
                  <div
                    key={p.user_id}
                    className={"apt-result-row" + (p.user_id === userId ? " apt-me" : "")}
                  >
                    <span className="apt-rc-name">{p.display_name}</span>
                    {CATEGORIES.map((cat) => {
                      const cell = r?.categories?.[cat];
                      return (
                        <span key={cat} className={"apt-rc apt-rc-" + (cell?.status || "blank")}>
                          {cell?.raw || "—"}
                        </span>
                      );
                    })}
                    <span className="apt-rc-pts">+{r?.total || 0}</span>
                  </div>
                );
              })}
            </div>

            {/* Mobile cards (framework Phase 3: table unreadable < 600px) */}
            <div className="apt-result-cards">
              {players.map((p) => {
                const r = roundResult.byUser[p.user_id];
                return (
                  <div
                    key={p.user_id}
                    className={"apt-rcard" + (p.user_id === userId ? " apt-me" : "")}
                  >
                    <div className="apt-rcard-head">
                      <span>{p.display_name}</span>
                      <span className="apt-rc-pts">+{r?.total || 0}</span>
                    </div>
                    {CATEGORIES.map((cat) => {
                      const cell = r?.categories?.[cat];
                      return (
                        <div key={cat} className="apt-rcard-row">
                          <span className="apt-rcard-cat">{cat}</span>
                          <span className={"apt-rc apt-rc-" + (cell?.status || "blank")}>
                            {cell?.raw || "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="apt-totals">
              <h3>Total scores</h3>
              {sortedPlayers.map((p) => (
                <div key={p.user_id} className="apt-total-row">
                  <span>
                    {p.display_name}
                    {p.user_id === userId ? " (you)" : ""}
                  </span>
                  <span className="apt-total-pts">{totals[p.user_id] || 0}</span>
                </div>
              ))}
            </div>

            {isHost ? (
              <div className="apt-btn-row">
                <button className="apt-btn apt-btn-primary" onClick={nextRound}>
                  Next round →
                </button>
                <button className="apt-btn apt-btn-danger" onClick={endGame}>
                  End game
                </button>
              </div>
            ) : (
              <p className="apt-hint">Waiting for the host…</p>
            )}
          </div>
        </div>
      )}

      {screen === "final" && session && (
        <div className="apt-center">
          <div className="apt-card">
            <div className="apt-trophy">🏆</div>
            <h2 className="apt-result-title">Game over</h2>
            <div className="apt-podium">
              {sortedPlayers.map((p, i) => (
                <div key={p.user_id} className={"apt-podium-row" + (i === 0 ? " apt-first" : "")}>
                  <span className="apt-rank">{i + 1}</span>
                  <span className="apt-podium-name">
                    {p.display_name}
                    {p.user_id === userId ? " (you)" : ""}
                  </span>
                  <span className="apt-podium-pts">{totals[p.user_id] || 0}</span>
                </div>
              ))}
            </div>
            {usedLetters.length > 0 && (
              <p className="apt-hint">Letters played: {usedLetters.join(" · ")}</p>
            )}
            <button className="apt-btn apt-btn-primary" onClick={leaveToHome}>
              Back to games
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
