"use strict";

const DAILY_DICE_VERSION = "player-random-v1";

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
    localStorage.setItem(dailyStorageKey, JSON.stringify(state));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
};

function setRandomDailyInstruction() {
  if (mode !== "daily" || roundOver || currentRoll !== null) return;

  if (attemptsUsed >= DAILY_ATTEMPT_LIMIT && dailySubmitted) {
    setInstruction(`All ${DAILY_ATTEMPT_LIMIT} daily attempts are complete.`);
  } else if (attemptStarted) {
    setInstruction("Daily attempt resumed. Roll when ready.");
  } else {
    setInstruction(`Attempt ${attemptsUsed + 1} of ${DAILY_ATTEMPT_LIMIT}. Fresh dice. Best score counts.`);
  }
}

const originalRestoreDailyState = restoreDailyState;
restoreDailyState = function restoreRandomDailyState() {
  originalRestoreDailyState();
  setRandomDailyInstruction();
};

const originalStartNextDailyAttempt = startNextDailyAttempt;
startNextDailyAttempt = function startNextRandomDailyAttempt() {
  originalStartNextDailyAttempt();
  setRandomDailyInstruction();
};

const bannerCopy = document.querySelector(".daily-banner p");
if (bannerCopy) bannerCopy.textContent = "Three attempts. Fresh dice every time.";

const boardNote = document.querySelector(".daily-board-note");
if (boardNote) {
  boardNote.textContent = "Each player gets three verified random attempts. Only the best score stays on the board.";
}

const rulesCopy = document.querySelector(".rules p");
if (rulesCopy) {
  rulesCopy.textContent = "Play three independent daily rounds with fresh dice each time. Shut tiles that total each roll. Your best verified score stays on the board.";
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
  writeDailyState();
  setRandomDailyInstruction();
}
