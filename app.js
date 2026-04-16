/**
 * app.js
 * モルック スコア管理 — UI レイヤー
 *
 * DOM 操作・イベント・描画・LocalStorage を担当。
 * ゲームロジックは gameLogic.js (GameLogic) に完全委譲。
 */

const App = (() => {
  'use strict';

  // ─── ストレージキー ──────────────────────────────────────────
  const KEY_STATE = 'molkky_state_v1';
  const KEY_SETUP = 'molkky_setup_v1';

  // ─── アプリステート ──────────────────────────────────────────
  let gameState       = null;
  let setupCount      = 2;

  // ─── DOM キャッシュ ──────────────────────────────────────────
  let D = {}; // DOM 参照をまとめるオブジェクト

  // ════════════════════════════════════════════════════════════
  // 初期化
  // ════════════════════════════════════════════════════════════

  function init() {
    cacheDom();
    buildScoreButtons();
    bindEvents();
    registerServiceWorker();
    restoreSession();
  }

  function cacheDom() {
    D = {
      // スクリーン
      setupScreen : document.getElementById('setup-screen'),
      gameScreen  : document.getElementById('game-screen'),

      // セットアップ
      countBtns           : document.querySelectorAll('.count-btn'),
      playerNamesContainer: document.getElementById('player-names-container'),
      startGameBtn        : document.getElementById('start-game-btn'),

      // ゲーム
      scoreboard        : document.getElementById('scoreboard'),
      currentPlayerInfo : document.getElementById('current-player-info'),
      currentPlayerName : document.getElementById('current-player-name'),
      scoreBtnsWrap     : document.querySelector('.score-buttons'),
      undoBtn           : document.getElementById('undo-btn'),
      skipBtn           : document.getElementById('skip-btn'),
      resetBtn          : document.getElementById('reset-btn'),
      historyList       : document.getElementById('history-list'),

      // ゲームオーバーオーバーレイ
      gameOverOverlay : document.getElementById('game-over-overlay'),
      winnerText      : document.getElementById('winner-text'),
      winnerScore     : document.getElementById('winner-score-text'),
      rematchBtn      : document.getElementById('rematch-btn'),
      newGameBtn      : document.getElementById('new-game-btn'),

      // リセットオーバーレイ
      resetOverlay    : document.getElementById('reset-overlay'),
      confirmRematch  : document.getElementById('confirm-rematch'),
      confirmNewGame  : document.getElementById('confirm-new-game'),
      cancelReset     : document.getElementById('cancel-reset'),
    };
  }

  // ─── 得点ボタン生成 ──────────────────────────────────────────
  function buildScoreButtons() {
    const wrap = D.scoreBtnsWrap;
    // 1〜12 を先に配置 → 4 列グリッドで 3 行
    for (let i = 1; i <= 12; i++) {
      wrap.appendChild(makeScoreBtn(i));
    }
    // 0 は最後に全幅
    const zeroBtn = makeScoreBtn(0);
    zeroBtn.classList.add('score-btn-zero');
    wrap.appendChild(zeroBtn);
  }

  function makeScoreBtn(score) {
    const btn = document.createElement('button');
    btn.className          = 'score-btn';
    btn.textContent        = score;
    btn.dataset.score      = score;
    btn.setAttribute('aria-label', `${score}点入力`);
    btn.addEventListener('click', () => handleScoreInput(score));
    return btn;
  }

  // ─── Service Worker ──────────────────────────────────────────
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {/* オフライン不可でも動作継続 */});
      });
    }
  }

  // ─── セッション復元 ──────────────────────────────────────────
  function restoreSession() {
    const savedState = loadState();
    const savedSetup = loadSetup();

    if (savedState) {
      gameState = savedState;
      showScreen('game');
      renderGame();
      if (gameState.gameOver) showOverlay('gameOver');
    } else {
      if (savedSetup) setupCount = savedSetup.playerCount || 2;
      showScreen('setup');
      renderSetup(savedSetup ? savedSetup.names : []);
    }
  }

  // ════════════════════════════════════════════════════════════
  // イベントバインド
  // ════════════════════════════════════════════════════════════

  function bindEvents() {
    // プレイヤー数ボタン
    D.countBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setupCount = parseInt(btn.dataset.count, 10);
        D.countBtns.forEach(b => b.classList.toggle('active', b === btn));
        renderSetup();
      });
    });

    D.startGameBtn.addEventListener('click', handleStartGame);

    // ゲーム操作
    D.undoBtn.addEventListener('click', handleUndo);
    D.skipBtn.addEventListener('click', handleSkip);
    D.resetBtn.addEventListener('click', () => showOverlay('reset'));

    // ゲームオーバーオーバーレイ
    D.rematchBtn.addEventListener('click', handleRematch);
    D.newGameBtn.addEventListener('click', handleNewGame);

    // リセットオーバーレイ
    D.confirmRematch.addEventListener('click', () => { hideOverlay('reset'); handleRematch(); });
    D.confirmNewGame.addEventListener('click', () => { hideOverlay('reset'); handleNewGame(); });
    D.cancelReset.addEventListener('click',    () =>   hideOverlay('reset'));

    // オーバーレイ外タップで閉じる（リセットのみ）
    D.resetOverlay.addEventListener('click', e => {
      if (e.target === D.resetOverlay) hideOverlay('reset');
    });
  }

  // ════════════════════════════════════════════════════════════
  // セットアップ画面
  // ════════════════════════════════════════════════════════════

  function renderSetup(savedNames = []) {
    // カウントボタンのアクティブ状態
    D.countBtns.forEach(btn =>
      btn.classList.toggle('active', parseInt(btn.dataset.count, 10) === setupCount)
    );

    // 既存の入力値を保持
    const prev = {};
    D.playerNamesContainer.querySelectorAll('input').forEach(input => {
      prev[input.dataset.index] = input.value;
    });

    D.playerNamesContainer.innerHTML = '';

    for (let i = 0; i < setupCount; i++) {
      const defaultName = savedNames[i] || prev[i] || `プレイヤー ${i + 1}`;
      const wrapper = document.createElement('div');
      wrapper.className = 'player-name-row';

      const label = document.createElement('label');
      label.htmlFor   = `pname-${i}`;
      label.textContent = `P${i + 1}`;

      const input = document.createElement('input');
      input.type        = 'text';
      input.id          = `pname-${i}`;
      input.dataset.index = i;
      input.value       = defaultName;
      input.maxLength   = 10;
      input.placeholder = `プレイヤー ${i + 1}`;
      input.style.fontSize = '16px'; // iOS ズーム防止

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      D.playerNamesContainer.appendChild(wrapper);
    }
  }

  function handleStartGame() {
    const names = [];
    for (let i = 0; i < setupCount; i++) {
      const input = document.getElementById(`pname-${i}`);
      names.push((input ? input.value : '').trim() || `プレイヤー ${i + 1}`);
    }
    saveSetup({ playerCount: setupCount, names });

    gameState = GameLogic.createInitialState(names);
    saveState(gameState);
    showScreen('game');
    renderGame();
  }

  // ════════════════════════════════════════════════════════════
  // ゲームアクション
  // ════════════════════════════════════════════════════════════

  function handleScoreInput(score) {
    if (!gameState || gameState.gameOver) return;
    vibrate(15);

    gameState = GameLogic.addScore(gameState, score);
    saveState(gameState);
    renderGame();

    if (gameState.gameOver) {
      vibrate([0, 80, 40, 80, 40, 160]);
      setTimeout(() => showGameOverOverlay(), 600);
    }
  }

  function handleSkip() {
    if (!gameState || gameState.gameOver) return;
    vibrate(10);
    gameState = GameLogic.skipTurn(gameState);
    saveState(gameState);
    renderGame();
  }

  function handleUndo() {
    if (!gameState || !GameLogic.canUndo(gameState)) return;
    vibrate(25);
    gameState = GameLogic.undoLastMove(gameState);
    saveState(gameState);
    hideOverlay('gameOver');
    renderGame();
  }

  function handleRematch() {
    gameState = GameLogic.rematch(gameState);
    saveState(gameState);
    hideOverlay('gameOver');
    renderGame();
  }

  function handleNewGame() {
    const savedSetup = loadSetup();
    clearState();
    gameState = null;
    hideOverlay('gameOver');
    showScreen('setup');
    renderSetup(savedSetup ? savedSetup.names : []);
  }

  // ════════════════════════════════════════════════════════════
  // 描画
  // ════════════════════════════════════════════════════════════

  function renderGame() {
    renderScoreboard();
    renderCurrentPlayerInfo();
    renderHistory();
    updateButtonStates();
  }

  // ─── スコアボード ────────────────────────────────────────────
  function renderScoreboard() {
    const currentPlayer = GameLogic.getCurrentPlayer(gameState);
    D.scoreboard.innerHTML = '';

    gameState.players.forEach(player => {
      const isCurrent = !gameState.gameOver && player.id === currentPlayer.id;
      D.scoreboard.appendChild(buildPlayerCard(player, isCurrent));
    });
  }

  function buildPlayerCard(player, isCurrent) {
    const card = document.createElement('div');
    card.className = 'player-card';
    if (isCurrent)            card.classList.add('current');
    if (player.isDisqualified) card.classList.add('disqualified');
    if (player.isWinner)       card.classList.add('winner');

    const pct = Math.min((player.score / GameLogic.MAX_SCORE) * 100, 100).toFixed(1);

    // ── ステータス表示 ──
    let statusHtml = '';
    if (player.isWinner) {
      statusHtml = '<div class="p-status p-winner-badge">🏆 優勝！</div>';
    } else if (player.isDisqualified) {
      statusHtml = '<div class="p-status p-disq-badge">失格</div>';
    } else {
      // 連続 0 ドット
      let dots = '';
      for (let i = 0; i < GameLogic.DISQUALIFY_ZEROS; i++) {
        dots += `<span class="zdot ${i < player.consecutiveZeros ? 'on' : ''}" aria-hidden="true"></span>`;
      }
      const zeroLabel = player.consecutiveZeros > 0
        ? `連続0: ${player.consecutiveZeros}回`
        : '';
      statusHtml = `<div class="zeros-track" title="${zeroLabel}" aria-label="連続0: ${player.consecutiveZeros}回">${dots}</div>`;
    }

    card.innerHTML = `
      <div class="p-name">${escapeHtml(player.name)}</div>
      <div class="p-score">${player.score}<span class="p-unit">点</span></div>
      <div class="p-bar-wrap"><div class="p-bar" style="width:${pct}%"></div></div>
      ${statusHtml}
    `;
    return card;
  }

  // ─── 現在プレイヤー ──────────────────────────────────────────
  function renderCurrentPlayerInfo() {
    if (gameState.gameOver) {
      D.currentPlayerInfo.classList.add('hidden-el');
      return;
    }
    D.currentPlayerInfo.classList.remove('hidden-el');
    D.currentPlayerName.textContent = GameLogic.getCurrentPlayer(gameState).name;
  }

  // ─── 履歴 ────────────────────────────────────────────────────
  function renderHistory() {
    D.historyList.innerHTML = '';

    const entries = [...gameState.history].reverse().slice(0, 30);

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'まだ記録はありません';
      D.historyList.appendChild(empty);
      return;
    }

    entries.forEach(entry => {
      const item = document.createElement('div');
      item.className = `history-item hist-${entry.type}`;
      item.textContent = formatHistoryEntry(entry);
      D.historyList.appendChild(item);
    });
  }

  function formatHistoryEntry(e) {
    switch (e.type) {
      case 'skip':
        return `${e.playerName}：スキップ`;
      case 'disqualified':
        return `${e.playerName}：0点 → 失格`;
      case 'over':
        return `${e.playerName}：+${e.score}点 (${e.scoreBefore}→25 超過リセット)`;
      case 'win':
        return `${e.playerName}：+${e.score}点 → ${e.scoreAfter}点 🏆 優勝！`;
      default:
        if (e.score === 0) return `${e.playerName}：0点 → ${e.scoreAfter}点`;
        return `${e.playerName}：+${e.score}点 → ${e.scoreAfter}点`;
    }
  }

  // ─── ボタン状態 ──────────────────────────────────────────────
  function updateButtonStates() {
    const over = gameState.gameOver;

    D.undoBtn.disabled = !GameLogic.canUndo(gameState);
    D.skipBtn.disabled = over;

    D.scoreBtnsWrap.querySelectorAll('.score-btn').forEach(btn => {
      btn.disabled = over;
    });
  }

  // ════════════════════════════════════════════════════════════
  // ゲームオーバー表示
  // ════════════════════════════════════════════════════════════

  function showGameOverOverlay() {
    const winner = GameLogic.getWinner(gameState);
    if (winner) {
      D.winnerText.textContent  = `${winner.name} の勝利！`;
      D.winnerScore.textContent = `${winner.score}点ちょうどでゴール！`;
    }
    showOverlay('gameOver');
  }

  // ════════════════════════════════════════════════════════════
  // スクリーン / オーバーレイ管理
  // ════════════════════════════════════════════════════════════

  function showScreen(name) {
    D.setupScreen.classList.toggle('active', name === 'setup');
    D.gameScreen.classList.toggle('active',  name === 'game');
  }

  function showOverlay(name) {
    const el = name === 'gameOver' ? D.gameOverOverlay : D.resetOverlay;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  function hideOverlay(name) {
    const el = name === 'gameOver' ? D.gameOverOverlay : D.resetOverlay;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }

  // ════════════════════════════════════════════════════════════
  // LocalStorage
  // ════════════════════════════════════════════════════════════

  function saveState(state) {
    try { localStorage.setItem(KEY_STATE, JSON.stringify(state)); } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY_STATE);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.players)) return null;
      return s;
    } catch (_) { return null; }
  }

  function clearState() {
    try { localStorage.removeItem(KEY_STATE); } catch (_) {}
  }

  function saveSetup(setup) {
    try { localStorage.setItem(KEY_SETUP, JSON.stringify(setup)); } catch (_) {}
  }

  function loadSetup() {
    try {
      const raw = localStorage.getItem(KEY_SETUP);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  // ════════════════════════════════════════════════════════════
  // ユーティリティ
  // ════════════════════════════════════════════════════════════

  function vibrate(pattern) {
    try {
      if ('vibrate' in navigator) navigator.vibrate(pattern);
    } catch (_) {}
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ════════════════════════════════════════════════════════════
  // 起動
  // ════════════════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', init);

  return { init };
})();
