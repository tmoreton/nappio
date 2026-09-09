import { appendFile } from 'node:fs/promises';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '';
const apiToken = process.env.CLOUDFLARE_ANALYTICS_TOKEN?.trim() ?? '';
const warningGb = Number(process.env.TURN_DAILY_EGRESS_WARN_GB ?? '30');

if (!/^[a-f0-9]{32}$/i.test(accountId)) {
  throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character Cloudflare account ID.');
}
if (!apiToken) throw new Error('CLOUDFLARE_ANALYTICS_TOKEN is required.');
if (!Number.isFinite(warningGb) || warningGb <= 0) {
  throw new Error('TURN_DAILY_EGRESS_WARN_GB must be a positive number.');
}

const requestedDate = process.env.TURN_USAGE_DATE?.trim();
if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
  throw new Error('TURN_USAGE_DATE must use YYYY-MM-DD.');
}
const usageDate = requestedDate
  ? new Date(`${requestedDate}T00:00:00.000Z`)
  : new Date(Date.now() - 86_400_000);
if (Number.isNaN(usageDate.getTime())) throw new Error('TURN_USAGE_DATE must use YYYY-MM-DD.');
const date = usageDate.toISOString().slice(0, 10);

const query = `query {
  viewer {
    accounts(filter: { accountTag: "${accountId}" }) {
      callsTurnUsageAdaptiveGroups(
        limit: 1000
        filter: { date_geq: "${date}", date_leq: "${date}" }
        orderBy: [datetimeHour_ASC]
      ) {
        dimensions { datetimeHour }
        sum { egressBytes ingressBytes }
        avg { concurrentConnectionsFiveMinutes }
      }
    }
  }
}`;

const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});
if (!response.ok) throw new Error(`Cloudflare analytics returned HTTP ${response.status}.`);

const payload = await response.json();
if (Array.isArray(payload.errors) && payload.errors.length > 0) {
  throw new Error(`Cloudflare analytics query failed: ${payload.errors[0]?.message ?? 'unknown error'}`);
}
const groups = payload.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups;
if (!Array.isArray(groups)) throw new Error('Cloudflare analytics returned an unexpected response.');

const totals = groups.reduce(
  (current, group) => ({
    egressBytes: current.egressBytes + Number(group.sum?.egressBytes ?? 0),
    ingressBytes: current.ingressBytes + Number(group.sum?.ingressBytes ?? 0),
    peakConcurrentConnections: Math.max(
      current.peakConcurrentConnections,
      Number(group.avg?.concurrentConnectionsFiveMinutes ?? 0),
    ),
  }),
  { egressBytes: 0, ingressBytes: 0, peakConcurrentConnections: 0 },
);
const egressGb = totals.egressBytes / 1_000_000_000;
const ingressGb = totals.ingressBytes / 1_000_000_000;
const summary = [
  '## Cloudflare TURN usage',
  '',
  `- Date: ${date} UTC`,
  `- Egress: ${egressGb.toFixed(3)} GB`,
  `- Ingress: ${ingressGb.toFixed(3)} GB`,
  `- Peak five-minute average connections: ${Math.ceil(totals.peakConcurrentConnections)}`,
  `- Alert threshold: ${warningGb.toFixed(3)} GB/day`,
  '',
].join('\n');

process.stdout.write(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
}
if (egressGb > warningGb) {
  throw new Error(
    `TURN egress ${egressGb.toFixed(3)} GB exceeded the ${warningGb.toFixed(3)} GB daily threshold.`,
  );
}
