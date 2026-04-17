import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Token persistence: stored in localStorage so it survives page refreshes
// and React re-renders. memoryToken acts as an in-memory cache to avoid
// repeated localStorage reads on every render.
// ---------------------------------------------------------------------------
const TOKEN_KEY = "auth_token";

function readTokenFromStorage(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeTokenToStorage(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // localStorage may be blocked — fail silently.
  }
}

// Seed the in-memory cache from localStorage on module load.
let memoryToken: string | null = readTokenFromStorage();

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

export function useAuth() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(memoryToken);

  const { data: user, isLoading, error } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const currentToken = getAuthToken();
      if (!currentToken) return null;

      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          memoryToken = null;
          writeTokenToStorage(null);
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
    writeTokenToStorage(result.token);
    setToken(result.token);
    queryClient.setQueryData(["/api/auth/me"], result.user);
    return result.user;
  };

  const logout = () => {
    memoryToken = null;
    writeTokenToStorage(null);
    setToken(null);
    queryClient.setQueryData(["/api/auth/me"], null);
    queryClient.clear();
  };

  return {
    user,
    isLoading: isLoading && !!token,
    isAuthenticated: !!user,
    login,
    logout,
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
