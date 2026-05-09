/* ============================================
   LUDUS LATRUNCULORUM — AI Engine
   ============================================
   Three difficulty levels:
   - Tiro (Easy): Random valid moves with basic capture awareness
   - Centurio (Medium): Evaluates captures, defense, and positioning
   - Legatus (Hard): Deeper evaluation with look-ahead
   ============================================ */

const AI = (() => {
    'use strict';

    // Weights for board evaluation
    const WEIGHTS = {
        PIECE_VALUE: 100,
        DUX_VALUE: 500,
        CAPTURE: 300,
        THREAT: -200,
        CENTER_BONUS: 15,
        MOBILITY: 5,
        DUX_SAFETY: 80,
        EDGE_PENALTY: -8,
        PAIR_BONUS: 20 // Adjacent friendly pieces
    };

    /**
     * Get the best move for the AI player
     * @param {Object} state - Current game state
     * @param {string} difficulty - 'tiro' | 'centurio' | 'legatus'
     * @returns {Object|null} { from: {r,c}, to: {r,c} }
     */
    function getBestMove(state, difficulty) {
        const aiPlayer = state.turn;
        const allMoves = getAllMoves(state, aiPlayer);

        if (allMoves.length === 0) return null;

        switch (difficulty) {
            case 'tiro': return tiroMove(state, allMoves, aiPlayer);
            case 'centurio': return centurioMove(state, allMoves, aiPlayer);
            case 'legatus': return legatusMove(state, allMoves, aiPlayer);
            default: return centurioMove(state, allMoves, aiPlayer);
        }
    }

    // --- TIRO (Easy) ---
    // Plays capture moves if available, otherwise random
    function tiroMove(state, allMoves, aiPlayer) {
        // 70% chance to pick a capture move if available
        const captureMoves = allMoves.filter(m => {
            const sim = simulateMove(state, m.from, m.to);
            return sim.captures > 0;
        });

        if (captureMoves.length > 0 && Math.random() < 0.7) {
            return captureMoves[Math.floor(Math.random() * captureMoves.length)];
        }

        return allMoves[Math.floor(Math.random() * allMoves.length)];
    }

    // --- CENTURIO (Medium) ---
    // Evaluates each move and picks the best
    function centurioMove(state, allMoves, aiPlayer) {
        let bestScore = -Infinity;
        let bestMoves = [];

        for (const move of allMoves) {
            const score = evaluateMove(state, move, aiPlayer);
            if (score > bestScore) {
                bestScore = score;
                bestMoves = [move];
            } else if (score === bestScore) {
                bestMoves.push(move);
            }
        }

        // Small randomness among equal-score moves
        return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    // --- LEGATUS (Hard) ---
    // Look-ahead: evaluate my move, then consider opponent's best response
    function legatusMove(state, allMoves, aiPlayer) {
        let bestScore = -Infinity;
        let bestMoves = [];
        const enemy = aiPlayer === 0 ? 1 : 0;

        for (const move of allMoves) {
            // Simulate my move
            const afterMyMove = applyMove(state, move.from, move.to);
            let moveScore = evaluateBoard(afterMyMove, aiPlayer);

            // Consider opponent's best reply
            const enemyMoves = getAllMoves(afterMyMove, enemy);
            if (enemyMoves.length > 0) {
                let worstForMe = Infinity;
                // Check a sample of enemy moves (limit for performance)
                const sample = enemyMoves.length > 20
                    ? shuffle(enemyMoves).slice(0, 20)
                    : enemyMoves;

                for (const emove of sample) {
                    const afterEnemy = applyMove(afterMyMove, emove.from, emove.to);
                    const score = evaluateBoard(afterEnemy, aiPlayer);
                    if (score < worstForMe) worstForMe = score;
                }
                moveScore = moveScore * 0.4 + worstForMe * 0.6;
            }

            if (moveScore > bestScore) {
                bestScore = moveScore;
                bestMoves = [move];
            } else if (Math.abs(moveScore - bestScore) < 2) {
                bestMoves.push(move);
            }
        }

        return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    // --- HELPERS ---

    function getAllMoves(state, player) {
        const moves = [];
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                const p = state.board[r][c];
                if (p && p.player === player) {
                    const dests = getMovesFor(state, r, c);
                    for (const dest of dests) {
                        moves.push({ from: { r, c }, to: dest });
                    }
                }
            }
        }
        return moves;
    }

    function getMovesFor(state, r, c) {
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

    function evaluateMove(state, move, aiPlayer) {
        const sim = simulateMove(state, move.from, move.to);
        let score = sim.captures * WEIGHTS.CAPTURE;

        // Bonus for capturing Dux
        if (sim.duxCaptured) score += WEIGHTS.DUX_VALUE * 2;

        // Center control
        const centerR = state.rows / 2;
        const centerC = state.cols / 2;
        const distToCenter = Math.abs(move.to.r - centerR) + Math.abs(move.to.c - centerC);
        score += (centerR + centerC - distToCenter) * WEIGHTS.CENTER_BONUS / (centerR + centerC);

        // Avoid edges slightly
        if (move.to.r === 0 || move.to.r === state.rows - 1 ||
            move.to.c === 0 || move.to.c === state.cols - 1) {
            score += WEIGHTS.EDGE_PENALTY;
        }

        // Check if we're threatening enemy pieces (flanking setup)
        score += countThreats(state, move.to, aiPlayer) * 50;

        // Check if the move puts us in danger
        score += countDanger(state, move, aiPlayer) * WEIGHTS.THREAT * 0.5;

        // Adjacent friendly pieces bonus
        score += countAdjacentFriendly(state, move.to, aiPlayer) * WEIGHTS.PAIR_BONUS;

        // Protect our Dux if variant is kowalski
        if (state.variant === 'kowalski') {
            const piece = state.board[move.from.r][move.from.c];
            if (piece && piece.isDux) {
                // Don't move Dux to dangerous spot
                const danger = countDanger(state, move, aiPlayer);
                score += danger * WEIGHTS.DUX_SAFETY * -1;
            }
        }

        return score;
    }

    function evaluateBoard(state, forPlayer) {
        let score = 0;
        const enemy = forPlayer === 0 ? 1 : 0;
        let myPieces = 0, enemyPieces = 0;

        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                const p = state.board[r][c];
                if (!p) continue;

                const val = p.isDux ? WEIGHTS.DUX_VALUE : WEIGHTS.PIECE_VALUE;

                if (p.player === forPlayer) {
                    score += val;
                    myPieces++;
                    // Position bonus
                    const centerR = state.rows / 2;
                    const centerC = state.cols / 2;
                    const dist = Math.abs(r - centerR) + Math.abs(c - centerC);
                    score += (centerR + centerC - dist) * 2;
                    // Mobility
                    score += getMovesFor(state, r, c).length * WEIGHTS.MOBILITY;
                } else {
                    score -= val;
                    enemyPieces++;
                }
            }
        }

        // Big bonus for piece advantage
        score += (myPieces - enemyPieces) * 50;

        return score;
    }

    function simulateMove(state, from, to) {
        const newState = applyMove(state, from, to);
        const oldEnemyCount = countPieces(state, state.board[from.r][from.c].player === 0 ? 1 : 0);
        const newEnemyCount = countPieces(newState, state.board[from.r][from.c].player === 0 ? 1 : 0);
        const captures = oldEnemyCount - newEnemyCount;

        // Check if Dux was captured
        let duxCaptured = false;
        if (state.variant === 'kowalski') {
            for (let r = 0; r < state.rows; r++) {
                for (let c = 0; c < state.cols; c++) {
                    const old = state.board[r][c];
                    const nw = newState.board[r][c];
                    if (old && old.isDux && (!nw || nw.player !== old.player)) {
                        duxCaptured = true;
                    }
                }
            }
        }

        return { captures, duxCaptured, newState };
    }

    function applyMove(state, from, to) {
        // Deep clone state
        const newBoard = state.board.map(row => row.map(cell => cell ? { ...cell } : null));
        const newState = {
            ...state,
            board: newBoard,
            turn: state.turn === 0 ? 1 : 0
        };

        // Move piece
        newState.board[to.r][to.c] = newState.board[from.r][from.c];
        newState.board[from.r][from.c] = null;

        // Check captures
        applyCaptures(newState, to.r, to.c);

        return newState;
    }

    function applyCaptures(state, r, c) {
        const attacker = state.board[r][c].player;
        const enemy = attacker === 0 ? 1 : 0;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

        for (const [dr, dc] of dirs) {
            const midR = r + dr, midC = c + dc;
            const farR = r + dr * 2, farC = c + dc * 2;

            if (isValid(state, farR, farC)) {
                const target = state.board[midR][midC];
                const anvil = state.board[farR][farC];
                if (target && target.player === enemy && anvil && anvil.player === attacker) {
                    if (!target.isDux) {
                        state.board[midR][midC] = null;
                    }
                }
            }
        }

        // Dux squeeze (Kowalski)
        if (state.variant === 'kowalski') {
            for (let row = 0; row < state.rows; row++) {
                for (let col = 0; col < state.cols; col++) {
                    const p = state.board[row][col];
                    if (p && p.isDux && isSqueezed(state, row, col)) {
                        state.board[row][col] = null;
                    }
                }
            }
        }
    }

    function isSqueezed(state, r, c) {
        const dux = state.board[r][c];
        const enemy = dux.player === 0 ? 1 : 0;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        return dirs.every(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            if (!isValid(state, nr, nc)) return true;
            return state.board[nr][nc] && state.board[nr][nc].player === enemy;
        });
    }

    function isValid(state, r, c) {
        return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
    }

    function countPieces(state, player) {
        let count = 0;
        for (const row of state.board) {
            for (const cell of row) {
                if (cell && cell.player === player) count++;
            }
        }
        return count;
    }

    function countThreats(state, pos, aiPlayer) {
        // How many enemy pieces could be captured from this position
        const enemy = aiPlayer === 0 ? 1 : 0;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        let threats = 0;

        for (const [dr, dc] of dirs) {
            const midR = pos.r + dr, midC = pos.c + dc;
            const farR = pos.r + dr * 2, farC = pos.c + dc * 2;
            if (isValid(state, farR, farC)) {
                const mid = state.board[midR]?.[midC];
                const far = state.board[farR]?.[farC];
                if (mid && mid.player === enemy && far && far.player === aiPlayer) {
                    threats++;
                }
            }
        }
        return threats;
    }

    function countDanger(state, move, aiPlayer) {
        // Check if landing here could get us captured next turn
        const enemy = aiPlayer === 0 ? 1 : 0;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        let danger = 0;

        for (const [dr, dc] of dirs) {
            const adjR = move.to.r + dr, adjC = move.to.c + dc;
            const oppR = move.to.r - dr, oppC = move.to.c - dc;

            if (isValid(state, adjR, adjC) && isValid(state, oppR, oppC)) {
                const adj = state.board[adjR]?.[adjC];
                const opp = state.board[oppR]?.[oppC];
                // If one side has enemy and opposite is empty (enemy could move there)
                if (adj && adj.player === enemy && !opp) danger++;
                if (opp && opp.player === enemy && !adj) danger++;
            }
        }
        return danger;
    }

    function countAdjacentFriendly(state, pos, player) {
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        let count = 0;
        for (const [dr, dc] of dirs) {
            const nr = pos.r + dr, nc = pos.c + dc;
            if (isValid(state, nr, nc)) {
                const p = state.board[nr]?.[nc];
                if (p && p.player === player) count++;
            }
        }
        return count;
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    return { getBestMove };
})();
