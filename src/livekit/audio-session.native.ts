import { AndroidAudioTypePresets, AudioSession } from '@livekit/react-native';

import type { MonitorRole } from '@/types/monitor';

export async function startMonitoringAudioSession(role: MonitorRole) {
  await AudioSession.configureAudio({
    android: {
      audioTypeOptions:
        role === 'parent' ? AndroidAudioTypePresets.media : AndroidAudioTypePresets.communication,
    },
    ios: { defaultOutput: 'speaker' },
  });
  await AudioSession.startAudioSession();
}

export async function stopMonitoringAudioSession() {
  await AudioSession.stopAudioSession();
}

export async function showMonitoringAudioRoutePicker() {
  await AudioSession.showAudioRoutePicker();
}
