import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { User } from "@shared/schema";

export type Me = { user: User; teacherId: string | null };

const SessionContext = createContext<Me | null>(null);

export function useSession(): Me {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside provider");
  return ctx;
}

export function SessionProvider({
  children,
  renderGate,
  renderLoading,
}: {
  children: (me: Me) => ReactNode;
  renderGate: (err: ApiError) => ReactNode;
  renderLoading: () => ReactNode;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/api/me"),
    retry: false,
  });

  if (isLoading) return <>{renderLoading()}</>;
  if (error || !data) return <>{renderGate(error as ApiError)}</>;
  return <SessionContext.Provider value={data}>{children(data)}</SessionContext.Provider>;
}
