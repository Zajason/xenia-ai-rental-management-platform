/**
 * OpenTelemetry bootstrap. Imported FIRST in main.ts (before Nest) so HTTP, pg,
 * ioredis, etc. are auto-instrumented. The correlation id this produces is what
 * lets a single booking webhook be followed across api → workers → ai-concierge
 * in Grafana Tempo.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

export function startTracing(): void {
  if (!endpoint) {
    // No collector configured (e.g. unit tests) — skip silently.
    return;
  }
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'xenia-api',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown());
}
