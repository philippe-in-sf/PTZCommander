import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export default function LoginPage() {
  const { needsSetup, login, bootstrap, loginPending, bootstrapPending } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const pending = loginPending || bootstrapPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (needsSetup) {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        await bootstrap({
          username,
          displayName,
          password,
        });
        toast.success("Admin account created");
        return;
      }

      await login({ username, password });
      toast.success("Signed in");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_36%),linear-gradient(180deg,_#f8fbff_0%,_#edf3fb_52%,_#dfe9f5_100%)] px-6 py-10 text-slate-950 dark:bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_34%),linear-gradient(180deg,_#07101b_0%,_#08121f_48%,_#050911_100%)] dark:text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-white/60 bg-white/80 p-8 shadow-[0_24px_90px_rgba(15,23,42,0.12)] backdrop-blur dark:border-white/10 dark:bg-slate-950/60 dark:shadow-[0_24px_90px_rgba(2,6,23,0.55)]">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-700 dark:text-cyan-300">
                Shared Control Surface
              </div>
              <div className="text-3xl font-bold tracking-tight">
                PTZ<span className="text-cyan-500">Command</span>
              </div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                v1.7.0
              </div>
            </div>
            <div className="mt-10 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">
                <Lock className="h-3.5 w-3.5" />
                {needsSetup ? "Initial admin setup" : "Multi-user access"}
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {needsSetup ? "Create the first admin station" : "Sign in to your control station"}
                </h1>
                <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {needsSetup
                    ? "This first account becomes the admin for your shared PTZCommand backend and can create operator or viewer accounts afterward."
                    : "Each station gets its own session while sharing the same device database, layouts, macros, and live state."}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200/70 bg-white/90 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="control-room" autoComplete="username" disabled={pending} />
              </div>

              {needsSetup && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Control Room Admin" autoComplete="name" disabled={pending} />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={needsSetup ? "new-password" : "current-password"} disabled={pending} />
              </div>

              {needsSetup && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" autoComplete="new-password" disabled={pending} />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={pending}>
                <Lock className="mr-2 h-4 w-4" />
                {needsSetup ? "Create admin account" : "Sign in"}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
