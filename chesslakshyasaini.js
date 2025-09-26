<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Canvas Chess – Cleaned</title>
  <style>
    :root {
      --bg: #0f1115;
      --panel: #151923;
      --ink: #e7eaf0;
    }
    html, body { height: 100%; }
    body {
      margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
      background: var(--bg); color: var(--ink); display: grid; place-items: center;
    }
    .wrap { display: grid; gap: 14px; grid-template-columns: auto 280px; align-items: start; }
    .panel { background: var(--panel); padding: 12px 14px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.03); }
    h1 { font-size: 18px; margin: 0 0 6px 0; opacity: .9; }
    #chessCanvas { display: block; border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
    .stat { font: 14px/1.4 system-ui; opacity: .95; }
    .stat b { font-weight: 700; }
    .row { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .btns { display: flex; gap: 8px; margin-top: 6px; }
    button { cursor: pointer; border: 0; padding: 8px 12px; border-radius: 10px; background:#2a3142; color: var(--ink); }
    button:hover { background:#323a50; }
    small { opacity: .7; }
  </style>
</head>
<body>
  <div class="wrap">
    <canvas id="chessCanvas" width="400" height="400" class="panel"></canvas>

    <div class="panel">
      <h1>Canvas Chess</h1>
      <div class="row">
        <div class="stat"><b id="currentTeamText">White's turn</b></div>
        <div class="stat">White captures: <span id="whiteCasualties">None</span></div>
        <div class="stat">Black captures: <span id="blackCasualties">None</span></div>
        <div class="stat" id="totalVictories">Games won: white 0 - black 0</div>
      </div>
      <div class="btns">
        <button id="restartBtn">Restart</button>
      </div>
      <small>Rules implemented: basic movement, captures, pawn double step, promotion to queen. Missing: checks, castling, en passant, legal-move validation against self-check.</small>
    </div>
  </div>

<script>
// ───────────────────────── Constants
const BOARD_WIDTH = 8;
const BOARD_HEIGHT = 8;
const TILE_SIZE = 50;
const WHITE_TILE_COLOR = "rgb(255, 228, 196)";
const BLACK_TILE_COLOR = "rgb(206, 162, 128)";
const HIGHLIGHT_COLOR = "rgb(75, 175, 75)";
const WHITE = 0;
const BLACK = 1;
const EMPTY = -1;
const PAWN = 0;
const KNIGHT = 1;
const BISHOP = 2;
const ROOK = 3;
const QUEEN = 4;
const KING = 5;
const INVALID = 0;
const VALID = 1;
const VALID_CAPTURE = 2;

const piecesCharacters = {
  0: '♟',
  1: '♘',
  2: '♝',
  3: '♜',
  4: '♛',
  5: '♔'
};

// ───────────────────────── Globals
let chessCanvas;
let chessCtx;
let currentTeamText;
let whiteCasualtiesText;
let blackCasualtiesText;
let totalVictoriesText;
let restartBtn;

let board;
let currentTeam;
let curX;
let curY;

let whiteCasualties;
let blackCasualties;
let whiteVictories;
let blackVictories;

// ───────────────────────── Boot
addEventListener("DOMContentLoaded", onLoad);

function onLoad() {
  chessCanvas = document.getElementById("chessCanvas");
  chessCtx = chessCanvas.getContext("2d");

  // Centered glyph drawing
  chessCtx.textAlign = "center";
  chessCtx.textBaseline = "middle";

  chessCanvas.addEventListener("click", onClick);

  currentTeamText = document.getElementById("currentTeamText");
  whiteCasualtiesText = document.getElementById("whiteCasualties");
  blackCasualtiesText = document.getElementById("blackCasualties");
  totalVictoriesText = document.getElementById("totalVictories");
  restartBtn = document.getElementById("restartBtn");
  restartBtn.addEventListener('click', startGame);

  whiteVictories = 0;
  blackVictories = 0;
  startGame();
}

function startGame() {
  board = new Board();
  curX = -1; curY = -1;

  currentTeam = WHITE;
  currentTeamText.textContent = "White's turn";

  // We track captures of non-king pieces (indices 0..4)
  whiteCasualties = [0, 0, 0, 0, 0];
  blackCasualties = [0, 0, 0, 0, 0];

  repaintBoard();
  updateWhiteCasualties();
  updateBlackCasualties();
  updateTotalVictories();
}

function onClick(event) {
  const rect = chessCanvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / TILE_SIZE);
  const y = Math.floor((event.clientY - rect.top) / TILE_SIZE);

  // Bounds guard
  if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return;

  if (checkValidMovement(x, y)) {
    // If it's a capture, handle bookkeeping and game-end condition.
    if (checkValidCapture(x, y)) {
      if (board.tiles[y][x].pieceType === KING) {
        if (currentTeam === WHITE) whiteVictories++; else blackVictories++;
        startGame();
        return; // IMPORTANT: stop handling after reset
      }

      if (currentTeam === WHITE) {
        const pt = board.tiles[y][x].pieceType;
        if (pt >= PAWN && pt <= QUEEN) blackCasualties[pt]++;
        updateBlackCasualties();
      } else {
        const pt = board.tiles[y][x].pieceType;
        if (pt >= PAWN && pt <= QUEEN) whiteCasualties[pt]++;
        updateWhiteCasualties();
      }
    }

    moveSelectedPiece(x, y);
    changeCurrentTeam();
  } else {
    curX = x; curY = y; // select a new tile
  }

  repaintBoard();
}

// ───────────────────────── Possible plays (no check rules)
function checkPossiblePlays() {
  if (curX < 0 || curY < 0) return;

  const tile = board.tiles[curY][curX];
  if (tile.team === EMPTY || tile.team !== currentTeam) return;

  drawTile(curX, curY, HIGHLIGHT_COLOR);
  board.resetValidMoves();

  switch (tile.pieceType) {
    case PAWN:   checkPossiblePlaysPawn(curX, curY); break;
    case KNIGHT: checkPossiblePlaysKnight(curX, curY); break;
    case BISHOP: checkPossiblePlaysBishop(curX, curY); break;
    case ROOK:   checkPossiblePlaysRook(curX, curY); break;
    case QUEEN:  checkPossiblePlaysQueen(curX, curY); break;
    case KING:   checkPossiblePlaysKing(curX, curY); break;
  }
}

// FIXED: correct team-based direction, start rank, and path blocking for double-step.
function checkPossiblePlaysPawn(px, py) {
  const team = board.tiles[py][px].team;
  const dir = team === WHITE ? -1 : 1;
  const startRank = team === WHITE ? 6 : 1;

  const oneY = py + dir;
  if (oneY >= 0 && oneY < BOARD_HEIGHT) {
    // single forward if empty
    if (board.tiles[oneY][px].team === EMPTY) {
      checkPossibleMove(px, oneY);

      // double forward if at start and both empty
      const twoY = py + 2 * dir;
      if (py === startRank && twoY >= 0 && twoY < BOARD_HEIGHT && board.tiles[twoY][px].team === EMPTY) {
        checkPossibleMove(px, twoY);
      }
    }

    // diagonals (captures only)
    if (px - 1 >= 0 && board.tiles[oneY][px - 1].team === getOppositeTeam(team)) {
      checkPossibleCapture(px - 1, oneY);
    }
    if (px + 1 < BOARD_WIDTH && board.tiles[oneY][px + 1].team === getOppositeTeam(team)) {
      checkPossibleCapture(px + 1, oneY);
    }
  }
}

function checkPossiblePlaysKnight(px, py) {
  const deltas = [
    [-2, -1], [-2,  1], [-1, -2], [-1,  2],
    [ 1, -2], [ 1,  2], [ 2, -1], [ 2,  1]
  ];
  for (const [dx, dy] of deltas) {
    const x = px + dx, y = py + dy;
    if (x>=0 && x<BOARD_WIDTH && y>=0 && y<BOARD_HEIGHT) checkPossiblePlay(x, y);
  }
}

function ray(px, py, dx, dy) {
  for (let i = 1;; i++) {
    const x = px + dx * i, y = py + dy * i;
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) break;
    if (checkPossiblePlay(x, y)) break; // stop if piece encountered
  }
}

function checkPossiblePlaysRook(px, py) {
  ray(px, py, 0, -1); // up
  ray(px, py, 1,  0); // right
  ray(px, py, 0,  1); // down
  ray(px, py,-1,  0); // left
}

function checkPossiblePlaysBishop(px, py) {
  ray(px, py, 1, -1); // up-right
  ray(px, py, 1,  1); // down-right
  ray(px, py,-1,  1); // down-left
  ray(px, py,-1, -1); // up-left
}

function checkPossiblePlaysQueen(px, py) { 
  checkPossiblePlaysBishop(px, py);
  checkPossiblePlaysRook(px, py);
}

function checkPossiblePlaysKing(px, py) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = px + dx, y = py + dy;
      if (x>=0 && x<BOARD_WIDTH && y>=0 && y<BOARD_HEIGHT) checkPossiblePlay(x, y);
    }
  }
}

