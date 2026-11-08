import { assertEquals, assertStringIncludes } from "@std/assert";
import { Effect, Fiber, Option, Queue, Stream } from "effect";
import type { Answer, ChatEvent, SendMessage } from "../common/assistant.ts";
import { defaultLayout, emptyLayout, type Layout, newColumn } from "../common/model.ts";
import { type AgentSettings, conflictPrompt, invalidLayoutPrompt } from "./assistant-agent.ts";
import {
  type Assistant,
  AssistantIo,
  type Image,
  makeAssistant,
  requestDetail,
  sessionSummaries,
  type ToolDecision,
  toolDecision,
  type ToolRequest,
} from "./assistant.ts";
import { makeEventLog } from "./event-log.ts";
import { IoError, ServerIo } from "./http.ts";
import { layoutText } from "./layout-store.ts";
import type { CheckOutcome } from "./widget-checks.ts";

const settings: AgentSettings = { repoDir: "/repo", workspaceDir: "/repo/data/assistant" };

const withColumn = (id: string): Layout => ({ ...emptyLayout, columns: [newColumn(id, "LuStar")] });

const init = (sessionId: string) => ({ type: "system", subtype: "init", session_id: sessionId });
const say = (text: string) => ({
  type: "assistant",
  parent_tool_use_id: null,
  message: { content: [{ type: "text", text }] },
});
const result = (costUsd: number) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "",
  total_cost_usd: costUsd,
});
const failure = (message: string) => ({
  type: "result",
  subtype: "error_during_execution",
  is_error: true,
  result: message,
});

/**
 * One step of a scripted agent run: a message it emits, an edit to its layout copy,
 * the user editing the live layout meanwhile, or a tool request it waits on.
 */
type Step =
  | { msg: unknown }
  | { edit: string }
  | { live: string }
  | { ask: ToolRequest }
  /** The agent changes a file in the repo. */
  | { code: string }
  /** The agent's process goes away. */
  | { end: true };

/**
 * Each run's steps play when the core sends a message. Steps after a run's result play
 * on, as what the agent does on its own (e.g. when a background task finishes).
 */
type Run = ReadonlyArray<Step>;

