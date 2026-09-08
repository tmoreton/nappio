export async function hasCompletedOnboarding(): Promise<boolean> {
  return true;
}

export async function markOnboardingComplete(): Promise<void> {
  // The public website does not persist native onboarding state.
}
