"use strict";

(() => {
  const PRACTICE_SHUTOUTS_KEY = "shut-the-box-practice-shutouts-v1";
  const roundResult = document.querySelector("#roundResult");
  const roundResultTitle = document.querySelector("#roundResultTitle");
  const roundResultScore = document.querySelector("#roundResultScore");
  const roundResultDetail = document.querySelector("#roundResultDetail");
  const instruction = document.querySelector("#instruction");

  if (!roundResult || !roundResultTitle || !roundResultScore || !roundResultDetail) return;

  let rewardedCurrentResult = false;

  function readPracticeShutouts() {
    try {
      const stored = Number(localStorage.getItem(PRACTICE_SHUTOUTS_KEY));
      return Number.isInteger(stored) && stored >= 0 ? stored : 0;
    } catch {
      return 0;
    }
  }

  function recordPracticeShutout() {
    const nextCount = readPracticeShutouts() + 1;
    try {
      localStorage.setItem(PRACTICE_SHUTOUTS_KEY, String(nextCount));
    } catch {
      // The reward still works for this round without browser storage.
    }
    return nextCount;
  }

  function applyShutoutReward() {
    if (roundResult.hidden) {
      rewardedCurrentResult = false;
      roundResult.classList.remove("shutout");
      return;
    }

    const isShutout = roundResultTitle.textContent.trim() === "SHUT THE BOX"
      && Number(roundResultScore.textContent) === 0;

    if (!isShutout) {
      roundResult.classList.remove("shutout");
      return;
    }

    roundResult.classList.add("shutout");
    if (rewardedCurrentResult) return;
    rewardedCurrentResult = true;

    const isPractice = document.body.dataset.mode === "practice";
    if (instruction) instruction.textContent = "The tavern has noticed.";

    if (isPractice) {
      const shutoutCount = recordPracticeShutout();
      roundResultDetail.textContent = `You shut the box. The tavern has noticed. Practice shutouts: ${shutoutCount}.`;
      return;
    }

    const attemptText = roundResultDetail.textContent.match(/This is attempt \d+ of \d+\./)?.[0] || "";
    roundResultDetail.textContent = `You shut the box. The tavern has noticed.${attemptText ? ` ${attemptText}` : ""}`;
  }

  const observer = new MutationObserver(applyShutoutReward);
  observer.observe(roundResult, {
    attributes: true,
    attributeFilter: ["hidden"],
    childList: true,
    subtree: true,
    characterData: true
  });

  applyShutoutReward();
})();