const harness = (options: {
  stored: string | null;
  runs: ReadonlyArray<Run>;
  layoutChecks?: ReadonlyArray<CheckOutcome>;
  startFails?: boolean;
  sessions?: ReadonlyArray<unknown>;
  transcript?: ReadonlyArray<unknown>;
  supervised?: boolean;
  /** Whether the main server answers, each time it's asked; it does once these run out. */
  listening?: ReadonlyArray<boolean>;
  restartFails?: boolean;
}) => {
  const files = {
    stored: options.stored,
    workspace: "",
    temp: "",
    screenshot: null as Uint8Array | null,
  };
  const prompts: Array<string> = [];
  const sentImages: Array<number> = [];
  const sessions: Array<string | null> = [];
  const models: Array<string | null> = [];
  const modes: Array<string> = [];
  const decisions: Array<ToolDecision> = [];
  const layoutChecks = [...(options.layoutChecks ?? [])];
  let closed = 0;
  let runIndex = 0;
  const controls: Array<string> = [];
  // The repo's code, by path, which the agent's `code` steps change.
  const repo = new Map([["src/server/routes.ts", "v1"]]);
  const listening = [...(options.listening ?? [false])];

  const assistantIo = AssistantIo.of({
    readWorkspaceLayout: Effect.sync(() => files.workspace),
    writeWorkspaceLayout: (text) => Effect.sync(() => void (files.workspace = text)),
    writeWorkspaceScreenshot: (jpeg) => Effect.sync(() => void (files.screenshot = jpeg)),
    removeWorkspaceScreenshot: Effect.sync(() => void (files.screenshot = null)),
    readRegistry: Effect.fail(new IoError({ cause: "no registry" })),
    checkWorkspaceLayout: Effect.sync(() => layoutChecks.shift() ?? { ok: true }),
    fingerprint: Effect.sync(() => new Map(repo)),
    moduleGraphs: Effect.succeed({
      app: new Set(["src/server/routes.ts"]),
      page: new Set(["src/client/app.tsx"]),
      assistant: new Set(["src/server/assistant.ts"]),
    }),
    restartApp: options.restartFails
      ? Effect.fail(new IoError({ cause: "launchctl failed" }))
      : Effect.sync(() => void controls.push("restart app")),
    appListening: Effect.sync(() => listening.shift() ?? true),
    exitForRestart: Effect.sync(() => void controls.push("exit")),
    capabilities: Effect.succeed({
      commands: [{ name: "compact", description: "Compact", argumentHint: "" }],
      models: [{ value: "opus", displayName: "Opus", description: "" }],
    }),
    listSessions: Effect.succeed(options.sessions ?? []),
    readSessionMessages: (sessionId) =>
      sessionId === "known"
        ? Effect.succeed(options.transcript ?? [])
        : Effect.fail(new IoError({ cause: "no such session" })),
    startSession: ({ resume, model, mode, decide }) =>
      options.startFails ? Effect.fail(new IoError({ cause: "spawn failed" })) : Effect.gen(
        function* () {
          sessions.push(resume);
          models.push(model);
          modes.push(mode);
          yield* Effect.addFinalizer(() => Effect.sync(() => closed++));
          // What the agent will do next; it waits (like a real session) when there's nothing.
          const steps = yield* Queue.unbounded<Step>();
          return {
            send: (text: string, images: ReadonlyArray<Image>) =>
              Effect.suspend(() => {
                prompts.push(text);
                sentImages.push(images.length);
                return Queue.offerAll(steps, options.runs[runIndex++] ?? []);
              }),
            setModel: (chosen: string | null) =>
              Effect.sync(() => void controls.push(`model ${chosen}`)),
            contextUsage: Effect.succeed({ percent: 12, model: "claude-test" }),
            next: Effect.gen(function* () {
              while (true) {
                const step = yield* Queue.take(steps);
                if ("msg" in step) return Option.some(step.msg);
                if ("end" in step) return Option.none();
                if ("edit" in step) files.workspace = step.edit;
                if ("live" in step) files.stored = step.live;
                if ("code" in step) repo.set(step.code, `${repo.get(step.code) ?? ""}+`);
                if ("ask" in step) decisions.push(yield* decide(step.ask));
              }
            }),
            interrupt: Effect.sync(() => void controls.push("interrupt")),
            setMode: (mode: string) => Effect.sync(() => void controls.push(`mode ${mode}`)),
          };
        },
      ),
  });

  const serverIo = ServerIo.of({
    readLayoutFile: Effect.suspend(() =>
      files.stored === null
        ? Effect.fail(new IoError({ cause: new Deno.errors.NotFound() }))
        : Effect.succeed(files.stored)
    ),
    writeLayoutTempFile: (text) => Effect.sync(() => void (files.temp = text)),
    commitLayoutTempFile: Effect.sync(() => void (files.stored = files.temp)),
    readWidgetFile: () => Effect.die("unused"),
    httpGet: () => Effect.die("unused"),
    geocodeBatch: () => Effect.die("unused"),
    geocodeOneLine: () => Effect.die("unused"),
    geocodeNominatim: () => Effect.die("unused"),
  });

  /** A fresh assistant over these pipes. */
  const assistant = Effect.gen(function* () {
    const log = yield* makeEventLog("log1", 100);
    const assistant = yield* makeAssistant(settings, log, {
      supervised: options.supervised ?? true,
      pollMs: 1,
      attempts: 5,
    });
    return assistant;
  }).pipe(
    Effect.provideService(AssistantIo, assistantIo),
    Effect.provideService(ServerIo, serverIo),
  );

  return {
    files,
    prompts,
    sentImages,
    sessions,
    models,
    modes,
    decisions,
    controls,
    assistant,
    closed: () => closed,
  };
};

const message = (text: string, more: Partial<SendMessage> = {}): SendMessage => ({
  message: text,
  sessionId: null,
  screenshot: null,
  images: [],
  ...more,
});

/**
 * Sends a message and collects the turn's events until it's done, answering any
 * request with `answer`.
 */
const turn = (
  assistant: Assistant,
  request: SendMessage,
  answer: (event: ChatEvent) => Answer | null = () => null,
) =>
  Effect.gen(function* () {
    const sent = yield* assistant.send(request);
    if (!sent.ok) return null;
    const events = yield* (assistant.events(sent.log, sent.after) ?? Stream.empty).pipe(
      Stream.tap(({ event }) => {
        const given = event.is === "permission" || event.is === "question" ? answer(event) : null;
        return given === null || !("requestId" in event)
          ? Effect.void
          : assistant.answer(event.requestId, given);
      }),
      Stream.takeUntil(({ event }) => event.is === "done"),
      Stream.runCollect,
    );
    return [...events].map((e) => e.event).filter((e) => e.is !== "usage");
  });

/** The events, with the done event's timing left out. */
const withoutTiming = (events: ReadonlyArray<ChatEvent> | null) =>
  events?.map((e) => e.is === "done" ? { ...e, durationMs: 0 } : e) ?? null;

Deno.test("a turn relays what the agent says and ends with its cost", async () => {
  const h = harness({
    stored: null,
    runs: [[{ msg: init("s1") }, { msg: say("Nothing to change.") }, { msg: result(0.25) }]],
  });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Hi"))),
  );
  assertEquals(withoutTiming(events), [
    { is: "session", sessionId: "s1" },
    { is: "text", text: "Nothing to change." },
    { is: "done", costUsd: 0.25, durationMs: 0 },
  ]);
  // The workspace starts as the live layout (here the default, as none is saved).
  assertEquals(h.files.workspace, layoutText(defaultLayout));
  assertEquals(h.prompts, ["Hi"]);
});

