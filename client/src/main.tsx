import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { supabase } from "@/lib/supabase";
import "./index.css";
import "./redesign.css";
import "./frontend-replacement.css";
import "./accountant-replacement.css";
import "./driver-replacement.css";
import "./mechanic-replacement.css";
import "./team-replacement.css";
import "./notification-replacement.css";
import "./executive-replacement.css";
import "./fallback-replacement.css";
import "./procurement-replacement.css";
import "./billing-replacement.css";
import "./compliance-replacement.css";
import "./fleet-manager-overview-replacement.css";
import "./public-replacement.css";
import "./public-auth-replacement.css";

const queryClient = new QueryClient();
const API_TIMEOUT_MS = 15_000;
const RELEASE_TAG = "rbac-8d1aced2";

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
      },
      async fetch(input, init) {
        const request = async (accessToken?: string) => {
          const headers = new Headers(init?.headers);
          if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
          try {
            return await globalThis.fetch(input, { ...(init ?? {}), headers, credentials: "include", signal: controller.signal });
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
              throw new Error(`FleetOps API request timed out after ${API_TIMEOUT_MS / 1000} seconds. Release ${RELEASE_TAG}.`);
            }
            throw error;
          } finally {
            window.clearTimeout(timeout);
          }
        };
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          await supabase.auth.signOut({ scope: "local" });
          window.dispatchEvent(new CustomEvent("fleetops-session-expired"));
          throw new Error("FleetOps session expired. Please sign in again.");
        }
        let response = await request(data.session?.access_token);
        if (response.status === 401 && data.session) {
          const refreshed = await supabase.auth.refreshSession();
          if (refreshed.data.session?.access_token) {
            response = await request(refreshed.data.session.access_token);
          } else {
            await supabase.auth.signOut({ scope: "local" });
            window.dispatchEvent(new CustomEvent("fleetops-session-expired"));
          }
        }
        return response;
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
