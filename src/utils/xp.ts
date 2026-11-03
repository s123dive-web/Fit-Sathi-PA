export const XP = {
  habitDone: 10,
  supplementTaken: 5,
  waterTap: 1,
  waterTargetHit: 10,
  weightLogged: 5,
  mealLogged: 2,
  photoAdded: 15,
  streakBonusPer7: 20,
} as const;

export interface LevelInfo {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number; // 0..1
  title: string;
}

const TITLES = ['Beginner', 'Starter', 'Regular', 'Committed', 'Disciplined', 'Athlete', 'Champion', 'Legend'];

/**
 * XP at which a level starts. Thresholds grow quadratically from zero: xpForLevel(n) = 50·(n−1)²,
 * so level 1 spans 0..50 XP, level 2 starts at 50, level 3 at 200, level 4 at 450, …
 */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return 50 * (n - 1) * (n - 1);
}

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0;
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 99) level += 1;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const progress = Math.min(1, Math.max(0, (xp - currentLevelXp) / (nextLevelXp - currentLevelXp)));
  const title = TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))];
  return { level, currentLevelXp, nextLevelXp, progress, title };
}