Deno.test("an edited, valid layout is applied", async () => {
  const edited = withColumn("c1");
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [[{ msg: init("s1") }, { edit: layoutText(edited) }, { msg: result(0.1) }]],
  });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Add"))),
  );
  assertEquals(events?.find((e) => e.is === "applied"), { is: "applied", layout: edited });
  assertEquals(h.files.stored, layoutText(edited));
});

Deno.test("an invalid layout is explained to the agent, which tries again", async () => {
  const edited = withColumn("c1");
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [
      [{ msg: init("s1") }, { edit: "{ not json" }, { msg: result(0.1) }],
      [{ edit: layoutText(edited) }, { msg: result(0.3) }],
    ],
  });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Add"))),
  );
  assertEquals(events?.map((e) => e.is), ["session", "rejected", "applied", "done"]);
  assertEquals(h.prompts.length, 2);
  assertStringIncludes(h.prompts[1] ?? "", invalidLayoutPrompt(settings, "").slice(0, 40));
  // The retry's cost is added to the first run's.
  assertEquals(withoutTiming(events)?.at(-1), {
    is: "done",
    costUsd: 0.1 + (0.3 - 0.1),
    durationMs: 0,
  });
});

Deno.test("a widget config that fails its manifest's check is rejected too", async () => {
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [
      [{ edit: layoutText(withColumn("c1")) }, { msg: result(0) }],
      [{ msg: result(0) }],
    ],
    layoutChecks: [{ ok: false, diagnostic: "clock: zone must be a string" }],
  });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Add"))),
  );
  assertEquals(events?.find((e) => e.is === "rejected"), {
    is: "rejected",
    message: "clock: zone must be a string",
  });
  assertEquals(events?.find((e) => e.is === "applied")?.is, "applied");
});

Deno.test("when the live layout changed meanwhile, the agent redoes its work on top of it", async () => {
  const live = withColumn("live");
  const redone = { ...live, columns: [...live.columns, newColumn("c2", "LuStar")] };
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [
      [{ edit: layoutText(withColumn("c1")) }, { live: layoutText(live) }, { msg: result(0) }],
      [{ edit: layoutText(redone) }, { msg: result(0) }],
    ],
  });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Add"))),
  );
  assertEquals(events?.map((e) => e.is), ["rejected", "applied", "done"]);
  assertEquals(h.prompts[1], conflictPrompt(settings));
  assertEquals(h.files.stored, layoutText(redone));
});

Deno.test("a layout rejected too many times isn't applied", async () => {
  const bad: Run = [{ edit: "{" }, { msg: result(0) }];
  const h = harness({ stored: layoutText(emptyLayout), runs: [bad, bad, bad] });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Add"))),
  );
  assertEquals(events?.map((e) => e.is), ["rejected", "rejected", "error", "done"]);
  assertEquals(h.files.stored, layoutText(emptyLayout));
});

Deno.test("an agent run that fails ends the turn with its message", async () => {
  const h = harness({ stored: null, runs: [[{ msg: failure("Boom") }]] });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Hi"))),
  );
  assertEquals(events?.map((e) => e.is), ["error", "done"]);
  assertEquals(events?.at(0), { is: "error", message: "Boom" });
});

Deno.test("a session that ends unexpectedly is closed, and the next message opens another", async () => {
  const h = harness({
    stored: null,
    runs: [[{ msg: init("s1") }, { end: true }], [{ msg: result(0) }]],
  });
  const events = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const first = yield* turn(a, message("Hi"));
    yield* turn(a, message("Again", { sessionId: "s1" }));
    return first;
  }));
  assertEquals(events?.at(1), {
    is: "error",
    message: "The assistant's session ended unexpectedly.",
  });
  assertEquals(h.sessions, [null, "s1"]);
  assertEquals(h.closed(), 1);
});

Deno.test("a conversation's session stays open between its turns", async () => {
  const h = harness({
    stored: null,
    runs: [[{ msg: init("s1") }, { msg: result(0) }], [{ msg: init("s1") }, { msg: result(0) }], [{
      msg: result(0),
    }]],
  });
  await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    yield* turn(a, message("One"));
    yield* turn(a, message("Two", { sessionId: "s1" }));
    // Another conversation closes this one's session and resumes (or starts) its own.
    yield* turn(a, message("Three", { sessionId: "s9" }));
  }));
  assertEquals(h.sessions, [null, "s9"]);
  assertEquals(h.closed(), 1);
  assertStringIncludes(h.prompts[1] ?? "", "was refreshed from the live page");
});

Deno.test("a screenshot is put in the workspace, and an old one removed when there's none", async () => {
  const h = harness({ stored: null, runs: [[{ msg: result(0) }], [{ msg: result(0) }]] });
  await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    yield* turn(a, message("Look", { screenshot: new Uint8Array([1, 2]) }));
    assertEquals(h.files.screenshot, new Uint8Array([1, 2]));
    yield* turn(a, message("Again"));
  }));
  assertEquals(h.files.screenshot, null);
  assertStringIncludes(h.prompts[0] ?? "", "screenshot.jpg shows the page");
});

