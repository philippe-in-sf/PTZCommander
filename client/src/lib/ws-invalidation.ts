import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./websocket";

export function useWsInvalidation() {
  const ws = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (message: any) => {
      switch (message.type) {
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
