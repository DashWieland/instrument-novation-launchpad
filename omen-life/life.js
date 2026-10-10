// Life-like cellular automata on an 8×8 torus. Pure.
// A board is a Uint8Array(64) of 0/1, index y * 8 + x (y = 0 is the top row).

export const N = 8;

// The eight rules on the Mini's right column, top to bottom.
export const RULES = [
  { name: 'Life',        code: 'B3/S23' },
  { name: 'HighLife',    code: 'B36/S23' },
  { name: 'Day & Night', code: 'B3678/S34678' },
  { name: 'Morley',      code: 'B368/S245' },
  { name: '2×2',         code: 'B36/S125' },
  { name: 'Maze',        code: 'B3/S12345' },
  { name: 'Diamoeba',    code: 'B35678/S5678' },
  { name: 'Seeds',       code: 'B2/S' },
];

// 'B36/S23' → { born: [9 booleans], survive: [9 booleans] }, indexed by neighbour count.
export function parseRule(code) {
  const m = /^B(\d*)\/S(\d*)$/i.exec(code.trim());
  if (!m) throw new Error(`not a B/S rule: ${code}`);
  const table = digits => Array.from({ length: 9 }, (_, n) => digits.includes(String(n)));
  return { born: table(m[1]), survive: table(m[2]) };
}

export function neighbours(board, x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx || dy) n += board[((y + dy + N) % N) * N + ((x + dx + N) % N)];
  }
  return n;
}

export function step(board, rule) {
  const next = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, n = neighbours(board, x, y);
    next[i] = (board[i] ? rule.survive[n] : rule.born[n]) ? 1 : 0;
  }
  return next;
}

// What changes between two boards: indices born, died and surviving.
export function changes(now, next) {
  const born = [], died = [], kept = [];
  for (let i = 0; i < now.length; i++) {
    if (!now[i] && next[i]) born.push(i);
    else if (now[i] && !next[i]) died.push(i);
    else if (now[i]) kept.push(i);
  }
  return { born, died, kept };
}

export const population = board => board.reduce((a, b) => a + b, 0);

// 64 cells → 16 hex digits; equal boards give equal keys.
export function key(board) {
  let s = '';
  for (let i = 0; i < board.length; i += 4)
    s += (board[i] | board[i + 1] << 1 | board[i + 2] << 2 | board[i + 3] << 3).toString(16);
  return s;
}

// Small deterministic PRNG (mulberry32), so seed No. N is the same board for everyone.
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seeded(seed, density = 0.3) {
  const rand = prng(seed), board = new Uint8Array(N * N);
  for (let i = 0; i < board.length; i++) board[i] = rand() < density ? 1 : 0;
  return board;
}
