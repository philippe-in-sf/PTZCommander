import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LiveAppState } from "@shared/live-state";
import { useWebSocket, type WsMessageInbound } from "./websocket";

async function readLiveState(): Promise<LiveAppState> {
  const res = await fetch("/api/live-state", { credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Failed to load live state");
  return data;
}

async function patchLiveState(patch: Partial<LiveAppState>): Promise<LiveAppState> {
  const res = await fetch("/api/live-state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || "Failed to update live state");
  return data;
}

export function useLiveState() {
  const queryClient = useQueryClient();
  const ws = useWebSocket();

  const query = useQuery({
    queryKey: ["live-state"],
    queryFn: readLiveState,
  });

  useEffect(() => {
    const handler = (message: WsMessageInbound) => {
      if (message.type === "live_state" && message.state && typeof message.state === "object") {
        queryClient.setQueryData(["live-state"], message.state as LiveAppState);
      }
    };
    ws.addMessageHandler(handler);
    return () => ws.removeMessageHandler(handler);
  }, [queryClient, ws]);

  const mutation = useMutation({
    mutationFn: patchLiveState,
    onSuccess: (state) => queryClient.setQueryData(["live-state"], state),
  });

  return {
    state: query.data,
    patch: mutation.mutate,
    patchAsync: mutation.mutateAsync,
    pending: mutation.isPending,
  };
}
