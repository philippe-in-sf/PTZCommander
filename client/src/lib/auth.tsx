import { createContext, startTransition, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { authApi, type AppUser, type AuthSessionResponse, type BootstrapStatus } from "./api";
import { getQueryFn } from "./queryClient";

type AuthContextValue = {
  user: AppUser | null;
  needsSetup: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  canOperate: boolean;
  login: (payload: { username: string; password: string }) => Promise<void>;
  bootstrap: (payload: { username: string; displayName: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  loginPending: boolean;
  bootstrapPending: boolean;
  logoutPending: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isOperator(user: AppUser | null) {
  return user?.role === "operator" || user?.role === "admin";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery<AuthSessionResponse | null>({
    queryKey: ["/api/auth/session"],
    queryFn: getQueryFn<AuthSessionResponse | null>({ on401: "returnNull" }),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const bootstrapStatusQuery = useQuery<BootstrapStatus>({
    queryKey: ["/api/auth/bootstrap-status"],
    queryFn: authApi.getBootstrapStatus,
  });

  const setSession = (session: AuthSessionResponse | null) => {
    startTransition(() => {
      queryClient.setQueryData(["/api/auth/session"], session);
    });
  };

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) => {
      setSession(session);
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: authApi.bootstrap,
    onSuccess: (session) => {
      setSession(session);
      queryClient.setQueryData(["/api/auth/bootstrap-status"], { needsSetup: false });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/session"], null);
      queryClient.setQueryData(["/api/auth/bootstrap-status"], { needsSetup: false });
    },
  });

  const user = sessionQuery.data?.user ?? null;
  const needsSetup = bootstrapStatusQuery.data?.needsSetup ?? false;

  const value: AuthContextValue = {
    user,
    needsSetup,
    isLoading: sessionQuery.isLoading || bootstrapStatusQuery.isLoading,
    isAdmin: user?.role === "admin",
    canOperate: isOperator(user),
    login: async (payload) => {
      await loginMutation.mutateAsync(payload);
    },
    bootstrap: async (payload) => {
      await bootstrapMutation.mutateAsync(payload);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    loginPending: loginMutation.isPending,
    bootstrapPending: bootstrapMutation.isPending,
    logoutPending: logoutMutation.isPending,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