function checkPossiblePlay(x, y) {
  if (checkPossibleCapture(x, y)) return true; // piece encountered (enemy)
  return !checkPossibleMove(x, y); // true if blocked by ally (stop ray)
}

function checkPossibleMove(x, y) {
  if (board.tiles[y][x].team !== EMPTY) return false;
  board.validMoves[y][x] = VALID;
  drawCircle(x, y, HIGHLIGHT_COLOR);
  return true;
}

function checkPossibleCapture(x, y) {
  if (board.tiles[y][x].team !== getOppositeTeam(currentTeam)) return false;
  board.validMoves[y][x] = VALID_CAPTURE;
  drawCorners(x, y, HIGHLIGHT_COLOR);
  return true;
}

function checkValidMovement(x, y) {
  return board.validMoves[y][x] === VALID || board.validMoves[y][x] === VALID_CAPTURE;
}

function checkValidCapture(x, y) {
  return board.validMoves[y][x] === VALID_CAPTURE;
}

function moveSelectedPiece(x, y) {
  board.tiles[y][x].pieceType = board.tiles[curY][curX].pieceType;
  board.tiles[y][x].team = board.tiles[curY][curX].team;

  board.tiles[curY][curX].pieceType = EMPTY;
  board.tiles[curY][curX].team = EMPTY;

  // Simple promotion: auto-promote pawn to queen when reaching back rank
  const moved = board.tiles[y][x];
  if (moved.pieceType === PAWN && (y === 0 || y === BOARD_HEIGHT - 1)) {
    moved.pieceType = QUEEN;
  }

  curX = -1; curY = -1;
  board.resetValidMoves();
}

