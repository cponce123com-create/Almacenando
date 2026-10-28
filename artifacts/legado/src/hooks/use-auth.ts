import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Access tokens live only in memory. A short-lived token is restored on page
// load by exchanging the HttpOnly refresh cookie for a new access token.
let memoryToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const authChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("almacenando-auth") : null;
authChannel?.addEventListener("message", event => {
  if (event.data === "logout") {
    memoryToken = null;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    window.dispatchEvent(new Event("almacenando-auth-logout"));
  }
});

function scheduleTokenRefresh() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    if (memoryToken) void tryRefreshToken();
  }, 12 * 60 * 1000);
}

export type WarehouseRole = "supervisor" | "operator" | "quality" | "admin" | "readonly";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: WarehouseRole;
  status: string;
  createdAt: string;
}

export function getAuthToken() {
  return memoryToken;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Intenta refrescar el access token usando el refresh token de la HttpOnly cookie.
 * Devuelve true si se pudo refrescar, false si no.
 */
async function tryRefreshToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const request = () => refreshTokenRequest();
  const lockManager = typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks as unknown as { request<T>(name: string, callback: (lock: Lock | null) => Promise<T>): Promise<T> }
    : null;
  const inFlight: Promise<boolean> = lockManager
    ? lockManager.request<boolean>("almacenando-refresh-cookie", async () => await request())
    : request();
  refreshInFlight = inFlight;
  try { return await inFlight; }
  finally { if (refreshInFlight === inFlight) refreshInFlight = null; }
}

export function refreshAccessToken(): Promise<boolean> { return tryRefreshToken(); }

async function refreshTokenRequest(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Sin body — el refresh token viaja en la cookie HttpOnly
    });

    if (!res.ok) {
      memoryToken = null;
      return false;
    }

    const data = await res.json();
    memoryToken = data.token;
    scheduleTokenRefresh();
    return true;
  } catch {
    return false;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setToken] = useState<string | null>(memoryToken);

  useEffect(() => {
    const onRemoteLogout = () => {
      setToken(null);
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    };
    window.addEventListener("almacenando-auth-logout", onRemoteLogout);
    return () => window.removeEventListener("almacenando-auth-logout", onRemoteLogout);
  }, [queryClient]);

  const { data: user, isLoading, error } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      let currentToken = getAuthToken();
      if (!currentToken && !(await tryRefreshToken())) return null;
      currentToken = getAuthToken();
      if (!currentToken) return null;

      let res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      // Si es 401, intentar refresh automático
      if (res.status === 401) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          setToken(memoryToken);
          res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${getAuthToken()}` }
          });
        }
      }

      if (!res.ok) {
        if (res.status === 401) {
          memoryToken = null;
          setToken(null);
        }
        return null;
      }
      return res.json();
    },
    enabled: true,
    retry: false,
  });

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Error al iniciar sesión");
    }

    const result = await res.json();
    memoryToken = result.token;
    scheduleTokenRefresh();
    setToken(result.token);
    queryClient.setQueryData(["/api/auth/me"], result.user);
    return result.user;
  };

  const logout = async () => {
    const currentToken = memoryToken;

    // Clear local state immediately
    memoryToken = null;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    authChannel?.postMessage("logout");
    setToken(null);
    queryClient.setQueryData(["/api/auth/me"], null);
    queryClient.clear();

    // Revoke the token on the server (fire-and-forget)
    if (currentToken) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      } catch {
        // Network error during logout — will expire naturally.
      }
    }
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    error,
  };
}

export const ROLE_LABELS: Record<WarehouseRole, string> = {
  supervisor: "Supervisor",
  operator: "Operario",
  quality: "Calidad",
  admin: "Administrador",
  readonly: "Solo Lectura",
};

export const ROLE_COLORS: Record<WarehouseRole, string> = {
  supervisor: "bg-blue-100 text-blue-800",
  operator: "bg-green-100 text-green-800",
  quality: "bg-purple-100 text-purple-800",
  admin: "bg-red-100 text-red-800",
  readonly: "bg-gray-100 text-gray-700",
};
