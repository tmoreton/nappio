import { AndroidAudioTypePresets, AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import type { MonitorRole } from '@/types/monitor';

export async function startMonitoringAudioSession(role: MonitorRole) {
  if (Platform.OS === 'ios') {
    // The startup policy in setup.native.ts owns AVAudioSession on the native
    // audio-engine thread. Starting it here as well can race that lifecycle.
    return;
  }

  await AudioSession.configureAudio({
    android: {
      audioTypeOptions: AndroidAudioTypePresets.communication,
      preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
    },
  });
  if (role === 'parent') {
    await AudioSession.setDefaultRemoteAudioTrackVolume(1);
  }
  await AudioSession.startAudioSession();
}

export async function stopMonitoringAudioSession() {
  if (Platform.OS === 'ios') return;
  await AudioSession.stopAudioSession();
}

export async function showMonitoringAudioRoutePicker() {
  await AudioSession.showAudioRoutePicker();
}