function changeCurrentTeam() {
  if (currentTeam === WHITE) {
    currentTeam = BLACK;
    currentTeamText.textContent = "Black's turn";
  } else {
    currentTeam = WHITE;
    currentTeamText.textContent = "White's turn";
  }
}

// ───────────────────────── Rendering
function repaintBoard() {
  drawBoard();
  checkPossiblePlays();
  drawPieces();
}

function drawBoard() {
  chessCtx.fillStyle = WHITE_TILE_COLOR;
  chessCtx.fillRect(0, 0, BOARD_WIDTH * TILE_SIZE, BOARD_HEIGHT * TILE_SIZE);
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if ((x + y) % 2 === 1) drawTile(x, y, BLACK_TILE_COLOR);
    }
  }
}

function drawTile(x, y, fillStyle) {
  chessCtx.fillStyle = fillStyle;
  chessCtx.fillRect(TILE_SIZE * x, TILE_SIZE * y, TILE_SIZE, TILE_SIZE);
}

function drawCircle(x, y, fillStyle) {
  chessCtx.fillStyle = fillStyle;
  chessCtx.beginPath();
  chessCtx.arc(TILE_SIZE * (x + 0.5), TILE_SIZE * (y + 0.5), TILE_SIZE / 6, 0, Math.PI * 2);
  chessCtx.fill();
}

