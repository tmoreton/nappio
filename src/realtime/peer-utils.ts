type StatsReport = {
  type?: string;
  kind?: string;
  mediaType?: string;
  audioLevel?: number;
  totalAudioEnergy?: number;
  totalSamplesDuration?: number;
};

export type AudioEnergySample = {
  totalAudioEnergy: number;
  totalSamplesDuration: number;
};

export function audioLevelFromStats(
  reports: Iterable<unknown>,
  previous: AudioEnergySample | null,
) {
  for (const value of reports) {
    if (!value || typeof value !== 'object') continue;
    const report = value as StatsReport;
    if (
      report.type !== 'inbound-rtp' ||
      (report.kind !== 'audio' && report.mediaType !== 'audio')
    ) {
      continue;
    }
    if (typeof report.audioLevel === 'number' && Number.isFinite(report.audioLevel)) {
      return { level: Math.max(0, Math.min(1, report.audioLevel)), sample: previous };
    }
    if (
      typeof report.totalAudioEnergy !== 'number' ||
      typeof report.totalSamplesDuration !== 'number'
    ) {
      continue;
    }
    const sample = {
      totalAudioEnergy: report.totalAudioEnergy,
      totalSamplesDuration: report.totalSamplesDuration,
    };
    if (!previous) return { level: 0, sample };
    const duration = sample.totalSamplesDuration - previous.totalSamplesDuration;
    const energy = sample.totalAudioEnergy - previous.totalAudioEnergy;
    const level = duration > 0 && energy >= 0 ? Math.sqrt(energy / duration) : 0;
    return { level: Math.max(0, Math.min(1, level)), sample };
  }
  return { level: 0, sample: previous };
}

export function iterableStats(stats: unknown): Iterable<unknown> {
  if (stats && typeof stats === 'object') {
    const candidate = stats as {
      values?: () => IterableIterator<unknown>;
      forEach?: (callback: (value: unknown) => void) => void;
    };
    if (typeof candidate.values === 'function') return candidate.values();
    if (typeof candidate.forEach === 'function') {
      const values: unknown[] = [];
      candidate.forEach((value) => values.push(value));
      return values;
    }
  }
  return [];
}

export function connectionErrorMessage(state: string) {
  if (state === 'failed') {
    return 'A direct connection could not be established. Check both networks and try again.';
  }
  return 'The connection to the other device was interrupted.';
}
