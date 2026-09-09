import * as SecureStore from 'expo-secure-store';

const ONBOARDING_KEY = 'nappio.onboarding.v2';
const COMPLETE_VALUE = 'complete';

export async function hasCompletedOnboarding(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === COMPLETE_VALUE;
}

export async function markOnboardingComplete(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_KEY, COMPLETE_VALUE, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}
