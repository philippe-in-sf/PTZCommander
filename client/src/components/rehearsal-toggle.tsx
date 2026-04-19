import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rehearsalApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export function RehearsalToggle({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["rehearsal"],
    queryFn: rehearsalApi.get,
  });
  const enabled = data?.enabled ?? false;

  const mutation = useMutation({
    mutationFn: (next: boolean) => rehearsalApi.set(next),
    onSuccess: (mode) => {
      queryClient.setQueryData(["rehearsal"], mode);
      queryClient.invalidateQueries({ queryKey: ["rehearsal"] });
      toast({
        title: mode.enabled ? "Rehearsal mode on" : "Live mode on",
        description: mode.enabled
          ? "ATEM, OBS, and X32 writes are suppressed. VISCA camera moves still run."
          : "Live output controls are active again.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Rehearsal mode failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <button
      type="button"
      onClick={() => mutation.mutate(!enabled)}
      disabled={mutation.isPending}
      className={cn(
        "h-8 rounded-md border px-2.5 text-xs font-bold uppercase tracking-normal transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        enabled
          ? "border-red-300 bg-red-600 text-white shadow-[0_0_14px_rgba(220,38,38,0.35)] hover:bg-red-500"
          : "border-border bg-background/60 text-muted-foreground hover:border-red-500/70 hover:text-red-500",
        className
      )}
      aria-pressed={enabled}
      data-testid="button-rehearsal-toggle"
    >
      {enabled ? "Rehearsal" : "Live"}
    </button>
  );
}
