import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

export function startTelemetry(
  otlpEndpoint: string | undefined,
): NodeSDK | undefined {
  if (otlpEndpoint === undefined) return undefined;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "resilient-rpc-gateway",
      [ATTR_SERVICE_VERSION]: "0.1.0",
    }),
    traceExporter: new OTLPTraceExporter({ url: otlpEndpoint }),
  });
  sdk.start();
  return sdk;
}
