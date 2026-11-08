/** Browser entry point. */
import { ChakraProvider } from "@chakra-ui/react";
import { Either } from "effect";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";
import { loadWidgetRegistry } from "./api.ts";
import { run } from "./live.ts";
import { createManager } from "./mfe/manager-live.ts";
import { WidgetHostProvider } from "./widget-host.tsx";
import { registryResolver } from "./widget-resolver.ts";
import { makeSystem } from "./chakra-system.ts";
import { registerColumnBackground } from "./surface.ts";

const system = makeSystem();
registerColumnBackground();

// Follow the OS light/dark setting (Chakra keys dark tokens off this class).
const dark = matchMedia("(prefers-color-scheme: dark)");
const applyScheme = () => document.documentElement.classList.toggle("dark", dark.matches);
applyScheme();
dark.addEventListener("change", applyScheme);

// Widget MFEs are loaded on demand, from the bundles the registry lists.
const registry = run(loadWidgetRegistry).then(
  Either.mapLeft((e) => `Couldn't load the widget registry: ${e.message}`),
);
const manager = createManager({ resolver: registryResolver(registry) });

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <WidgetHostProvider manager={manager} registry={registry}>
        <App />
      </WidgetHostProvider>
    </ChakraProvider>
  </StrictMode>,
);