Deno.test("when the agent can't be started, the turn says why", async () => {
  const h = harness({ stored: null, runs: [], startFails: true });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Hi"))),
  );
  assertEquals(events?.map((e) => e.is), ["error", "done"]);
  assertEquals(events?.at(0), { is: "error", message: "spawn failed" });
});

Deno.test("a corrupt saved layout ends the turn with an error", async () => {
  const h = harness({ stored: "{ nope", runs: [] });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Hi"))),
  );
  assertEquals(events?.map((e) => e.is), ["error", "done"]);
  const error = events?.at(0);
  assertStringIncludes(error?.is === "error" ? error.message : "", "Stored layout is invalid");
});

const bash: ToolRequest = {
  toolName: "Bash",
  input: { command: "git commit -m x", description: "Commit" },
  description: "Commit",
  suggestions: [{ type: "addRules", rules: [{ toolName: "Bash" }] }],
};

Deno.test("a permission request waits for the user's answer, then is settled", async () => {
  for (
    const [choice, outcome] of [["allow", "allowed"], ["always", "allowed"], [
      "deny",
      "denied",
    ]] as const
  ) {
    const h = harness({ stored: null, runs: [[{ ask: bash }, { msg: result(0) }]] });
    const events = await Effect.runPromise(
      Effect.flatMap(
        h.assistant,
        (a) => turn(a, message("Commit"), () => ({ is: "permission", choice })),
      ),
    );
    assertEquals(events?.slice(0, 2), [
      {
        is: "permission",
        requestId: "r1",
        tool: "Bash",
        detail: "git commit -m x",
        canAlways: true,
      },
      { is: "settled", requestId: "r1", outcome },
    ]);
    assertEquals(h.decisions, [toolDecision(bash, { is: "permission", choice })]);
  }
});

Deno.test("only one turn runs at a time", async () => {
  const h = harness({ stored: null, runs: [[{ ask: bash }, { msg: result(0) }]] });
  const second = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const sent = yield* a.send(message("First"));
    // Wait until the first turn is waiting on its permission request.
    const events = sent.ok ? a.events(sent.log, sent.after) : null;
    const asked = yield* (events ?? Stream.empty).pipe(
      Stream.filter(({ event }) => event.is === "permission"),
      Stream.take(1),
      Stream.runHead,
    );
    const busy = yield* a.send(message("Second"));
    if (Option.isSome(asked) && asked.value.event.is === "permission") {
      yield* a.answer(asked.value.event.requestId, { is: "permission", choice: "deny" });
    }
    return busy;
  }));
  assertEquals(second, { ok: false });
});

Deno.test("answers must be to something waiting, and of the right kind", async () => {
  const h = harness({ stored: null, runs: [[{ ask: bash }, { msg: result(0) }]] });
  const replies = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const sent = yield* a.send(message("Commit"));
    const events = sent.ok ? a.events(sent.log, sent.after) : null;
    yield* (events ?? Stream.empty).pipe(
      Stream.filter(({ event }) => event.is === "permission"),
      Stream.take(1),
      Stream.runDrain,
    );
    return [
      yield* a.answer("r9", { is: "permission", choice: "allow" }),
      yield* a.answer("r1", { is: "question", answers: {} }),
      yield* a.answer("r1", { is: "permission", choice: "allow" }),
    ];
  }));
  assertEquals(replies, [false, false, true]);
});

Deno.test("the agent's questions wait for the user's choices", async () => {
  const questions = [{
    question: "Tea or coffee?",
    header: "Drink",
    multiSelect: false,
    options: [{ label: "Tea", description: "Hot leaves" }, {
      label: "Coffee",
      description: "Beans",
    }],
  }];
  const ask: ToolRequest = {
    toolName: "AskUserQuestion",
    input: { questions },
    description: null,
    suggestions: [],
  };
  const h = harness({ stored: null, runs: [[{ ask }, { msg: result(0) }]] });
  const events = await Effect.runPromise(
    Effect.flatMap(
      h.assistant,
      (a) =>
        turn(a, message("Ask"), () => ({ is: "question", answers: { "Tea or coffee?": "Tea" } })),
    ),
  );
  assertEquals(events?.slice(0, 2), [
    { is: "question", requestId: "r1", questions },
    { is: "settled", requestId: "r1", outcome: "answered" },
  ]);
  assertEquals(h.decisions, [{
    behavior: "allow",
    updatedInput: { questions, answers: { "Tea or coffee?": "Tea" } },
  }]);
});

Deno.test("questions the app can't show are declined without asking the user", async () => {
  const ask: ToolRequest = {
    toolName: "AskUserQuestion",
    input: { questions: "?" },
    description: null,
    suggestions: [],
  };
  const h = harness({ stored: null, runs: [[{ ask }, { msg: result(0) }]] });
  const events = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Ask"))),
  );
  assertEquals(events?.map((e) => e.is), ["done"]);
  assertEquals(h.decisions, [{
    behavior: "deny",
    message: "The app couldn't show these questions.",
  }]);
});

