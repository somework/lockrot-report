import { RUN_WORDS } from "../../domain/runTab";
import { useReport } from "../context";

export const SCORE_SECTION_ID = "how-the-score-works";

/** "How the score works ›": opens the Run tab and moves focus to its score section. */
export function ScoreModelLink() {
  const { dispatch } = useReport();
  return (
    <a
      className="score-model-link"
      href={`#${SCORE_SECTION_ID}`}
      onClick={(event) => {
        event.preventDefault();
        dispatch({ type: "view", view: "run" });
        requestAnimationFrame(() => {
          const section = document.getElementById(SCORE_SECTION_ID);
          section?.scrollIntoView({ block: "start" });
          section?.focus({ preventScroll: true });
        });
      }}
    >
      {RUN_WORDS.scoreLink}
    </a>
  );
}
