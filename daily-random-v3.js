"use strict";

const DAILY_DICE_VERSION = "player-random-v1";
let dailyFinished = false;

function activeDailyAttemptNumber() {
  if (dailySubmitted && attemptsUsed > 0) return attemptsUsed;
  return Math.min(DAILY_ATTEMPT_LIMIT, attemptsUsed + 1);
}

function playerDailyDiceAt(index) {
  const attemptNumber = activeDailyAttemptNumber();
  const seedText = `shut-the-box-v3:${challengeDate}:${getPlayerId()}:${attemptNumber}`;
  const random = mulberry32(hashString(seedText));
  let first = 1;
  let second = 1;

  for (let roll = 0; roll <= index; roll += 1) {
    first = Math.floor(random() * 6) + 1;
    second = Math.floor(random() * 6) + 1;
  }

  return [first, second];
}

dailyDiceAt = playerDailyDiceAt;

const originalWriteDailyState = writeDailyState;
writeDailyState = function writeRandomDailyState() {
  originalWriteDailyState();
  if (mode !== "daily") return;

  try {
    const state = readDailyState();
    if (!state) return;
    state.diceVersion = DAILY_DICE_VERSION;
    state.finishedEarly = dailyFinished;
    localStorage.setItem(dailyStorageKey, JSON.stringify(state));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
};

function setRandomDailyInstruction() {
  if (mode !== "daily" || roundOver || currentRoll !== null) return;

  if (dailyFinished) {
    setInstruction(`Daily complete. Best score: ${bestDailyScore}.`);
  } else if (attemptsUsed >= DAILY_ATTEMPT_LIMIT && dailySubmitted) {
    setInstruction(`All ${DAILY_ATTEMPT_LIMIT} daily attempts are complete.`);
  } else if (attemptStarted) {
    setInstruction("Daily attempt resumed. Roll when ready.");
  } else {
    setInstruction(`Attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}. Fresh dice. Best score counts.`);
  }
}

const stopDailyButton = document.createElement("button");
stopDailyButton.className = "action-button shut-button result-button";
stopDailyButton.type = "button";
stopDailyButton.textContent = "STOP FOR TODAY";
stopDailyButton.hidden = true;
playAgainButton.insertAdjacentElement("afterend", stopDailyButton);

const originalUpdateModeDisplay = updateModeDisplay;
updateModeDisplay = function updateRandomDailyModeDisplay() {
  originalUpdateModeDisplay();

  if (mode === "daily" && roundOver && !dailySubmitted) {
    playAgainButton.textContent = "POST ATTEMPT";
    playAgainButton.disabled = false;
  } else if (mode === "daily" && dailyFinished) {
    playAgainButton.textContent = "PRACTICE";
    playAgainButton.disabled = false;
  }

  stopDailyButton.hidden = !(
    mode === "daily"
    && roundOver
    && dailySubmitted
    && !dailyFinished
    && attemptsUsed < DAILY_ATTEMPT_LIMIT
  );
};

const originalUpdateChallengePanel = updateChallengePanel;
updateChallengePanel = function updateRandomDailyChallengePanel() {
  originalUpdateChallengePanel();

  if (mode === "daily" && dailyFinished) {
    challengeStatusElement.textContent = "DONE";
    challengeStatusElement.dataset.state = "complete";
  }
};

function syncPerfectDailyFinish() {
  if (!dailyFinished && dailySubmitted && bestDailyScore === 0) {
    dailyFinished = true;
    return true;
  }
  return false;
}

const originalUpdateDisplay = updateDisplay;
updateDisplay = function updateRandomDailyDisplay() {
  const perfectJustPosted = syncPerfectDailyFinish();
  if (perfectJustPosted) writeDailyState();

  originalUpdateDisplay();

  if (perfectJustPosted && mode === "daily") {
    setInstruction("Perfect score posted. Daily complete.");
    if (roundOver) {
      roundResultDetail.textContent = "Perfect score posted. No more attempts needed.";
    }
  }
};

const originalRestoreDailyState = restoreDailyState;
restoreDailyState = function restoreRandomDailyState() {
  dailyFinished = false;
  originalRestoreDailyState();

  const state = readDailyState();
  dailyFinished = Boolean(state?.finishedEarly)
    || (dailySubmitted && bestDailyScore === 0);

  if (dailyFinished) {
    writeDailyState();
    setInstruction(`Daily complete. Best score: ${bestDailyScore}.`);
    if (roundOver) {
      roundResultDetail.textContent = bestDailyScore === 0
        ? "Perfect score posted. No more attempts needed."
        : `Stopped after attempt ${attemptsUsed}. Best score: ${bestDailyScore}.`;
    }
    updateDisplay();
  } else {
    setRandomDailyInstruction();
  }
};

const originalStartNextDailyAttempt = startNextDailyAttempt;
startNextDailyAttempt = function startNextRandomDailyAttempt() {
  if (dailyFinished) return;
  originalStartNextDailyAttempt();
  setRandomDailyInstruction();
};

playAgainButton.addEventListener("click", (event) => {
  if (mode !== "daily") return;

  if (roundOver && !dailySubmitted) {
    event.preventDefault();
    event.stopImmediatePropagation();
    scoreForm.requestSubmit();
    return;
  }

  if (dailyFinished) {
    event.preventDefault();
    event.stopImmediatePropagation();
    startPractice();
  }
}, true);

stopDailyButton.addEventListener("click", () => {
  if (
    mode !== "daily"
    || !roundOver
    || !dailySubmitted
    || dailyFinished
    || attemptsUsed >= DAILY_ATTEMPT_LIMIT
  ) return;

  dailyFinished = true;
  writeDailyState();
  setInstruction(`Daily complete. Best score: ${bestDailyScore}.`);
  roundResultDetail.textContent = `Stopped after attempt ${attemptsUsed}. Best score: ${bestDailyScore}.`;
  updateDisplay();
});

const bannerCopy = document.querySelector(".daily-banner p");
if (bannerCopy) bannerCopy.textContent = "Three attempts. Fresh dice every time.";

const boardNote = document.querySelector(".daily-board-note");
if (boardNote) {
  boardNote.textContent = "Play up to three verified random attempts. Stop whenever you like; only your best score stays on the board.";
}

const rulesCopy = document.querySelector(".rules p");
if (rulesCopy) {
  rulesCopy.textContent = "Play up to three independent daily rounds with fresh dice each time. Shut tiles that total each roll. Stop whenever you like; your best verified score stays on the board.";
}

const restoredState = readDailyState();
const needsFreshAttempt = restoredState
  && restoredState.diceVersion !== DAILY_DICE_VERSION
  && !dailySubmitted
  && (attemptStarted || roundOver || moveHistory.length > 0);

if (needsFreshAttempt) {
  resetCurrentBoard();
  setInstruction(`Attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}. Dice are now randomized.`);
  writeDailyState();
  updateDisplay();
} else {
  dailyFinished = Boolean(restoredState?.finishedEarly)
    || (dailySubmitted && bestDailyScore === 0);
  writeDailyState();
  setRandomDailyInstruction();
  updateDisplay();
}
