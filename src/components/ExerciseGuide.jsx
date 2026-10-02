// src/components/ExerciseGuide.jsx
// "How to" button and panel for one exercise: setup, key cues and common
// mistakes, from the programme's own `guide` for the exercise if it has one,
// then the shared library (exercise_guides), then src/data/exerciseGuides.js
// (with a line on that version),
// plus the form video when the programme has one. The programme's own note
// (e.g. "Reps are each side") stays visible above the button.

import { useState } from "react";
import { guideFor } from "../data/exerciseGuides";
import { useSharedGuides, sharedGuideFor } from "../lib/sharedGuides";

export default function ExerciseGuide({ exercise }) {
  const [open, setOpen] = useState(false);
  const shared = useSharedGuides();
  // the programme's own cues, then the family's shared library, then the
  // cues built into the app
  const guide = exercise.guide ?? sharedGuideFor(shared, exercise.name) ?? guideFor(exercise.name);
  if (!guide && !exercise.note && !exercise.video_url) return null;

  return (
    <div className="fh-workout-guide">
      {exercise.note && <p className="fh-workout-guide__note">{exercise.note}</p>}
      {(guide || exercise.video_url) && <button
        className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "Hide how to" : "How to"}
      </button>}

      {open && (
        <GuideBody guide={guide} videoUrl={exercise.video_url} />
      )}
    </div>
  );
}

/** The setup / key cues / watch out for lists for one guide. */
export function GuideBody({ guide, videoUrl = "" }) {
  return (
    <div className="fh-workout-guide__panel">
      {guide?.focus && <p className="fh-workout-guide__focus">{guide.focus}</p>}

      {guide?.setup?.length > 0 && (
        <>
          <h4>Setup</h4>
          <ol>{guide.setup.map((x) => <li key={x}>{x}</li>)}</ol>
        </>
      )}
      {guide?.cues?.length > 0 && (
        <>
          <h4>Key cues</h4>
          <ul>{guide.cues.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}
      {guide?.mistakes?.length > 0 && (
        <>
          <h4>Watch out for</h4>
          <ul className="fh-workout-guide__mistakes">{guide.mistakes.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}
      {videoUrl && (
        <a href={videoUrl} target="_blank" rel="noreferrer" className="fh-workout-pill" style={{ textDecoration: "none" }}>
          Watch form video
        </a>
      )}
    </div>
  );
}
