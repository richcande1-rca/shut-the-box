"use strict";

const TILE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BEST_SCORE_KEY = "shut-the-box-best-score-v1";

const tileElements = [...document.querySelectorAll(".number-tile")];
const dieOne = document.querySelector("#dieOne");
const dieTwo = document.querySelector("#dieTwo");
const rollTotalElement = document.querySelector("#rollTotal");
const selectedTotalElement = document.querySelector("#selectedTotal");
const targetTotalElement = document.querySelector("#targetTotal");
const openTotalElement = document.querySelector("#openTotal");
const bestScoreElement = document.querySelector("#bestScore");
const selectionMeter = document.querySelector("#selectionMeter");
const instructionElement = document.querySelector("#instruction");
const rollButton = document.querySelector("#rollButton");
const shutButton = document.querySelector("#shutButton");
const newGameButton = document.querySelector("#newGameButton");
const roundResult = document.querySelector("#roundResult");
const roundResultTitle = document.querySelector("#roundResultTitle");
const roundResultScore = document.querySelector("#roundResultScore");
const roundResultDetail = document.querySelector("#roundResultDetail");
const playAgainButton = document.querySelector("#playAgainButton");

let openTiles = new Set(TILE_VALUES);
let selectedTiles = new Set();
let currentRoll = null;
let rolling = false;
let roundOver = false;
let rollToken = 0;
let bestScore = readBestScore();

function buildDie(die) {
  die.replaceChildren();
  die.dataset.face = "1";

  for (let position = 1; position <= 9; position += 1) {
    const pip = document.createElement("span");
    pip.className = `pip pip-${position}`;
    pip.setAttribute("aria-hidden", "true");
    die.append(pip);
  }
}

function setDieFace(die, value, label) {
  die.dataset.face = String(value);
  die.setAttribute("aria-label", `${label}: ${value}`);
}

function readBestScore() {
  try {
    const stored = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(stored) && stored >= 0 ? stored : null;
  } catch {
    return null;
  }
}

function saveBestScore(score) {
  bestScore = score;
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // The game still works when browser storage is unavailable.
  }
}

function randomDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function sum(values) {
  return [...values].reduce((total, value) => total + value, 0);
}

function hasCombination(values, target) {
  const available = [...values];

  function search(index, remaining) {
    if (remaining === 0) return true;
    if (remaining < 0 || index >= available.length) return false;

    return search(index + 1, remaining - available[index])
      || search(index + 1, remaining);
  }

  return search(0, target);
}

function setInstruction(text) {
  instructionElement.textContent = text;
}

function hideRoundResult() {
  roundResult.hidden = true;
  roundResultTitle.textContent = "ROUND OVER";
  roundResultScore.textContent = "0";
  roundResultDetail.textContent = "";
}

function showRoundResult(title, score, detail) {
  roundResultTitle.textContent = title;
  roundResultScore.textContent = String(score);
  roundResultDetail.textContent = detail;
  roundResult.hidden = false;
}

function updateDisplay() {
  const selectedTotal = sum(selectedTiles);
  const openTotal = sum(openTiles);

  tileElements.forEach((tile) => {
    const value = Number(tile.dataset.value);
    const isOpen = openTiles.has(value);
    const isSelected = selectedTiles.has(value);

    tile.classList.toggle("closed", !isOpen);
    tile.classList.toggle("selected", isSelected);
    tile.disabled = !isOpen || currentRoll === null || rolling || roundOver;
    tile.setAttribute("aria-pressed", String(isSelected));
  });

  openTotalElement.textContent = String(openTotal);
  selectedTotalElement.textContent = String(selectedTotal);
  targetTotalElement.textContent = currentRoll === null ? "—" : String(currentRoll);
  bestScoreElement.textContent = bestScore === null ? "—" : String(bestScore);
  selectionMeter.classList.toggle("over", currentRoll !== null && selectedTotal > currentRoll);

  rollButton.disabled = rolling || roundOver || currentRoll !== null;
  shutButton.disabled = rolling || roundOver || currentRoll === null || selectedTotal !== currentRoll;
}

