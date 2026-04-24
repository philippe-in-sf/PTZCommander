import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@shared/schema";
import { AppLayout } from "@/components/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { userAdminApi, type AppUser } from "@/lib/api";
import { toast } from "sonner";

const USER_ROLE_OPTIONS: UserRole[] = ["viewer", "operator", "admin"];

function UserRoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: UserRole;
  onChange: (value: UserRole) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value as UserRole)}
      disabled={disabled}
    >
      {USER_ROLE_OPTIONS.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  );
}

function UserRow({ user }: { user: AppUser }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [password, setPassword] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => userAdminApi.update(user.id, {
      displayName,
      role,
      isActive,
      password: password.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setPassword("");
      toast.success(`Updated ${user.displayName}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 xl:grid-cols-[1.1fr_0.7fr_0.8fr_0.7fr_auto]">
      <div className="space-y-2">
        <Label>Display name</Label>
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={updateMutation.isPending} />
        <p className="text-xs text-slate-500">@{user.username}</p>
      </div>

      <div className="space-y-2">
        <Label>Role</Label>
        <UserRoleSelect value={role} onChange={setRole} disabled={updateMutation.isPending} />
      </div>

      <div className="space-y-2">
        <Label>Password reset</Label>
        <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leave blank to keep" disabled={updateMutation.isPending} />
      </div>

      <div className="space-y-3">
        <Label>Status</Label>
        <div className="flex items-center gap-3 rounded-lg border border-slate-200/80 px-3 py-2 dark:border-slate-800">
          <Switch checked={isActive} onCheckedChange={setIsActive} disabled={updateMutation.isPending} />
          <span className="text-sm">{isActive ? "Active" : "Disabled"}</span>
        </div>
        <div className="text-xs text-slate-500">
          Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
        </div>
      </div>

      <div className="flex items-end">
        <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: userAdminApi.getAll,
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: () => userAdminApi.create({
      username,
      displayName,
      password,
      role,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("viewer");
      toast.success("User created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <AppLayout activePage="/users">
        <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-10">
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50/80 p-6 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
            Admin access is required to manage PTZ Command users.
          </div>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout activePage="/users">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
        <section className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Create viewer, operator, and admin accounts for each station.
            </p>
          </div>
          <Badge variant="secondary">{usersQuery.data?.length ?? 0} accounts</Badge>
        </section>

        <section className="grid gap-4 rounded-[1.75rem] border border-slate-200/80 bg-white/75 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/60 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="new-user-displayName">Display name</Label>
            <Input id="new-user-displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Control Room West" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-username">Username</Label>
            <Input id="new-user-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="west-operator" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-password">Password</Label>
            <Input id="new-user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-role">Role</Label>
            <div className="flex gap-3">
              <div className="flex-1">
                <UserRoleSelect value={role} onChange={setRole} disabled={createMutation.isPending} />
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                Add user
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Existing accounts</h2>
            <Button variant="outline" onClick={() => usersQuery.refetch()} disabled={usersQuery.isFetching}>
              Refresh
            </Button>
          </div>

          <div className="space-y-4">
            {(usersQuery.data || []).map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
            {!usersQuery.isLoading && (usersQuery.data?.length ?? 0) === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300/80 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
                No users found.
              </div>
            )}
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
