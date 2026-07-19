"use strict";

const DAILY_DICE_VERSION = "player-random-v1";
let dailyFinished = false;
let resolvingDiscard = false;

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

function dailyBestSummary() {
  return bestDailyScore === null
    ? "No score was posted."
    : `Best score: ${bestDailyScore}.`;
}

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
    setInstruction(`Daily complete. ${dailyBestSummary()}`);
  } else if (attemptsUsed >= DAILY_ATTEMPT_LIMIT && dailySubmitted) {
    setInstruction(`All ${DAILY_ATTEMPT_LIMIT} daily attempts are complete.`);
  } else if (attemptStarted) {
    setInstruction("Daily attempt resumed. Roll when ready.");
  } else {
    setInstruction(`Attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}. Fresh dice. Best score counts.`);
  }
}

const secondaryDailyButton = document.createElement("button");
secondaryDailyButton.className = "action-button shut-button result-button";
secondaryDailyButton.type = "button";
secondaryDailyButton.hidden = true;
playAgainButton.insertAdjacentElement("afterend", secondaryDailyButton);

const originalUpdateModeDisplay = updateModeDisplay;
updateModeDisplay = function updateRandomDailyModeDisplay() {
  originalUpdateModeDisplay();

  if (mode === "daily" && roundOver && !dailySubmitted) {
    playAgainButton.textContent = "POST ATTEMPT";
    playAgainButton.disabled = resolvingDiscard;
  } else if (mode === "daily" && dailyFinished) {
    playAgainButton.textContent = "PRACTICE";
    playAgainButton.disabled = false;
  }

  const canDiscard = (
    mode === "daily"
    && roundOver
    && !dailySubmitted
    && dailyScore !== null
    && dailyScore > 0
    && attemptsUsed < DAILY_ATTEMPT_LIMIT
  );

  const canStop = (
    mode === "daily"
    && roundOver
    && dailySubmitted
    && !dailyFinished
    && attemptsUsed < DAILY_ATTEMPT_LIMIT
  );

  if (canDiscard) {
    secondaryDailyButton.hidden = false;
    secondaryDailyButton.textContent = attemptsUsed + 1 < DAILY_ATTEMPT_LIMIT
      ? "DISCARD & PLAY NEXT"
      : "DISCARD & FINISH";
    secondaryDailyButton.disabled = resolvingDiscard;
  } else if (canStop) {
    secondaryDailyButton.hidden = false;
    secondaryDailyButton.textContent = "STOP FOR TODAY";
    secondaryDailyButton.disabled = false;
  } else {
    secondaryDailyButton.hidden = true;
    secondaryDailyButton.disabled = false;
  }
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
  resolvingDiscard = false;
  originalRestoreDailyState();

  const state = readDailyState();
  dailyFinished = Boolean(state?.finishedEarly)
    || (dailySubmitted && bestDailyScore === 0);

  if (dailyFinished) {
    writeDailyState();
    setInstruction(`Daily complete. ${dailyBestSummary()}`);
    if (roundOver) {
      roundResultDetail.textContent = bestDailyScore === 0
        ? "Perfect score posted. No more attempts needed."
        : `Stopped after attempt ${attemptsUsed}. ${dailyBestSummary()}`;
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

async function discardCurrentAttempt() {
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
  resolvingDiscard = true;
  secondaryDailyButton.disabled = true;
  playAgainButton.disabled = true;
  submitScoreButton.disabled = true;
  submissionStatusElement.textContent = `Discarding attempt ${attemptNumber}…`;

  try {
    const response = await fetch(`${API_BASE}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_date: challengeDate,
        player_id: getPlayerId(),
        player_name: playerName || readPlayerName() || "Player",
        attempt_number: attemptNumber,
        moves: moveHistory
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "The attempt could not be discarded.");
    }

    attemptsUsed = Number.isInteger(data.attempt_number)
      ? data.attempt_number
      : attemptNumber;
    dailySubmitted = true;

    if (attemptsUsed >= DAILY_ATTEMPT_LIMIT) {
      dailyFinished = true;
      writeDailyState();
      setInstruction(`Daily complete. ${dailyBestSummary()}`);
      roundResultDetail.textContent = `Attempt ${attemptsUsed} discarded. ${dailyBestSummary()}`;
      submissionStatusElement.textContent = `Attempt ${attemptsUsed} discarded.`;
      updateDisplay();
    } else {
      writeDailyState();
      submissionStatusElement.textContent = `Attempt ${attemptsUsed} discarded.`;
      submitScoreButton.disabled = false;
      resolvingDiscard = false;
      startNextDailyAttempt();
      return;
    }
  } catch (error) {
    submissionStatusElement.textContent = error.message || "The attempt could not be discarded.";
  } finally {
    resolvingDiscard = false;
    submitScoreButton.disabled = false;
    updateDisplay();
  }
}

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

secondaryDailyButton.addEventListener("click", () => {
  if (mode !== "daily" || !roundOver || dailyFinished) return;

  if (!dailySubmitted) {
    discardCurrentAttempt();
    return;
  }

  if (attemptsUsed >= DAILY_ATTEMPT_LIMIT) return;

  dailyFinished = true;
  writeDailyState();
  setInstruction(`Daily complete. ${dailyBestSummary()}`);
  roundResultDetail.textContent = `Stopped after attempt ${attemptsUsed}. ${dailyBestSummary()}`;
  updateDisplay();
});

const bannerCopy = document.querySelector(".daily-banner p");
if (bannerCopy) bannerCopy.textContent = "Three attempts. Fresh dice every time.";

const boardNote = document.querySelector(".daily-board-note");
if (boardNote) {
  boardNote.textContent = "Play up to three verified random attempts. Post a score or discard the round and move on. Only posted scores reach the board.";
}

const rulesCopy = document.querySelector(".rules p");
if (rulesCopy) {
  rulesCopy.textContent = "Play up to three independent daily rounds with fresh dice each time. Post the score you want to keep, discard a bad round, or stop early. Your best posted score stays on the board.";
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