function drawCorners(x, y, fillStyle) {
  chessCtx.fillStyle = fillStyle;
  const s = 14;
  const x0 = TILE_SIZE * x, y0 = TILE_SIZE * y, x1 = x0 + TILE_SIZE, y1 = y0 + TILE_SIZE;
  // TL
  chessCtx.beginPath(); chessCtx.moveTo(x0, y0); chessCtx.lineTo(x0 + s, y0); chessCtx.lineTo(x0, y0 + s); chessCtx.fill();
  // TR
  chessCtx.beginPath(); chessCtx.moveTo(x1, y0); chessCtx.lineTo(x1 - s, y0); chessCtx.lineTo(x1, y0 + s); chessCtx.fill();
  // BL
  chessCtx.beginPath(); chessCtx.moveTo(x0, y1); chessCtx.lineTo(x0 + s, y1); chessCtx.lineTo(x0, y1 - s); chessCtx.fill();
  // BR
  chessCtx.beginPath(); chessCtx.moveTo(x1, y1); chessCtx.lineTo(x1 - s, y1); chessCtx.lineTo(x1, y1 - s); chessCtx.fill();
}

function drawPieces() {
  chessCtx.font = "34px Arial";
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const t = board.tiles[y][x];
      if (t.team === EMPTY) continue;
      // Optional tint per side
      chessCtx.fillStyle = t.team === WHITE ? "#ff6060" : "#5aa3ff";
      const glyph = piecesCharacters[t.pieceType];
      chessCtx.fillText(glyph, TILE_SIZE * (x + 0.5), TILE_SIZE * (y + 0.5));
    }
  }
}

// ───────────────────────── UI text
function updateWhiteCasualties() { updateCasualties(whiteCasualties, whiteCasualtiesText); }
function updateBlackCasualties() { updateCasualties(blackCasualties, blackCasualtiesText); }

function updateCasualties(arr, el) {
  let parts = [];
  for (let i = QUEEN; i >= PAWN; i--) {
    const count = arr[i] || 0;
    if (count > 0) parts.push(`${count} ${piecesCharacters[i]}`);
  }
  el.textContent = parts.length ? parts.join(" - ") : "None";
}

function updateTotalVictories() {
  totalVictoriesText.textContent = `Games won: white ${whiteVictories} - black ${blackVictories}`;
}

function getOppositeTeam(team) {
  if (team === WHITE) return BLACK;
  if (team === BLACK) return WHITE;
  return EMPTY;
}

// ───────────────────────── Data structures
class Board {
  constructor() {
    this.tiles = [];

    // Black back rank
    this.tiles.push([
      new Tile(ROOK, BLACK), new Tile(KNIGHT, BLACK), new Tile(BISHOP, BLACK), new Tile(QUEEN, BLACK),
      new Tile(KING, BLACK), new Tile(BISHOP, BLACK), new Tile(KNIGHT, BLACK), new Tile(ROOK, BLACK)
    ]);
    // Black pawns (rank 1)
    this.tiles.push(Array.from({length:8}, () => new Tile(PAWN, BLACK)));

    // Empty ranks 2..5
    for (let i = 0; i < 4; i++) {
      this.tiles.push(Array.from({length:8}, () => new Tile(EMPTY, EMPTY)));
    }

    // White pawns (rank 6)
    this.tiles.push(Array.from({length:8}, () => new Tile(PAWN, WHITE)));

    // White back rank (rank 7)
    this.tiles.push([
      new Tile(ROOK, WHITE), new Tile(KNIGHT, WHITE), new Tile(BISHOP, WHITE), new Tile(QUEEN, WHITE),
      new Tile(KING, WHITE), new Tile(BISHOP, WHITE), new Tile(KNIGHT, WHITE), new Tile(ROOK, WHITE)
    ]);

    // Valid moves grid
    this.validMoves = Array.from({length: BOARD_HEIGHT}, () => Array.from({length: BOARD_WIDTH}, () => INVALID));
  }
  resetValidMoves() {
    for (let y = 0; y < BOARD_HEIGHT; y++) for (let x = 0; x < BOARD_WIDTH; x++) this.validMoves[y][x] = INVALID;
  }
}

class Tile { constructor(pieceType, team){ this.pieceType = pieceType; this.team = team; } }

</script>
</body>
</html>
