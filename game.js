/* ============================================
   LUDUS LATRUNCULORUM — Game Logic & UI
   v3.0 — Timer, Animation, Themes
   ============================================ */

(() => {
    'use strict';

    // --- GAME STATE ---
    let gameActive = false;
    const state = {
        rows: 8, cols: 12,
        variant: 'bell',
        turn: 0,
        mode: 'ai',
        aiDifficulty: 'centurio',
        players: [
            { name: "Legatus", color: "#c62828", score: 0 },
            { name: "Caesar AI", color: "#1a237e", score: 0 }
        ],
        board: [],
        selected: null,
        moves: [],
        aiThinking: false,
        history: [],
        moveNumber: 0,
        timerEnabled: false,
        timerDuration: 30
    };

    // --- TIMER ---
    let timerInterval = null;
    let timerRemaining = 30;
    const CIRCUMFERENCE = 126; // 2*pi*r for r=20

    // --- THEME ---
    let isDark = true;

    const DESCRIPTIONS = {
        bell: "Captura flanqueando al enemigo (2 contra 1). Movimiento tipo Torre sin límite de casillas.",
        kowalski: "Incluye al 'Dux' (con corona). El Dux necesita estar rodeado por 4 enemigos para caer."
    };

    // --- STATISTICS (localStorage) ---
    const STATS_KEY = 'ludus_latrunculorum_stats';

    function loadStats() {
        try {
            const raw = localStorage.getItem(STATS_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return {
            totalGames: 0,
            wins: 0, losses: 0, draws: 0,
            winStreak: 0, bestStreak: 0, currentStreak: 0,
            totalCaptures: 0,
            byDifficulty: {
                tiro: { played: 0, won: 0 },
                centurio: { played: 0, won: 0 },
                legatus: { played: 0, won: 0 }
            },
            pvpGames: 0
        };
    }

    function saveStats(stats) {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
    }

    function recordGameResult(won, captures) {
        const stats = loadStats();
        stats.totalGames++;
        stats.totalCaptures += captures;

        if (state.mode === 'ai') {
            const diff = state.aiDifficulty;
            if (!stats.byDifficulty[diff]) stats.byDifficulty[diff] = { played: 0, won: 0 };
            stats.byDifficulty[diff].played++;
            if (won) {
                stats.wins++;
                stats.byDifficulty[diff].won++;
                stats.currentStreak++;
                if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
            } else {
                stats.losses++;
                stats.currentStreak = 0;
            }
        } else {
            stats.pvpGames++;
        }
        saveStats(stats);
    }

    // --- DOM CACHE ---
    const $ = id => document.getElementById(id);
    const DOM = {};

    function cacheDom() {
        DOM.modal = $('setup-modal');
        DOM.modalTitle = $('modal-title');
        DOM.playBtn = $('play-btn');
        DOM.cancelBtn = $('cancel-btn');
        DOM.board = $('game-board');
        DOM.p1Name = $('p1-name');
        DOM.p2Name = $('p2-name');
        DOM.p1Color = $('p1-color');
        DOM.p2Color = $('p2-color');
        DOM.rows = $('rows-input');
        DOM.cols = $('cols-input');
        DOM.startP = $('start-player-input');
        DOM.variant = $('variant-input');
        DOM.variantInfo = $('variant-info');
        DOM.p1Card = $('p1-card');
        DOM.p2Card = $('p2-card');
        DOM.p1Tag = $('p1-tag');
        DOM.p2Tag = $('p2-tag');
        DOM.p1Score = $('p1-score');
        DOM.p2Score = $('p2-score');
        DOM.alert = $('alert-box');
        DOM.restartBtn = $('restart-game-btn');
        DOM.settingsBtn = $('open-settings-btn');
        DOM.modeAi = $('mode-ai');
        DOM.modePvp = $('mode-pvp');
        DOM.p2Section = $('p2-section');
        DOM.diffSelector = $('diff-selector');
        DOM.aiThinking = $('ai-thinking');
        DOM.victoryOverlay = $('victory-overlay');
        DOM.victoryName = $('victory-name');
        DOM.victoryPlayAgain = $('victory-play-again');
        DOM.turnIndicator = $('turn-indicator');
        DOM.turnName = $('turn-name');
        DOM.aiBadge = $('ai-badge');
        DOM.historyList = $('history-list');
        DOM.undoBtn = $('undo-btn');
        DOM.historyPanel = $('history-panel');
        DOM.historyToggle = $('history-toggle');
        DOM.statsBtn = $('stats-btn');
        DOM.statsOverlay = $('stats-overlay');
        DOM.statsClose = $('stats-close');
        DOM.soundToggle = $('sound-toggle');
        DOM.victoryStats = $('victory-stats');
        // Timer
        DOM.timerEnabled = $('timer-enabled');
        DOM.timerDuration = $('timer-duration');
        DOM.timerConfig = $('timer-config');
        DOM.timerWidget = $('timer-widget');
        DOM.timerRing = $('timer-ring');
        DOM.timerProgress = $('timer-progress');
        DOM.timerCount = $('timer-count');
        // Theme
        DOM.themeToggle = $('theme-toggle');
        DOM.hintBtn = $('hint-btn');
    }

    // --- INITIALIZATION ---
    window.addEventListener('DOMContentLoaded', () => {
        cacheDom();

        DOM.variantInfo.textContent = DESCRIPTIONS.bell;
        DOM.variant.onchange = e => DOM.variantInfo.textContent = DESCRIPTIONS[e.target.value];

        DOM.playBtn.onclick = startGame;
        DOM.restartBtn.onclick = () => resetGame(true);
        DOM.settingsBtn.onclick = openSettings;
        DOM.cancelBtn.onclick = () => { DOM.modal.classList.add('hidden'); SFX.click(); };

        DOM.modeAi.onclick = () => { setMode('ai'); SFX.click(); };
        DOM.modePvp.onclick = () => { setMode('pvp'); SFX.click(); };

        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.aiDifficulty = btn.dataset.diff;
                SFX.click();
            };
        });

        DOM.victoryPlayAgain.onclick = () => {
            DOM.victoryOverlay.classList.add('hidden');
            SFX.click();
            openSettings();
        };

        // Undo button
        if (DOM.undoBtn) {
            DOM.undoBtn.onclick = () => undoMove();
        }

        // History panel toggle
        if (DOM.historyToggle) {
            DOM.historyToggle.onclick = () => {
                DOM.historyPanel.classList.toggle('collapsed');
                SFX.click();
            };
        }

        // Stats
        if (DOM.statsBtn) {
            DOM.statsBtn.onclick = () => { showStats(); SFX.click(); };
        }
        if (DOM.statsClose) {
            DOM.statsClose.onclick = () => { DOM.statsOverlay.classList.add('hidden'); SFX.click(); };
        }

        if (DOM.soundToggle) {
            DOM.soundToggle.onclick = () => {
                const on = SFX.isEnabled();
                SFX.setEnabled(!on);
                DOM.soundToggle.textContent = !on ? '🔊' : '🔇';
            };
        }

        // Timer toggle
        if (DOM.timerEnabled) {
            DOM.timerEnabled.onchange = () => {
                DOM.timerConfig.style.display = DOM.timerEnabled.checked ? 'flex' : 'none';
            };
        }

        // Theme toggle
        if (DOM.themeToggle) {
            DOM.themeToggle.onclick = () => {
                isDark = !isDark;
                document.body.classList.toggle('light-theme', !isDark);
                DOM.themeToggle.textContent = isDark ? '☀️' : '🌙';
                SFX.click();
            };
        }

        // PWA Setup
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').then(reg => {
                    console.log('ServiceWorker registration successful with scope: ', reg.scope);
                }, err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
            });
        }

        // Tutorial Setup
        DOM.tutorialBtn = $('tutorial-btn');
        DOM.tutorialOverlay = $('tutorial-overlay');
        DOM.tutorialTitle = $('tutorial-title');
        DOM.tutorialText = $('tutorial-text');
        DOM.tutorialPrev = $('tutorial-prev');
        DOM.tutorialNext = $('tutorial-next');
        DOM.tutorialClose = $('tutorial-close');
        DOM.tutorialHighlight = $('tutorial-highlight');

        if (DOM.tutorialBtn) {
            DOM.tutorialBtn.onclick = startTutorial;
        }
        if (DOM.tutorialClose) {
            DOM.tutorialClose.onclick = endTutorial;
        }
        if (DOM.tutorialNext) {
            DOM.tutorialNext.onclick = nextTutorialStep;
        }
        if (DOM.tutorialPrev) {
            DOM.tutorialPrev.onclick = prevTutorialStep;
        }

        if (DOM.hintBtn) {
            DOM.hintBtn.onclick = getHint;
        }

        setMode('ai');
    });

    function setMode(mode) {
        state.mode = mode;
        DOM.modeAi.classList.toggle('active', mode === 'ai');
        DOM.modePvp.classList.toggle('active', mode === 'pvp');

        if (mode === 'ai') {
            DOM.p2Section.style.display = 'none';
            DOM.diffSelector.style.display = '';
            DOM.p2Name.value = 'Caesar AI';
        } else {
            DOM.p2Section.style.display = '';
            DOM.diffSelector.style.display = 'none';
            if (DOM.p2Name.value === 'Caesar AI') DOM.p2Name.value = 'Legatus B';
        }
    }

    // --- GAME FLOW ---

    function startGame() {
        state.players[0].name = DOM.p1Name.value || "Legatus";
        state.players[0].color = DOM.p1Color.value;
        state.players[1].color = DOM.p2Color.value;

        if (state.mode === 'ai') {
            state.players[1].name = 'Caesar AI';
        } else {
            state.players[1].name = DOM.p2Name.value || "Legatus B";
        }

        state.timerEnabled = DOM.timerEnabled ? DOM.timerEnabled.checked : false;
        state.timerDuration = DOM.timerDuration ? parseInt(DOM.timerDuration.value) : 30;

        if (!gameActive) {
            state.rows = Math.min(Math.max(parseInt(DOM.rows.value), 7), 12);
            state.cols = Math.min(Math.max(parseInt(DOM.cols.value), 8), 14);
            state.variant = DOM.variant.value;
            state.turn = parseInt(DOM.startP.value);
            resetGame(false);
            gameActive = true;
        } else {
            updateUI();
        }

        DOM.modal.classList.add('hidden');
        SFX.gameStart();

        if (state.timerEnabled) startTimer();
        if (state.mode === 'ai' && state.turn === 1) scheduleAiMove();
    }

    function resetGame(ask) {
        if (ask && !confirm("¿Reiniciar la partida actual?")) return;

        state.board = Array(state.rows).fill(null).map(() => Array(state.cols).fill(null));

        for (let c = 0; c < state.cols; c++) {
            state.board[0][c] = { player: 0, isDux: false };
            state.board[1][c] = { player: 0, isDux: false };
            state.board[state.rows - 1][c] = { player: 1, isDux: false };
            state.board[state.rows - 2][c] = { player: 1, isDux: false };
        }

        if (state.variant === 'kowalski') {
            const mid = Math.floor(state.cols / 2);
            state.board[0][mid].isDux = true;
            state.board[state.rows - 1][mid].isDux = true;
        }

        state.selected = null;
        state.moves = [];
        state.aiThinking = false;
        state.history = [];
        state.moveNumber = 0;
        gameActive = true;
        stopTimer();
        updateUI();
        updateHistoryUI();
        notify("⚔ Alea iacta est!");
        if (state.timerEnabled) {
            setTimeout(() => startTimer(), 100); // Small delay to ensure UI is ready
        }
    }

    function openSettings() {
        DOM.modal.classList.remove('hidden');
        DOM.modalTitle.textContent = gameActive ? "Configuratio" : "Ludus Latrunculorum";
        DOM.cancelBtn.classList.toggle('hidden', !gameActive);

        const locks = document.querySelectorAll('.settings-lock');
        locks.forEach(el => el.disabled = gameActive);
    }

    // --- GAME LOGIC ---

    function getMoves(r, c) {
        const possible = [];
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        for (const [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols && !state.board[nr][nc]) {
                possible.push({ r: nr, c: nc });
                nr += dr; nc += dc;
            }
        }
        return possible;
    }

    function selectCell(r, c) {
        if (state.aiThinking) return;
        if (state.mode === 'ai' && state.turn === 1) return;

        const piece = state.board[r][c];

        if (piece && piece.player === state.turn) {
            state.selected = { r, c };
            state.moves = getMoves(r, c);
            SFX.select();
        } else if (state.selected && state.moves.find(m => m.r === r && m.c === c)) {
            executeMove(state.selected.r, state.selected.c, r, c);
            return;
        } else {
            state.selected = null;
            state.moves = [];
        }
        updateUI();
    }

    function cloneBoard(board) {
        return board.map(row => row.map(cell => cell ? { ...cell } : null));
    }

    function executeMove(fr, fc, tr, tc, isAi = false) {
        const boardBefore = cloneBoard(state.board);
        const turnBefore = state.turn;

        // Compute cellSize for animation
        const cellSize = Math.min(
            (window.innerWidth - 230) / state.cols,
            (window.innerHeight - 250) / state.rows,
            55
        );

        const doMove = () => {
            const piece = state.board[fr][fc];
            state.board[tr][tc] = piece;
            state.board[fr][fc] = null;

            const captured = checkCaptures(tr, tc);
            state.moveNumber++;
            
            state.history.push({
                num: state.moveNumber, player: turnBefore,
                from: { r: fr, c: fc }, to: { r: tr, c: tc },
                captured, boardBefore, turnBefore, isAi
            });

            if (captured > 0) setTimeout(() => SFX.capture(), 100);

            state.turn = state.turn === 0 ? 1 : 0;
            state.selected = null;
            state.moves = [];
            updateUI();
            updateHistoryUI();
            
            if (checkVictory()) return;
            
            if (state.timerEnabled) startTimer();
            if (state.mode === 'ai' && state.turn === 1) scheduleAiMove();
        };

        if (!isAi) SFX.move();
        animatePiece(fr, fc, tr, tc, cellSize, doMove);
    }

    function checkCaptures(r, c) {
        const attacker = state.board[r][c].player;
        const enemy = attacker === 0 ? 1 : 0;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        let captured = 0;

        for (const [dr, dc] of dirs) {
            const midR = r + dr, midC = c + dc;
            const farR = r + dr * 2, farC = c + dc * 2;

            if (isValid(farR, farC)) {
                const target = state.board[midR][midC];
                const anvil = state.board[farR][farC];
                if (target && target.player === enemy && anvil && anvil.player === attacker) {
                    if (!target.isDux) {
                        state.board[midR][midC] = null;
                        captured++;
                        requestAnimationFrame(() => {
                            const cellEl = DOM.board.children[midR * state.cols + midC];
                            if (cellEl) {
                                cellEl.classList.add('capture-flash');
                                setTimeout(() => cellEl.classList.remove('capture-flash'), 500);
                            }
                        });
                    }
                }
            }
        }

        if (state.variant === 'kowalski') {
            for (let row = 0; row < state.rows; row++) {
                for (let col = 0; col < state.cols; col++) {
                    const p = state.board[row][col];
                    if (p && p.isDux && isSqueezed(row, col)) {
                        state.board[row][col] = null;
                        captured++;
                        SFX.duxFall();
                        notify("👑 ¡EL DUX HA CAÍDO!");
                    }
                }
            }
        }

        if (captured > 0 && !(state.variant === 'kowalski' && captured === 1)) {
            notify(`⚔ ${captured} ${captured > 1 ? 'capturas' : 'captura'}!`);
        }

        return captured;
    }

    function isSqueezed(r, c) {
        const dux = state.board[r][c];
        const enemy = dux.player === 0 ? 1 : 0;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        return dirs.every(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            if (!isValid(nr, nc)) return true;
            return state.board[nr][nc] && state.board[nr][nc].player === enemy;
        });
    }

    function isValid(r, c) {
        return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
    }

    function checkVictory() {
        let p1 = 0, p2 = 0;
        state.board.flat().forEach(p => {
            if (p?.player === 0) p1++;
            if (p?.player === 1) p2++;
        });

        if (p1 === 0) { endGame(1); return true; }
        if (p2 === 0) { endGame(0); return true; }

        let hasMoves = false;
        for (let r = 0; r < state.rows && !hasMoves; r++) {
            for (let c = 0; c < state.cols && !hasMoves; c++) {
                const p = state.board[r][c];
                if (p && p.player === state.turn && getMoves(r, c).length > 0) {
                    hasMoves = true;
                }
            }
        }
        if (!hasMoves) {
            endGame(state.turn === 0 ? 1 : 0);
            return true;
        }

        return false;
    }

    function endGame(winnerIndex) {
        gameActive = false;
        stopTimer();
        const winnerName = state.players[winnerIndex].name;
        DOM.victoryName.textContent = winnerName;
        DOM.victoryOverlay.classList.remove('hidden');

        let p0caps = 0, p1caps = 0;
        state.history.forEach(h => {
            if (h.player === 0) p0caps += h.captured;
            else p1caps += h.captured;
        });

        if (DOM.victoryStats) {
            DOM.victoryStats.innerHTML = `
                <div class="victory-stat-row"><span>Movimientos totales</span><span>${state.moveNumber}</span></div>
                <div class="victory-stat-row"><span>${state.players[0].name} — capturas</span><span>${p0caps}</span></div>
                <div class="victory-stat-row"><span>${state.players[1].name} — capturas</span><span>${p1caps}</span></div>
            `;
        }

        const humanWon = winnerIndex === 0;
        recordGameResult(humanWon, p0caps + p1caps);
        if (humanWon) SFX.victory(); else SFX.defeat();
    }

    function startTimer() {
        stopTimer();
        if (!state.timerEnabled) return;
        
        timerRemaining = parseInt(state.timerDuration) || 30;
        if (DOM.timerWidget) {
            DOM.timerWidget.style.display = 'flex';
            DOM.timerWidget.style.visibility = 'visible';
            DOM.timerWidget.classList.remove('hidden');
        }
        updateTimerUI();
        
        timerInterval = setInterval(() => {
            if (!gameActive || state.aiThinking) return;
            
            timerRemaining--;
            updateTimerUI();
            
            if (timerRemaining <= 0) {
                stopTimer();
                SFX.invalid();
                notify('⏱ ¡Tiempo agotado! Turno perdido.');
                
                // Switch turn
                state.turn = state.turn === 0 ? 1 : 0;
                state.selected = null;
                state.moves = [];
                updateUI();
                
                if (state.timerEnabled) startTimer();
                if (state.mode === 'ai' && state.turn === 1) scheduleAiMove();
            }
        }, 1000);
    }
    
    function stopTimer() {
        if (timerInterval) { 
            clearInterval(timerInterval); 
            timerInterval = null; 
        }
        if (DOM.timerWidget) {
            if (!state.timerEnabled) {
                DOM.timerWidget.style.display = 'none';
            } else {
                DOM.timerWidget.style.visibility = 'hidden';
            }
        }
    }
    
    function updateTimerUI() {
        if (!DOM.timerProgress || !DOM.timerCount) return;
        
        const duration = parseInt(state.timerDuration) || 30;
        const pct = Math.max(0, Math.min(1, timerRemaining / duration));
        const offset = CIRCUMFERENCE * (1 - pct);
        
        DOM.timerProgress.style.strokeDashoffset = offset;
        DOM.timerCount.textContent = Math.max(0, timerRemaining);
        
        const warn = timerRemaining <= 10;
        const danger = timerRemaining <= 5;
        DOM.timerCount.className = 'timer-count' + (danger ? ' danger' : warn ? ' warning' : '');
        
        if (danger && timerRemaining > 0) {
            DOM.timerWidget.classList.add('timer-pulse');
        } else {
            DOM.timerWidget.classList.remove('timer-pulse');
        }
    }

    function getHint() {
        if (state.aiThinking || state.turn !== 0 || !gameActive) return;
        
        SFX.click();
        const bestMove = AI.getBestMove(state, 'legatus');
        if (bestMove) {
            state.selected = bestMove.from;
            state.moves = [bestMove.to];
            updateUI();
            notify("💡 Consejo: Mueve la pieza resaltada a la posición indicada.");
        }
    }

    // --- UNDO ---

    function undoMove() {
        if (state.history.length === 0) return;
        if (state.aiThinking) return;

        // In AI mode, undo both AI and player moves
        if (state.mode === 'ai' && state.history.length >= 2) {
            const lastEntry = state.history[state.history.length - 1];
            if (lastEntry.isAi) {
                // Undo AI move, then undo player move
                const aiMove = state.history.pop();
                const playerMove = state.history.pop();
                state.board = cloneBoard(playerMove.boardBefore);
                state.turn = playerMove.turnBefore;
                state.moveNumber -= 2;
            } else {
                const entry = state.history.pop();
                state.board = cloneBoard(entry.boardBefore);
                state.turn = entry.turnBefore;
                state.moveNumber--;
            }
        } else {
            const entry = state.history.pop();
            state.board = cloneBoard(entry.boardBefore);
            state.turn = entry.turnBefore;
            state.moveNumber--;
        }

        state.selected = null;
        state.moves = [];
        SFX.undo();
        updateUI();
        updateHistoryUI();
        if (state.timerEnabled) startTimer();
    }

    // --- HISTORY UI ---

    function updateHistoryUI() {
        if (!DOM.historyList) return;

        DOM.historyList.innerHTML = '';

        if (state.history.length === 0) {
            DOM.historyList.innerHTML = '<div class="history-empty">Sin movimientos</div>';
            if (DOM.undoBtn) DOM.undoBtn.disabled = true;
            return;
        }

        if (DOM.undoBtn) DOM.undoBtn.disabled = false;

        state.history.forEach((h, i) => {
            const row = document.createElement('div');
            row.className = 'history-row';

            const colLetter = String.fromCharCode(65 + h.from.c);
            const colLetterTo = String.fromCharCode(65 + h.to.c);
            const fromStr = `${colLetter}${h.from.r + 1}`;
            const toStr = `${colLetterTo}${h.to.r + 1}`;

            const playerColor = state.players[h.player].color;
            const captureStr = h.captured > 0 ? ` ×${h.captured}` : '';

            row.innerHTML = `
                <span class="history-num">${h.num}.</span>
                <span class="history-dot" style="background:${playerColor}"></span>
                <span class="history-move">${fromStr}→${toStr}</span>
                ${captureStr ? `<span class="history-capture">${captureStr}</span>` : ''}
                ${h.isAi ? '<span class="history-ai">IA</span>' : ''}
            `;
            DOM.historyList.appendChild(row);
        });

        // Scroll to bottom
        DOM.historyList.scrollTop = DOM.historyList.scrollHeight;
    }

    // --- STATS UI ---

    function showStats() {
        if (!DOM.statsOverlay) return;
        const stats = loadStats();

        const winRate = stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0;

        const diffRows = ['tiro', 'centurio', 'legatus'].map(d => {
            const s = stats.byDifficulty[d] || { played: 0, won: 0 };
            const rate = s.played > 0 ? Math.round((s.won / s.played) * 100) : 0;
            const label = d === 'tiro' ? '🏹 Tiro' : d === 'centurio' ? '⚔️ Centurio' : '🦅 Legatus';
            return `
                <div class="stat-diff-row">
                    <span>${label}</span>
                    <span>${s.won}/${s.played}</span>
                    <span>${rate}%</span>
                </div>
            `;
        }).join('');

        $('stats-content').innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalGames}</div>
                    <div class="stat-label">Partidas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.wins}</div>
                    <div class="stat-label">Victorias</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.losses}</div>
                    <div class="stat-label">Derrotas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${winRate}%</div>
                    <div class="stat-label">% Victoria</div>
                </div>
            </div>
            <div class="stat-section-title">Mejor racha: ${stats.bestStreak} | Racha actual: ${stats.currentStreak}</div>
            <div class="stat-section-title" style="margin-top:0.8rem">Capturas totales: ${stats.totalCaptures}</div>
            <div class="stat-section-title" style="margin-top:1rem">Por dificultad (ganadas/jugadas)</div>
            <div class="stat-diff-grid">${diffRows}</div>
            ${stats.pvpGames > 0 ? `<div class="stat-section-title" style="margin-top:0.6rem">Partidas PvP: ${stats.pvpGames}</div>` : ''}
        `;

        DOM.statsOverlay.classList.remove('hidden');
    }

    // --- AI ---

    function scheduleAiMove() {
        stopTimer();
        state.aiThinking = true;
        DOM.aiThinking.classList.add('visible');
        const delay = state.aiDifficulty === 'legatus' ? 800 : state.aiDifficulty === 'centurio' ? 500 : 300;
        setTimeout(() => {
            const move = AI.getBestMove(state, state.aiDifficulty);
            state.aiThinking = false;
            DOM.aiThinking.classList.remove('visible');
            if (move) {
                state.selected = move.from;
                state.moves = [move.to];
                updateUI();
                setTimeout(() => {
                    SFX.move();
                    executeMove(move.from.r, move.from.c, move.to.r, move.to.c, true);
                }, 350);
            }
        }, delay);
    }

    // --- UI RENDERING ---

    function updateUI() {
        DOM.p1Tag.textContent = state.players[0].name;
        DOM.p1Tag.style.color = state.players[0].color;
        DOM.p2Tag.textContent = state.players[1].name;
        DOM.p2Tag.style.color = state.players[1].color;

        if (DOM.aiBadge) {
            DOM.aiBadge.style.display = state.mode === 'ai' ? 'inline-block' : 'none';
        }

        DOM.p1Card.classList.toggle('active-turn', state.turn === 0);
        DOM.p2Card.classList.toggle('active-turn', state.turn === 1);

        DOM.turnName.textContent = state.players[state.turn].name;
        DOM.turnName.style.color = state.players[state.turn].color;

        let s0 = 0, s1 = 0;
        state.board.flat().forEach(p => {
            if (p?.player === 0) s0++;
            if (p?.player === 1) s1++;
        });
        DOM.p1Score.textContent = `⚔ ${s0} piezas`;
        DOM.p2Score.textContent = `⚔ ${s1} piezas`;

        // Render Board
        DOM.board.innerHTML = '';
        DOM.board.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;
        DOM.board.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
        DOM.board.style.position = 'relative';

        const cellSize = Math.min(
            (window.innerWidth - 230) / state.cols,
            (window.innerHeight - 250) / state.rows,
            55
        );
        DOM.board.style.width = `${cellSize * state.cols}px`;

        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                const cell = document.createElement('div');
                cell.className = `cell ${(r + c) % 2 === 0 ? 'cell-light' : 'cell-dark'}`;
                cell.style.cssText = `width:${cellSize}px;height:${cellSize}px;position:relative;`;
                cell.onclick = () => selectCell(r, c);

                const data = state.board[r][c];
                if (data) {
                    const piece = document.createElement('div');
                    piece.className = 'piece';
                    piece.style.backgroundColor = state.players[data.player].color;
                    if (state.selected && state.selected.r === r && state.selected.c === c)
                        piece.classList.add('selected');
                    if (data.isDux) {
                        piece.classList.add('is-dux');
                        piece.innerHTML = `<svg viewBox="0 0 24 24" class="dux-crown" fill="rgba(255,215,0,0.8)"><path d="M5,16L3,5L8.5,10L12,4L15.5,10L21,5L19,16H5M19,19A1,1 0 0,1 18,20H6A1,1 0 0,1 5,19V18H19V19Z"/></svg>`;
                    }
                    cell.appendChild(piece);
                }

                if (state.moves.find(m => m.r === r && m.c === c)) {
                    const dot = document.createElement('div');
                    dot.className = 'move-dot';
                    cell.appendChild(dot);
                    cell.onclick = () => selectCell(r, c);
                }

                DOM.board.appendChild(cell);
            }
        }
    }

    // --- PIECE SLIDE ANIMATION ---
    function animatePiece(fr, fc, tr, tc, cellSize, callback) {
        const fromCell = DOM.board.children[fr * state.cols + fc];
        const toCell = DOM.board.children[tr * state.cols + tc];
        if (!fromCell || !toCell) { callback(); return; }

        const fromRect = fromCell.getBoundingClientRect();
        const boardRect = DOM.board.getBoundingClientRect();
        const piece = fromCell.querySelector('.piece');
        if (!piece) { callback(); return; }

        const clone = piece.cloneNode(true);
        clone.style.cssText = `
            position:fixed;
            width:${cellSize * 0.78}px; height:${cellSize * 0.78}px;
            left:${fromRect.left + cellSize * 0.11}px;
            top:${fromRect.top + cellSize * 0.11}px;
            transition:left 0.25s cubic-bezier(0.4,0,0.2,1),top 0.25s cubic-bezier(0.4,0,0.2,1);
            z-index:100; pointer-events:none;
            border-radius:50%;
            box-shadow:0 6px 20px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(clone);

        const toRect = toCell.getBoundingClientRect();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                clone.style.left = `${toRect.left + cellSize * 0.11}px`;
                clone.style.top  = `${toRect.top  + cellSize * 0.11}px`;
            });
        });
        setTimeout(() => {
            document.body.removeChild(clone);
            callback();
        }, 270);
    }

    // --- TUTORIAL LOGIC ---
    let tutorialStep = 0;
    const tutorialSteps = [
        { title: "Bienvenido", text: "Ludus Latrunculorum es un antiguo juego de estrategia romano. Tu objetivo es capturar las piezas del rival dejándolo sin movimientos o sin tropas.", target: null },
        { title: "El Tablero", text: "Juegas sobre una cuadrícula. En tu turno, debes mover una de tus piezas.", target: () => DOM.board },
        { title: "Movimiento Ortogonal", text: "Las piezas se mueven como la Torre en el ajedrez: en línea recta (horizontal o vertical) tantas casillas libres como desees.", target: () => DOM.board },
        { title: "Captura por Flanqueo", text: "Para capturar una pieza enemiga, debes 'flanquearla', es decir, atraparla entre dos de tus piezas en la misma fila o columna.", target: () => DOM.board },
        { title: "Regla de Seguridad", text: "Una pieza puede moverse libremente a una casilla entre dos enemigos sin ser capturada. ¡Solo se captura si el movimiento enemigo la rodea!", target: null },
        { title: "Variante Kowalski (Dux)", text: "Si juegas la variante con el Dux (pieza especial), este no puede ser capturado de forma normal. Para capturarlo, debes rodearlo completamente por los 4 lados.", target: null },
        { title: "Historia y Deshacer", text: "Puedes revisar tus movimientos y deshacer el último error usando el panel lateral.", target: () => DOM.historyPanel },
        { title: "¡A la batalla!", text: "Ya estás listo para liderar a tus legiones hacia la victoria. ¡Roma invicta!", target: null }
    ];

    function startTutorial() {
        DOM.modal.classList.add('hidden');
        resetGame(false);
        tutorialStep = 0;
        DOM.tutorialOverlay.classList.remove('hidden');
        renderTutorialStep();
        SFX.click();
    }

    function endTutorial() {
        DOM.tutorialOverlay.classList.add('hidden');
        DOM.tutorialHighlight.classList.add('hidden');
        openSettings();
        SFX.click();
    }

    function renderTutorialStep() {
        const step = tutorialSteps[tutorialStep];
        DOM.tutorialTitle.textContent = step.title;
        DOM.tutorialText.textContent = step.text;
        
        DOM.tutorialPrev.disabled = tutorialStep === 0;
        DOM.tutorialNext.textContent = tutorialStep === tutorialSteps.length - 1 ? "Terminar" : "Siguiente";

        if (step.target) {
            const targetEl = step.target();
            if (targetEl) {
                const rect = targetEl.getBoundingClientRect();
                DOM.tutorialHighlight.style.top = `${rect.top - 5}px`;
                DOM.tutorialHighlight.style.left = `${rect.left - 5}px`;
                DOM.tutorialHighlight.style.width = `${rect.width + 10}px`;
                DOM.tutorialHighlight.style.height = `${rect.height + 10}px`;
                DOM.tutorialHighlight.classList.remove('hidden');
            } else {
                DOM.tutorialHighlight.classList.add('hidden');
            }
        } else {
            DOM.tutorialHighlight.classList.add('hidden');
        }
        SFX.move();
    }

    function nextTutorialStep() {
        if (tutorialStep < tutorialSteps.length - 1) {
            tutorialStep++;
            renderTutorialStep();
        } else {
            endTutorial();
        }
    }

    function prevTutorialStep() {
        if (tutorialStep > 0) {
            tutorialStep--;
            renderTutorialStep();
        }
    }

    function notify(msg) {
        DOM.alert.textContent = msg;
        DOM.alert.classList.add('visible');
        setTimeout(() => DOM.alert.classList.remove('visible'), 2500);
    }

    window.addEventListener('resize', () => {
        if (gameActive) updateUI();
    });
})();