Deno.test("a permission request shows the command, file or URL, else the description", () => {
  const request = (input: Record<string, unknown>, description: string | null = null) => ({
    toolName: "X",
    input,
    description,
    suggestions: [],
  });
  assertEquals(requestDetail(request({ file_path: "/repo/a.ts", content: "..." })), "/repo/a.ts");
  assertEquals(requestDetail(request({ file_path: "/repo/src/a.ts" }), "/repo"), "src/a.ts");
  assertEquals(
    requestDetail(request({ file_path: "/elsewhere/a.ts" }), "/repo/"),
    "/elsewhere/a.ts",
  );
  assertEquals(requestDetail(request({ command: "/repo/x" }), "/repo"), "/repo/x");
  assertEquals(requestDetail(request({ url: "https://x.test" })), "https://x.test");
  assertEquals(requestDetail(request({ other: 1 }, "Does a thing")), "Does a thing");
  assertEquals(requestDetail(request({ other: 1 })), '{"other":1}');
  assertEquals(requestDetail(request({ command: "x".repeat(3000) })).length, 2001);
});

Deno.test('"always" passes Claude Code\'s suggested rules back; "deny" explains', () => {
  assertEquals(toolDecision(bash, { is: "permission", choice: "always" }), {
    behavior: "allow",
    updatedInput: bash.input,
    updatedPermissions: bash.suggestions,
  });
  assertEquals(toolDecision(bash, { is: "permission", choice: "deny" }), {
    behavior: "deny",
    message: "The user declined this.",
  });
});

Deno.test("streamed text, tool calls and their results, and mode changes are relayed", async () => {
  const h = harness({
    stored: null,
    runs: [[
      { msg: { type: "system", subtype: "init", session_id: "s1", permissionMode: "default" } },
      {
        msg: {
          type: "stream_event",
          parent_tool_use_id: null,
          event: { type: "content_block_delta", delta: { type: "text_delta", text: "Lo" } },
        },
      },
      {
        msg: {
          type: "assistant",
          parent_tool_use_id: null,
          message: {
            content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }],
          },
        },
      },
      {
        msg: {
          type: "user",
          parent_tool_use_id: null,
          message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "a.ts" }] },
        },
      },
      { msg: { type: "system", subtype: "status", permissionMode: "plan" } },
      { msg: result(0) },
    ]],
  });
  const logged = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    // Listen before sending: streamed text isn't kept for readers that come later.
    const reader = yield* (a.events("log1", 0) ?? Stream.empty).pipe(
      Stream.takeUntil(({ event }) => event.is === "done"),
      Stream.filter(({ event }) => event.is !== "usage"),
      Stream.runCollect,
      Effect.fork,
    );
    yield* Effect.sleep("10 millis");
    yield* a.send(message("Hi"));
    return yield* Fiber.join(reader);
  }));
  const events = [...logged];
  assertEquals(events.map((e) => [e.event.is, e.transient]), [
    ["session", false],
    ["mode", false],
    ["delta", true],
    ["tool", false],
    ["tool-result", false],
    ["mode", false],
    ["done", false],
  ]);
  assertEquals(events.at(4)?.event, {
    is: "tool-result",
    toolUseId: "t1",
    text: "a.ts",
    isError: false,
  });
});

Deno.test("a running turn can be stopped; with none running, there's nothing to stop", async () => {
  const h = harness({ stored: null, runs: [[{ ask: bash }, { msg: result(0) }]] });
  const stopped = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const idle = yield* a.interrupt;
    const sent = yield* a.send(message("Commit"));
    yield* ((sent.ok ? a.events(sent.log, sent.after) : null) ?? Stream.empty).pipe(
      Stream.filter(({ event }) => event.is === "permission"),
      Stream.take(1),
      Stream.runDrain,
    );
    const running = yield* a.interrupt;
    yield* a.answer("r1", { is: "permission", choice: "deny" });
    return [idle, running];
  }));
  assertEquals(stopped, [false, true]);
  assertEquals(h.controls, ["interrupt"]);
});

Deno.test("a mode chosen before a conversation's first message is the one it starts in", async () => {
  const h = harness({
    stored: null,
    runs: [[{ msg: init("s1") }, { msg: result(0) }], [{ msg: result(0) }]],
  });
  await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    yield* a.setMode("plan", null);
    yield* turn(a, message("Plan it"));
    // Its own open session changes right away.
    yield* a.setMode("acceptEdits", "s1");
    // A new conversation (the client reset) starts in default mode again.
    yield* turn(a, message("New"));
  }));
  assertEquals(h.modes, ["plan", "default"]);
  assertEquals(h.controls, ["mode acceptEdits"]);
});

