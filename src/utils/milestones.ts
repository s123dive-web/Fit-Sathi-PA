/** Streak milestones that trigger confetti. */
export const STREAK_MILESTONES = [7, 21, 30, 60, 90] as const;

export function isMilestone(streak: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(streak);
}
