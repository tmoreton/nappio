import { useKeepAwake } from 'expo-keep-awake';

export function useMonitoringKeepAwake() {
  useKeepAwake('nappio-baby-monitor', { suppressDeactivateWarnings: true });
}