function finishRound(detail, title = "ROUND OVER") {
  roundOver = true;
  currentRoll = null;
  selectedTiles.clear();

  const score = sum(openTiles);
  const isBest = bestScore === null || score < bestScore;

  if (isBest) {
    saveBestScore(score);
  }

  const resultDetail = isBest && score !== 0
    ? `${detail} New best score.`
    : detail;

  setInstruction(title === "SHUT THE BOX" ? "Perfect round." : "No move available.");
  showRoundResult(title, score, resultDetail);
  updateDisplay();
}

function settleDice(first, second) {
  setDieFace(dieOne, first, "First die");
  setDieFace(dieTwo, second, "Second die");

  currentRoll = first + second;
  rollTotalElement.textContent = String(currentRoll);
  selectedTiles.clear();
  rolling = false;
  dieOne.classList.remove("rolling");
  dieTwo.classList.remove("rolling");

  if (!hasCombination(openTiles, currentRoll)) {
    const deadRoll = currentRoll;
    finishRound(`No open combination makes ${deadRoll}.`);
    return;
  }

  setInstruction(`Choose open tiles totaling ${currentRoll}.`);
  updateDisplay();
}

function rollDice() {
  if (rolling || roundOver || currentRoll !== null) return;

  const token = ++rollToken;
  rolling = true;
  selectedTiles.clear();
  rollTotalElement.textContent = "…";
  setInstruction("Rolling...");
  updateDisplay();

  dieOne.classList.remove("rolling");
  dieTwo.classList.remove("rolling");
  void dieOne.offsetWidth;
  dieOne.classList.add("rolling");
  dieTwo.classList.add("rolling");

  let shuffleCount = 0;
  const shuffle = window.setInterval(() => {
    setDieFace(dieOne, randomDie(), "First die");
    setDieFace(dieTwo, randomDie(), "Second die");
    shuffleCount += 1;

    if (shuffleCount >= 7) {
      window.clearInterval(shuffle);
    }
  }, 75);

  const first = randomDie();
  const second = randomDie();
  window.setTimeout(() => {
    if (token === rollToken) settleDice(first, second);
  }, 690);
}

function toggleTile(value) {
  if (!openTiles.has(value) || currentRoll === null || rolling || roundOver) return;

  if (selectedTiles.has(value)) {
    selectedTiles.delete(value);
  } else {
    selectedTiles.add(value);
  }

  const selectedTotal = sum(selectedTiles);
  if (selectedTotal > currentRoll) {
    setInstruction("Too high. Tap a selected tile to undo it.");
  } else if (selectedTotal === currentRoll) {
    setInstruction("That works. Shut the selected tiles.");
  } else {
    setInstruction(`${currentRoll - selectedTotal} more.`);
  }

  updateDisplay();
}

function shutSelected() {
  if (currentRoll === null || sum(selectedTiles) !== currentRoll || roundOver) return;

  selectedTiles.forEach((value) => openTiles.delete(value));
  selectedTiles.clear();
  currentRoll = null;
  rollTotalElement.textContent = "—";

  if (openTiles.size === 0) {
    if (bestScore !== 0) saveBestScore(0);
    finishRound("Every tile is shut.", "SHUT THE BOX");
    return;
  }

  setInstruction("Clean. Roll again.");
  updateDisplay();
}

function newGame() {
  rollToken += 1;
  openTiles = new Set(TILE_VALUES);
  selectedTiles = new Set();
  currentRoll = null;
  rolling = false;
  roundOver = false;

  dieOne.classList.remove("rolling");
  dieTwo.classList.remove("rolling");
  setDieFace(dieOne, 1, "First die");
  setDieFace(dieTwo, 1, "Second die");
  rollTotalElement.textContent = "—";
  hideRoundResult();
  setInstruction("Roll the dice to begin.");
  updateDisplay();
}

tileElements.forEach((tile) => {
  tile.addEventListener("click", () => toggleTile(Number(tile.dataset.value)));
});

rollButton.addEventListener("click", rollDice);
shutButton.addEventListener("click", shutSelected);
newGameButton.addEventListener("click", newGame);
playAgainButton.addEventListener("click", newGame);

buildDie(dieOne);
buildDie(dieTwo);
newGame();
