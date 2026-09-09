import { registerGlobals, setupIOSAudioManagement } from '@livekit/react-native';

registerGlobals({ autoConfigureAudioSession: false });

setupIOSAudioManagement(true, {
  recording: {
    audioCategory: 'playAndRecord',
    audioCategoryOptions: ['allowBluetooth', 'defaultToSpeaker'],
    audioMode: 'videoChat',
  },
  playout: {
    audioCategory: 'playback',
    audioCategoryOptions: [],
    audioMode: 'spokenAudio',
  },
  deactivateOnStop: true,
});

export {};
