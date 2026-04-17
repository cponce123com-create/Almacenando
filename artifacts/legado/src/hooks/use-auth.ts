import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Autenticación basada en cookie httpOnly.
//
// El token JWT ya NO se guarda en localStorage (era vulnerable a XSS).
// Ahora el backend emite una cookie httpOnly + Secure + SameSite=Strict en
// /api/auth/login, y el navegador la envía automáticamente en cada request
// con `credentials: "include"`. JS del frontend nunca puede leerla.
//
// Todas las llamadas fetch() a /api deben usar `credentials: "include"`.
// ---------------------------------------------------------------------------

export type WarehouseRole = "supervisor" | "operator" | "quality" | "admin" | "readonly";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: WarehouseRole;
  status: string;
  createdAt: string;
}

/**
 * Stub para compatibilidad con código legado que llamaba getAuthToken().
 * Ya no hay token accesible desde JS — la cookie es httpOnly.
 * Si algún archivo todavía lo usa, devolverá null pero la request seguirá
 * funcionando porque la cookie viaja sola.
 */
export function getAuthToken(): string | null {
  return null;
}

/**
 * Stub para compatibilidad: ya no hay header Authorization que construir.
 * Las peticiones deben usar `credentials: "include"` en lugar de este header.
 */
export function getAuthHeaders(): Record<string, string> {
  return {};
}

/**
 * Wrapper de fetch que siempre incluye la cookie de sesión.
 * Úsalo en todas las llamadas a /api/**.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}

export function useAuth() {
  const queryClient = useQueryClient();
  // Usamos un "pseudo-flag" porque ya no tenemos acceso al token.
  // La fuente de verdad es /api/auth/me.
  const [sessionChecked, setSessionChecked] = useState(false);

  const { data: user, isLoading, error } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Sesión expirada o inexistente
          return null;
        }
        return null;
      }
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isLoading) setSessionChecked(true);
  }, [isLoading]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error al iniciar sesión" }));
      throw new Error(err.error || "Error al iniciar sesión");
    }

    const result = await res.json();
    // El backend ya setea la cookie httpOnly automáticamente.
    queryClient.setQueryData(["/api/auth/me"], result.user);
    return result.user;
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Si la red falla, igual limpiamos el cliente.
    }
    queryClient.setQueryData(["/api/auth/me"], null);
    queryClient.clear();
  };

  return {
    user,
    isLoading: isLoading && !sessionChecked,
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
