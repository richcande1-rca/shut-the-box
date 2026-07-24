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
