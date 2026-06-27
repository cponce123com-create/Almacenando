import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Token persistence
// Access token is stored in-memory only (not localStorage) to prevent XSS.
// Refresh token is in an HttpOnly cookie (set by the server).
// ---------------------------------------------------------------------------
const TOKEN_KEY = "auth_token";

function readToken(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeToken(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* localStorage may be blocked */ }
}

let memoryToken: string | null = null; // Ya no se lee de localStorage al inicio

// Sync in-memory token from localStorage when it changes externally.
function syncTokensFromStorage(): void {
  const storedToken = readToken(TOKEN_KEY);
  if (storedToken !== memoryToken) memoryToken = storedToken;
}

// Listen for storage events from other tabs AND custom refresh events
if (typeof window !== "undefined") {
  window.addEventListener("storage", () => syncTokensFromStorage());
  window.addEventListener("app:token-refreshed", () => syncTokensFromStorage());
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
  syncTokensFromStorage();
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
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Sin body — el refresh token viaja en la cookie HttpOnly
    });

    if (!res.ok) {
      // Refresh token inválido o expirado — limpiar todo
      memoryToken = null;
      writeToken(TOKEN_KEY, null);
      return false;
    }

    const data = await res.json();
    memoryToken = data.token;
    writeToken(TOKEN_KEY, data.token);
    return true;
  } catch {
    return false;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(memoryToken);

  const { data: user, isLoading, error } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const currentToken = getAuthToken();
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
          writeToken(TOKEN_KEY, null);
          setToken(null);
        }
        return null;
      }
      return res.json();
    },
    enabled: !!token,
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
    writeToken(TOKEN_KEY, result.token);
    setToken(result.token);
    queryClient.setQueryData(["/api/auth/me"], result.user);
    return result.user;
  };

  const logout = async () => {
    const currentToken = memoryToken;

    // Clear local state immediately
    memoryToken = null;
    writeToken(TOKEN_KEY, null);
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
    isLoading: isLoading && !!token,
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