Deno.test("a mode for a conversation other than the open one waits for its session", async () => {
  const h = harness({
    stored: null,
    runs: [[{ msg: init("s1") }, { msg: result(0) }], [{ msg: result(0) }]],
  });
  await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    yield* turn(a, message("Hi"));
    // The user started a new conversation on the page; s1 is still open here.
    yield* a.setMode("plan", null);
    yield* turn(a, message("Plan this"));
  }));
  assertEquals(h.controls, []);
  assertEquals(h.modes, ["default", "plan"]);
});

Deno.test("past sessions are listed newest first, titled, and replayed from their transcripts", async () => {
  const h = harness({
    stored: null,
    runs: [],
    sessions: [
      { sessionId: "a", summary: "Older", lastModified: 1 },
      { sessionId: "b", summary: "", firstPrompt: "Newer", lastModified: 2 },
      { nonsense: true },
    ],
    transcript: [
      { type: "user", parent_tool_use_id: null, message: { content: "[app note] x\n\nHello" } },
      {
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "text", text: "Hi!" }] },
      },
    ],
  });
  const [sessions, history] = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    return [yield* a.sessions, yield* a.history("known")] as const;
  }));
  assertEquals(sessions, [
    { sessionId: "b", title: "Newer", lastModified: 2 },
    { sessionId: "a", title: "Older", lastModified: 1 },
  ]);
  assertEquals(history, [{ is: "user", text: "Hello" }, { is: "text", text: "Hi!" }]);
  const missing = await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => Effect.flip(a.history("unknown"))),
  );
  assertEquals(String(missing.cause), "no such session");
});

Deno.test("a session's title is its custom title, else its summary, else its first prompt, clipped", () => {
  const titled = (info: Record<string, unknown>) =>
    sessionSummaries([{ sessionId: "s", lastModified: 0, ...info }]).at(0)?.title;
  assertEquals(titled({ customTitle: "Mine", summary: "Sum", firstPrompt: "First" }), "Mine");
  assertEquals(titled({ summary: "Sum", firstPrompt: "First" }), "Sum");
  assertEquals(titled({ firstPrompt: "First" }), "First");
  assertEquals(titled({}), "Untitled");
  assertEquals(titled({ summary: "x".repeat(100) })?.length, 81);
});

Deno.test("a plan to approve shows as the plan itself", () => {
  assertEquals(
    requestDetail({
      toolName: "ExitPlanMode",
      input: { plan: "1. Do it" },
      description: null,
      suggestions: [],
    }),
    "1. Do it",
  );
});

Deno.test("what the agent does on its own between messages is a turn of its own", async () => {
  const h = harness({
    stored: null,
    runs: [
      [
        { msg: init("s1") },
        { msg: say("Started it in the background.") },
        { msg: result(0.25) },
        // Later, the background task finishes, and the agent carries on by itself.
        { msg: say("The task finished.") },
        { msg: result(0.5) },
      ],
      [{ msg: init("s1") }, { msg: say("second") }, { msg: result(0.75) }],
    ],
  });
  const [own, next] = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    yield* turn(a, message("Run it in the background"));
    // The agent's own turn, logged after the first one's "done".
    const own = yield* (a.events("log1", 0) ?? Stream.empty).pipe(
      Stream.map((e) => e.event),
      Stream.filter((e) => e.is !== "usage"),
      Stream.dropWhile((e) => e.is !== "started"),
      Stream.takeUntil((e) => e.is === "done"),
      Stream.runCollect,
    );
    // The next message gets its own reply, not the agent's earlier one.
    const next = yield* turn(a, message("Say second", { sessionId: "s1" }));
    return [[...own], next] as const;
  }));
  assertEquals(withoutTiming(own), [
    { is: "started" },
    { is: "text", text: "The task finished." },
    { is: "done", costUsd: 0.25, durationMs: 0 },
  ]);
  assertEquals(withoutTiming(next), [
    { is: "session", sessionId: "s1" },
    { is: "text", text: "second" },
    { is: "done", costUsd: 0.25, durationMs: 0 },
  ]);
  // Only the user's two messages reached the agent; the same session served both.
  assertEquals(h.prompts.length, 2);
  assertEquals(h.sessions, [null]);
});

Deno.test("events are tagged with the conversation they're part of", async () => {
  const h = harness({
    stored: null,
    runs: [[{ msg: init("s1") }, { msg: say("Hi") }, { msg: result(0) }]],
  });
  const tags = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const sent = yield* a.send(message("Hi"));
    const state = yield* a.state;
    return [
      state.log,
      ...(yield* ((sent.ok ? a.events(sent.log, sent.after) : null) ?? Stream.empty).pipe(
        Stream.takeUntil(({ event }) => event.is === "done"),
        Stream.filter(({ event }) => event.is !== "usage"),
        Stream.map((e) => `${e.event.is}:${e.sessionId}`),
        Stream.runCollect,
      )),
    ];
  }));
  assertEquals(tags, ["log1", "session:s1", "text:s1", "done:s1"]);
});

