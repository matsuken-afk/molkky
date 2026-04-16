/**
 * gameLogic.js
 * モルック スコア管理 — 純粋ゲームロジック
 *
 * DOM に一切依存しない。将来 iOS (Capacitor) 等へ移植する際は
 * このファイルをそのまま再利用できる。
 */

const GameLogic = (() => {
  'use strict';

  // ─── 定数 ────────────────────────────────────────────────────
  const MAX_SCORE            = 50;   // 勝利スコア
  const OVER_RESET_SCORE     = 25;   // 超過時リセット先
  const DISQUALIFY_ZEROS     = 3;    // 連続 0 回で失格
  const MIN_SCORE_INPUT      = 0;
  const MAX_SCORE_INPUT      = 12;
  const MIN_PLAYERS          = 1;
  const MAX_PLAYERS          = 4;

  // ─── プレイヤー生成 ──────────────────────────────────────────
  function createPlayer(id, name) {
    return {
      id,
      name: String(name).trim() || `プレイヤー ${id + 1}`,
      score: 0,
      consecutiveZeros: 0,
      isDisqualified: false,
      isWinner: false,
    };
  }

  // ─── 初期ステート生成 ────────────────────────────────────────
  /**
   * @param {string[]} playerNames
   * @returns {GameState}
   */
  function createInitialState(playerNames) {
    if (
      !Array.isArray(playerNames) ||
      playerNames.length < MIN_PLAYERS ||
      playerNames.length > MAX_PLAYERS
    ) {
      throw new Error(`プレイヤー数は ${MIN_PLAYERS}〜${MAX_PLAYERS} にしてください`);
    }

    return {
      players: playerNames.map((name, i) => createPlayer(i, name)),
      currentPlayerIndex: 0,
      gameOver: false,
      winnerId: null,
      history: [],
      stateSnapshots: [], // Undo 用スナップショット配列
    };
  }

  // ─── スナップショット (Undo 用) ──────────────────────────────
  // stateSnapshots 自体は含めない（入れ子を防ぐ）
  function takeSnapshot(state) {
    return {
      players: state.players.map(p => ({ ...p })),
      currentPlayerIndex: state.currentPlayerIndex,
      gameOver: state.gameOver,
      winnerId: state.winnerId,
      history: [...state.history],
    };
  }

  // ─── コアアクション ──────────────────────────────────────────

  /**
   * 現在プレイヤーに得点を加算し、ターンを進める。
   * イミュータブルな更新（元ステートを変更しない）。
   *
   * @param {GameState} state
   * @param {number} score  0〜12
   * @returns {GameState}
   */
  function addScore(state, score) {
    if (state.gameOver) return state;
    if (score < MIN_SCORE_INPUT || score > MAX_SCORE_INPUT) {
      throw new Error(`得点は ${MIN_SCORE_INPUT}〜${MAX_SCORE_INPUT} の範囲で入力してください`);
    }

    const snapshot      = takeSnapshot(state);
    const playerIndex   = state.currentPlayerIndex;
    const player        = state.players[playerIndex];

    if (player.isDisqualified || player.isWinner) return state;

    // ── 得点計算 ──
    const scoreBefore         = player.score;
    const newConsecutiveZeros = score === 0 ? player.consecutiveZeros + 1 : 0;
    let type         = 'normal';
    let newScore     = scoreBefore + score;
    let isDisqualified = false;
    let isWinner       = false;
    let gameOver       = false;
    let winnerId       = state.winnerId;

    if (newConsecutiveZeros >= DISQUALIFY_ZEROS) {
      // 0 が 3 連続 → 失格
      isDisqualified = true;
      newScore       = scoreBefore; // スコアは変わらない
      type           = 'disqualified';
    } else if (newScore > MAX_SCORE) {
      // 50 超過 → 25 にリセット
      newScore = OVER_RESET_SCORE;
      type     = 'over';
    } else if (newScore === MAX_SCORE) {
      // ちょうど 50 → 勝利
      isWinner = true;
      gameOver = true;
      winnerId = player.id;
      type     = 'win';
    }

    // ── プレイヤー配列更新 ──
    const updatedPlayers = state.players.map((p, i) =>
      i !== playerIndex
        ? p
        : {
            ...p,
            score: newScore,
            consecutiveZeros: isDisqualified ? DISQUALIFY_ZEROS : newConsecutiveZeros,
            isDisqualified,
            isWinner,
          }
    );

    // ── 次プレイヤー決定 ──
    const nextIndex = gameOver
      ? playerIndex
      : getNextActiveIndex(updatedPlayers, playerIndex);

    // ── 履歴エントリ ──
    const historyEntry = {
      playerId: player.id,
      playerName: player.name,
      score,
      scoreBefore,
      scoreAfter: newScore,
      type,
    };

    return {
      players: updatedPlayers,
      currentPlayerIndex: nextIndex,
      gameOver,
      winnerId,
      history: [...state.history, historyEntry],
      stateSnapshots: [...state.stateSnapshots, snapshot],
    };
  }

  /**
   * 現在プレイヤーのターンをスキップする（得点変動なし）。
   * @param {GameState} state
   * @returns {GameState}
   */
  function skipTurn(state) {
    if (state.gameOver) return state;

    const snapshot    = takeSnapshot(state);
    const player      = state.players[state.currentPlayerIndex];
    const nextIndex   = getNextActiveIndex(state.players, state.currentPlayerIndex);

    const historyEntry = {
      playerId:   player.id,
      playerName: player.name,
      score:      null,
      scoreBefore: player.score,
      scoreAfter:  player.score,
      type: 'skip',
    };

    return {
      ...state,
      currentPlayerIndex: nextIndex,
      history:        [...state.history, historyEntry],
      stateSnapshots: [...state.stateSnapshots, snapshot],
    };
  }

  /**
   * 1 手戻す。
   * @param {GameState} state
   * @returns {GameState}
   */
  function undoLastMove(state) {
    const snapshots = state.stateSnapshots;
    if (!snapshots || snapshots.length === 0) return state;

    const prev = snapshots[snapshots.length - 1];
    return {
      ...prev,
      stateSnapshots: snapshots.slice(0, -1),
    };
  }

  /**
   * メンバーを維持してスコアのみリセット（連戦）。
   * @param {GameState} state
   * @returns {GameState}
   */
  function rematch(state) {
    return createInitialState(state.players.map(p => p.name));
  }

  // ─── クエリ ──────────────────────────────────────────────────

  function getCurrentPlayer(state) {
    return state.players[state.currentPlayerIndex];
  }

  function canUndo(state) {
    return !!(state.stateSnapshots && state.stateSnapshots.length > 0);
  }

  function getWinner(state) {
    if (!state.gameOver || state.winnerId === null) return null;
    return state.players.find(p => p.id === state.winnerId) || null;
  }

  function getActivePlayerCount(state) {
    return state.players.filter(p => !p.isDisqualified && !p.isWinner).length;
  }

  // ─── 内部ヘルパー ────────────────────────────────────────────

  function getNextActiveIndex(players, currentIndex) {
    const total = players.length;
    for (let offset = 1; offset <= total; offset++) {
      const next = (currentIndex + offset) % total;
      if (!players[next].isDisqualified && !players[next].isWinner) {
        return next;
      }
    }
    return currentIndex; // 全員失格のフォールバック
  }

  // ─── 公開 API ────────────────────────────────────────────────
  return {
    // 定数
    MAX_SCORE,
    OVER_RESET_SCORE,
    DISQUALIFY_ZEROS,
    MIN_SCORE_INPUT,
    MAX_SCORE_INPUT,
    MIN_PLAYERS,
    MAX_PLAYERS,
    // ステート生成
    createInitialState,
    // アクション
    addScore,
    skipTurn,
    undoLastMove,
    rematch,
    // クエリ
    getCurrentPlayer,
    canUndo,
    getWinner,
    getActivePlayerCount,
  };
})();
