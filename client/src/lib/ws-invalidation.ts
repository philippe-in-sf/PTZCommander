import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./websocket";

let knownVersion: string | null = null;

export function useWsInvalidation() {
  const ws = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (message: any) => {
      switch (message.type) {
        case "version":
          if (knownVersion === null) {
            knownVersion = message.version;
          } else if (message.version !== knownVersion) {
            console.log(`[Update] New version detected: ${message.version} (was ${knownVersion}). Reloading...`);
            window.location.reload();
          }
          break;
        case "invalidate":
          if (Array.isArray(message.keys)) {
            for (const key of message.keys) {
              queryClient.invalidateQueries({ queryKey: [key] });
            }
          }
          break;
        case "atem_state":
          queryClient.invalidateQueries({ queryKey: ["switcher-status"] });
          break;
        case "mixer_state":
          queryClient.invalidateQueries({ queryKey: ["mixer-status"] });
          break;
      }
    };

    ws.addMessageHandler(handler);
    return () => ws.removeMessageHandler(handler);
  }, [ws, queryClient]);
}
