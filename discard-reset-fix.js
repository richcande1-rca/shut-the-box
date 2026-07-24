"use strict";

let discardTransitionPending = false;

const originalStartNextDailyAttemptForDiscard = startNextDailyAttempt;
startNextDailyAttempt = function startNextDailyAttemptWithVisibleReset() {
  const finishingDiscard = discardTransitionPending;
  originalStartNextDailyAttemptForDiscard();

  if (finishingDiscard && mode === "daily" && !roundOver) {
    setInstruction(`Attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}. Roll when ready.`);
    submissionStatusElement.textContent = `Attempt ${attemptsUsed} discarded. Attempt ${attemptsUsed + 1} ready.`;
  }
};

const originalDiscardCurrentAttemptForReset = discardCurrentAttempt;
discardCurrentAttempt = async function discardCurrentAttemptWithVisibleReset() {
  if (
    resolvingDiscard
    || mode !== "daily"
    || !roundOver
    || dailySubmitted
    || dailyScore === null
    || dailyScore === 0
    || attemptsUsed >= DAILY_ATTEMPT_LIMIT
  ) return;

  const attemptNumber = attemptsUsed + 1;
  discardTransitionPending = true;
  secondaryDailyButton.textContent = "DISCARDING…";
  secondaryDailyButton.disabled = true;
  playAgainButton.disabled = true;
  roundResultDetail.textContent = `Discarding attempt ${attemptNumber}…`;
  submissionStatusElement.textContent = `Discarding attempt ${attemptNumber}…`;

  try {
    await originalDiscardCurrentAttemptForReset();
  } finally {
    discardTransitionPending = false;
  }
};

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
