type StatsReport = {
  id?: string;
  type?: string;
  kind?: string;
  mediaType?: string;
  audioLevel?: number;
  totalAudioEnergy?: number;
  totalSamplesDuration?: number;
  selectedCandidatePairId?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
  nominated?: boolean;
  selected?: boolean;
  state?: string;
};

export type IceTransportKind = 'direct' | 'relay';

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

export function iceTransportFromStats(reports: Iterable<unknown>): IceTransportKind | null {
  const values = [...reports].filter(
    (value): value is StatsReport => Boolean(value) && typeof value === 'object',
  );
  const byId = new Map(values.map((value) => [value.id, value]));
  const transport = values.find(
    (value) => value.type === 'transport' && typeof value.selectedCandidatePairId === 'string',
  );
  const selectedPair = transport?.selectedCandidatePairId
    ? byId.get(transport.selectedCandidatePairId)
    : values.find(
        (value) =>
          value.type === 'candidate-pair' &&
          (value.selected === true || (value.nominated === true && value.state === 'succeeded')),
      );
  if (!selectedPair) return null;
  const local = selectedPair.localCandidateId ? byId.get(selectedPair.localCandidateId) : undefined;
  const remote = selectedPair.remoteCandidateId ? byId.get(selectedPair.remoteCandidateId) : undefined;
  if (!local && !remote) return null;
  return local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : 'direct';
}

export function connectionErrorMessage(state: string) {
  if (state === 'failed') {
    return 'A direct connection could not be established. Check both networks and try again.';
  }
  return 'The connection to the other device was interrupted.';
}
