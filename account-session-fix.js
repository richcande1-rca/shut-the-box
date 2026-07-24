"use strict";

function restoreConfirmedPlayerInstruction() {
  if (document.body.dataset.accountReady !== "true" || mode !== "daily") return;

  if (dailyFinished) {
    setInstruction(`Daily complete. ${dailyBestSummary()}`);
  } else if (roundOver && !dailySubmitted) {
    setInstruction("Daily attempt complete. Post it or discard it.");
  } else if (roundOver && dailySubmitted) {
    setInstruction(
      attemptsUsed >= DAILY_ATTEMPT_LIMIT
        ? `All ${DAILY_ATTEMPT_LIMIT} daily attempts are complete.`
        : `Attempt ${attemptsUsed} complete. Continue when ready.`
    );
  } else if (currentRoll !== null) {
    setInstruction(`Choose open tiles totaling ${currentRoll}.`);
  } else if (attemptStarted) {
    setInstruction("Daily attempt resumed. Roll when ready.");
  } else {
    setInstruction(`Attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}. Fresh dice. Best score counts.`);
  }
}

const playerCardObserver = new MutationObserver(() => {
  if (document.body.dataset.accountReady === "true") {
    queueMicrotask(restoreConfirmedPlayerInstruction);
  }
});

playerCardObserver.observe(document.body, {
  attributes: true,
  attributeFilter: ["data-account-ready"]
});

queueMicrotask(restoreConfirmedPlayerInstruction);