/** A turn, then the events logged after it until `last` (what the turn's changes led to). */
const turnAndAfter = (
  h: ReturnType<typeof harness>,
  request: SendMessage,
  last: (event: ChatEvent) => boolean,
) =>
  Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const sent = yield* a.send(request);
    const events = yield* ((sent.ok ? a.events(sent.log, sent.after) : null) ?? Stream.empty).pipe(
      Stream.map((e) => e.event),
      Stream.filter((e) => e.is !== "usage"),
      Stream.dropWhile((e) => e.is !== "done"),
      Stream.drop(1),
      Stream.takeUntil(last),
      Stream.runCollect,
    );
    return { a, events: [...events] };
  }));

const isNotice = (tone: string) => (e: ChatEvent) => e.is === "notice" && e.tone === tone;

const noticeText = (e: ChatEvent | undefined) => e?.is === "notice" ? e.text : "";

Deno.test("a turn that changes server code restarts the main server, and says when it's back", async () => {
  const h = harness({
    stored: null,
    runs: [[{ code: "src/server/routes.ts" }, { msg: result(0) }]],
    // Still up for a moment, then down while it restarts, then back.
    listening: [true, false, false, true],
  });
  const { events } = await turnAndAfter(h, message("Fix the bug"), isNotice("success"));
  assertEquals(events.map((e) => e.is === "notice" ? e.tone : e.is), ["info", "success"]);
  assertEquals(h.controls, ["restart app"]);
});

Deno.test("a turn that changes the page's code restarts the main server, then offers a reload", async () => {
  const h = harness({ stored: null, runs: [[{ code: "src/client/app.tsx" }, { msg: result(0) }]] });
  const { events } = await turnAndAfter(h, message("Tweak"), (e) => e.is === "reload");
  assertEquals(events.map((e) => e.is), ["notice", "notice", "reload"]);
  assertEquals(h.controls, ["restart app"]);
});

Deno.test("a turn that changes only widget code offers a reload, without a restart", async () => {
  const h = harness({
    stored: null,
    runs: [[{ code: "src/client/widgets/clock/main.tsx" }, { msg: result(0) }]],
  });
  const { events } = await turnAndAfter(h, message("Tweak"), (e) => e.is === "reload");
  assertEquals(events.map((e) => e.is), ["reload"]);
  assertEquals(h.controls, []);
});

Deno.test("a turn that changes the assistant service restarts it, taking no new turn meanwhile", async () => {
  const h = harness({
    stored: null,
    runs: [[{ code: "src/server/assistant.ts" }, { msg: result(0) }]],
  });
  const { a, events } = await turnAndAfter(h, message("Improve yourself"), isNotice("info"));
  assertStringIncludes(noticeText(events.at(-1)), "assistant service");
  // Its exit follows the notice.
  await Effect.runPromise(Effect.sleep(5));
  assertEquals(h.controls, ["exit"]);
  assertEquals(await Effect.runPromise(a.send(message("Next"))), { ok: false });
});

Deno.test("unsupervised (run by hand), the user is told what to restart", async () => {
  const h = harness({
    stored: null,
    supervised: false,
    runs: [[{ code: "src/server/routes.ts" }, { code: "src/server/assistant.ts" }, {
      msg: result(0),
    }]],
  });
  const seen: Array<string> = [];
  await turnAndAfter(h, message("Change both"), (e) => {
    if (e.is === "notice") seen.push(e.text);
    return seen.length === 2;
  });
  assertStringIncludes(seen[0] ?? "", "deno task restart-service app");
  assertStringIncludes(seen[1] ?? "", "deno task restart-service assistant");
  assertEquals(h.controls, []);
});

Deno.test("a main server that doesn't come back, or can't be restarted, is reported", async () => {
  const stuck = harness({
    stored: null,
    runs: [[{ code: "src/server/routes.ts" }, { msg: result(0) }]],
    listening: [false, false, false, false, false, false, false],
  });
  const gone = await turnAndAfter(stuck, message("Fix"), isNotice("error"));
  assertStringIncludes(
    noticeText(gone.events.at(-1)),
    "logs/server.log",
  );
  const failing = harness({
    stored: null,
    runs: [[{ code: "src/server/routes.ts" }, { msg: result(0) }]],
    restartFails: true,
  });
  const refused = await turnAndAfter(failing, message("Fix"), isNotice("error"));
  assertStringIncludes(
    noticeText(refused.events.at(-1)),
    "launchctl failed",
  );
});

Deno.test("a turn that changes no code restarts nothing", async () => {
  const h = harness({ stored: null, runs: [[{ msg: result(0) }], [{ msg: result(0) }]] });
  await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    yield* turn(a, message("Hi"));
    yield* turn(a, message("Again"));
  }));
  assertEquals(h.controls, []);
});

