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

/** Level thresholds grow quadratically: xpForLevel(n) = 50 * n^2 */
export function xpForLevel(level: number): number {
  return 50 * level * level;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp && level < 99) level += 1;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const progress = Math.min(1, Math.max(0, (totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)));
  const title = TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))];
  return { level, currentLevelXp, nextLevelXp, progress, title };
}
