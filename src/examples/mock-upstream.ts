import { createServer } from "node:http";

const port = Number(process.env.MOCK_PORT ?? "9001");
const delayMs = Number(process.env.MOCK_DELAY_MS ?? "20");
const failureEvery = Number(process.env.MOCK_FAILURE_EVERY ?? "0");
const name = process.env.MOCK_NAME ?? `mock-${String(port)}`;
let requests = 0;

const server = createServer((request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }

  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    requests += 1;
    setTimeout(() => {
      if (failureEvery > 0 && requests % failureEvery === 0) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ error: "injected failure", upstream: name }),
        );
        return;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
          string,
          unknown
        >;
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid JSON" }));
        return;
      }

      const result =
        payload.method === "getHealth"
          ? { status: "healthy", latestLedger: 1_000_000 }
          : { upstream: name, method: payload.method, requestNumber: requests };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ jsonrpc: "2.0", id: payload.id ?? null, result }),
      );
    }, delayMs);
  });
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`${name} listening on ${String(port)}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
