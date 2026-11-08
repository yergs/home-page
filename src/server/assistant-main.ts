/**
 * Imperative shell of the assistant service: its own HTTPS server on localhost,
 * separate from the main server so restarting that one never stops the agent.
 * Wires real I/O into the core in assistant.ts and assistant-routes.ts.
 */
import { Effect } from "effect";
import { AssistantIo, makeAssistant } from "./assistant.ts";
import { assistantIoLive } from "./assistant-live.ts";
import { AssistantService, handleAssistant } from "./assistant-routes.ts";
import { config } from "./config.ts";
import { type HttpRequest, type HttpResponse, IoError, ServerIo } from "./http.ts";
import { makeEventLog } from "./event-log.ts";
import { makeRuns, WidgetAgentIo, WidgetAgentRuns } from "./widget-agents.ts";
import { widgetAgentIoLive } from "./widget-agents-live.ts";

/** Most events kept for clients that reconnect. */
const keptEvents = 2000;

const attempt = <A>(fn: () => Promise<A>) =>
  Effect.tryPromise({ try: fn, catch: (cause) => new IoError({ cause }) });

// The layout pipes, as the main server's, but with the service's own temp file.
const serverIo = ServerIo.of({
  readLayoutFile: attempt(() => Deno.readTextFile(config.layoutFile)),
  writeLayoutTempFile: (text) =>
    attempt(() => Deno.writeTextFile(config.assistant.layoutTempFile, text)),
  commitLayoutTempFile: attempt(() =>
    Deno.rename(config.assistant.layoutTempFile, config.layoutFile)
  ),
  readWidgetFile: () =>
    Effect.fail(new IoError({ cause: "The assistant service serves no widgets" })),
  httpGet: () => Effect.fail(new IoError({ cause: "The assistant service reads no feeds" })),
  geocodeBatch: () => Effect.fail(new IoError({ cause: "The assistant service doesn't geocode" })),
  geocodeOneLine: () =>
    Effect.fail(new IoError({ cause: "The assistant service doesn't geocode" })),
  geocodeNominatim: () =>
    Effect.fail(new IoError({ cause: "The assistant service doesn't geocode" })),
});

const toHttpRequest = (request: Request): HttpRequest => ({
  method: request.method,
  url: new URL(request.url),
  origin: request.headers.get("origin"),
  body: attempt(() => request.text()),
});

const toResponse = (response: HttpResponse): Response =>
  new Response(response.body, { status: response.status, headers: response.headers });

const assistant = await Effect.runPromise(
  Effect.flatMap(
    makeEventLog(crypto.randomUUID(), keptEvents),
    (log) =>
      makeAssistant(config.assistant, log, {
        // Run by launchd (installed by setup), which restarts the services; else by hand.
        supervised: Deno.env.get("XPC_SERVICE_NAME") === config.assistant.label,
        pollMs: 1000,
        attempts: 120,
      }),
  ).pipe(
    Effect.provideService(ServerIo, serverIo),
    Effect.provideService(
      AssistantIo,
      assistantIoLive({
        ...config.assistant,
        appJob: `gui/${Deno.uid() ?? 0}/${config.assistant.appLabel}`,
      }),
    ),
  ),
);

const repoDir = config.repoRoot.replace(/\/$/, "");

// Widget agents' runs: kept in memory, each in a folder of its own under data/.
const widgetAgentRuns = await Effect.runPromise(
  makeRuns({ repoDir, widgetsSourceDir: config.widgetsSourceDir, denoPath: Deno.execPath() }).pipe(
    Effect.provideService(
      WidgetAgentIo,
      widgetAgentIoLive({
        registryFile: config.assistant.registryFile,
        runsDir: `${config.dataDir}/widget-agent-runs`,
        home: Deno.env.get("HOME") ?? "",
        repoDir,
      }),
    ),
  ),
);

Deno.serve(
  {
    hostname: config.hostname,
    port: config.assistant.port,
    cert: await Deno.readTextFile(config.certFile),
    key: await Deno.readTextFile(config.keyFile),
    onListen: () => console.log(`Assistant service on https://localhost:${config.assistant.port}`),
  },
  (request) =>
    Effect.runPromise(
      handleAssistant(toHttpRequest(request), {
        hosts: config.assistant.hosts,
        appOrigins: config.appOrigins,
      }).pipe(
        Effect.provideService(AssistantService, assistant),
        Effect.provideService(WidgetAgentRuns, widgetAgentRuns),
        Effect.map(toResponse),
      ),
    ),
);
