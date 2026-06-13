import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SceneButton } from "@shared/schema";
import { resolveControlSurfaceSceneShortcut } from "@shared/control-surface-shortcuts";
import { sceneButtonApi } from "@/lib/api";

export function useControlSurfaceShortcuts() {
  const queryClient = useQueryClient();
  const pendingRef = useRef(false);
  const { data: sceneButtons = [] } = useQuery({
    queryKey: ["scene-buttons"],
    queryFn: sceneButtonApi.getAll,
    staleTime: 5000,
  });

  const { mutate: executeShortcutScene } = useMutation({
    mutationFn: async (sceneButton: SceneButton) => {
      const result = await sceneButtonApi.execute(sceneButton.id);
      return { result, sceneButton };
    },
    onSuccess: ({ sceneButton }) => {
      toast.success("Scene executed", { description: sceneButton.name });
      queryClient.invalidateQueries({ queryKey: ["scene-buttons"] });
    },
    onError: (error: Error) => {
      toast.error("Shortcut failed", { description: error.message });
    },
    onSettled: () => {
      pendingRef.current = false;
    },
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const resolution = resolveControlSurfaceSceneShortcut(event, sceneButtons);
      if (!resolution) return;

      event.preventDefault();
      event.stopPropagation();

      if (pendingRef.current) return;

      if (!resolution.sceneButton) {
        toast.error("No scene assigned", {
          description: `Scene button ${resolution.buttonNumber} is not configured`,
        });
        return;
      }

      pendingRef.current = true;
      executeShortcutScene(resolution.sceneButton);
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [executeShortcutScene, sceneButtons]);
}