Deno.test("the agent's own turns put their code changes into effect too", async () => {
  const h = harness({
    stored: null,
    runs: [[
      { msg: init("s1") },
      { msg: result(0) },
      { msg: say("The build finished; fixing the widget.") },
      { code: "src/client/widgets/clock/main.tsx" },
      { msg: result(0) },
    ]],
  });
  const events = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    yield* turn(a, message("Build it in the background"));
    return [
      ...(yield* (a.events("log1", 0) ?? Stream.empty).pipe(
        Stream.map((e) => e.event.is),
        Stream.filter((is) => is !== "usage"),
        Stream.dropWhile((is) => is !== "started"),
        Stream.takeUntil((is) => is === "reload"),
        Stream.runCollect,
      )),
    ];
  }));
  assertEquals(events, ["started", "text", "done", "reload"]);
});

Deno.test("a turn's cost is its share of the session's running total", async () => {
  const h = harness({
    stored: null,
    runs: [[{ msg: init("s1") }, { msg: result(0.25) }], [{ msg: result(0.75) }]],
  });
  const costs = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const first = yield* turn(a, message("One"));
    const second = yield* turn(a, message("Two", { sessionId: "s1" }));
    return [first?.at(-1), second?.at(-1)].map((e) => e?.is === "done" ? e.costUsd : "?");
  }));
  assertEquals(costs, [0.25, 0.5]);
});

Deno.test("a resumed session's first turn has no cost of its own (the total includes earlier ones)", async () => {
  const h = harness({ stored: null, runs: [[{ msg: result(3) }], [{ msg: result(3.5) }]] });
  const costs = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const first = yield* turn(a, message("Again", { sessionId: "old" }));
    const second = yield* turn(a, message("More", { sessionId: "old" }));
    return [first?.at(-1), second?.at(-1)].map((e) => e?.is === "done" ? e.costUsd : "?");
  }));
  assertEquals(costs, [null, 0.5]);
});

Deno.test("each result reports the conversation's usage: its total cost, context and model", async () => {
  const h = harness({ stored: null, runs: [[{ msg: init("s1") }, { msg: result(0.4) }]] });
  const usage = await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    const sent = yield* a.send(message("Hi"));
    return yield* ((sent.ok ? a.events(sent.log, sent.after) : null) ?? Stream.empty).pipe(
      Stream.map((e) => e.event),
      Stream.filter((e) => e.is === "usage"),
      Stream.runHead,
    );
  }));
  assertEquals(Option.getOrNull(usage), {
    is: "usage",
    costUsd: 0.4,
    contextPercent: 12,
    model: "claude-test",
  });
});

Deno.test("the chosen model applies to the open session and to the ones after it", async () => {
  const h = harness({
    stored: null,
    runs: [[{ msg: init("s1") }, { msg: result(0) }], [{ msg: result(0) }]],
  });
  await Effect.runPromise(Effect.gen(function* () {
    const a = yield* h.assistant;
    // With no session open, it's kept for the next.
    yield* a.setModel("opus");
    yield* turn(a, message("Hi"));
    yield* a.setModel(null);
    yield* turn(a, message("New"));
  }));
  assertEquals(h.models, ["opus", null]);
  assertEquals(h.controls, ["model null"]);
});

Deno.test("images go with the user's message, not with the app's retries", async () => {
  const h = harness({
    stored: layoutText(emptyLayout),
    runs: [
      [{ edit: "{ bad" }, { msg: result(0) }],
      [{ edit: layoutText(withColumn("c1")) }, { msg: result(0) }],
    ],
  });
  const image = { mediaType: "image/png" as const, data: new Uint8Array([1]) };
  await Effect.runPromise(
    Effect.flatMap(h.assistant, (a) => turn(a, message("Like this", { images: [image, image] }))),
  );
  assertEquals(h.sentImages, [2, 0]);
});

Deno.test("capabilities are Claude Code's, as it lists them", async () => {
  const h = harness({ stored: null, runs: [] });
  const capabilities = await Effect.runPromise(Effect.flatMap(h.assistant, (a) => a.capabilities));
  assertEquals(capabilities.commands.map((c) => c.name), ["compact"]);
  assertEquals(capabilities.models.map((m) => m.value), ["opus"]);
});

Deno.test("a plan is approved, approved with edits accepted, or sent back for more planning", () => {
  const plan: ToolRequest = {
    toolName: "ExitPlanMode",
    input: { plan: "1. Do it" },
    description: null,
    suggestions: [],
  };
  assertEquals(toolDecision(plan, { is: "permission", choice: "accept-edits" }), {
    behavior: "allow",
    updatedInput: plan.input,
    updatedPermissions: [{ type: "setMode", mode: "acceptEdits", destination: "session" }],
  });
  assertEquals(toolDecision(plan, { is: "permission", choice: "deny" }), {
    behavior: "deny",
    message: "The user wants to keep planning: ask what to change, or revise the plan.",
  });
  assertEquals(requestDetail({ ...plan, input: { plan: "x".repeat(5000) } }).length, 5000);
});
