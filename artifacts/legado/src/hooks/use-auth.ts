import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Autenticación basada en cookie httpOnly.
//
// El token JWT ya NO se guarda en localStorage (era vulnerable a XSS).
// Ahora el backend emite una cookie httpOnly + Secure + SameSite=Strict en
// /api/auth/login, y el navegador la envía automáticamente en cada request.
// JS del frontend nunca puede leerla.
//
// ---------------------------------------------------------------------------
// PARCHE GLOBAL DE FETCH
// ---------------------------------------------------------------------------
// Como muchas páginas de la app hacen fetch() directamente sin pasar
// credentials:"include", parcheamos el fetch global UNA sola vez para que
// TODAS las llamadas al propio origen (incluidas /api/**) envíen la cookie
// de sesión automáticamente. Esto evita tener que tocar 20+ páginas.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __authFetchPatched?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__authFetchPatched) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    // Solo forzamos credentials para requests al mismo origen.
    // (Si alguna vez haces fetch a otro dominio, no tocamos la config.)
    let sameOrigin = true;
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : (input as Request).url;
      if (url.startsWith("http://") || url.startsWith("https://")) {
        sameOrigin = new URL(url).origin === window.location.origin;
      }
    } catch {
      // Si no se puede parsear, asumimos mismo origen (comportamiento seguro).
    }

    if (sameOrigin && init.credentials === undefined) {
      init = { ...init, credentials: "include" };
    }
    return originalFetch(input, init);
  };
  window.__authFetchPatched = true;
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

/**
 * Compatibilidad con código legado que llamaba getAuthToken().
 * Ya no hay token accesible desde JS — la cookie es httpOnly.
 */
export function getAuthToken(): string | null {
  return null;
}

/**
 * Compatibilidad con código legado que hace:
 *   fetch(url, { headers: getAuthHeaders() })
 * Devuelve un objeto vacío — la cookie viaja sola gracias al patch global.
 */
export function getAuthHeaders(): Record<string, string> {
  return {};
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [sessionChecked, setSessionChecked] = useState(false);

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return null;
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
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Error al iniciar sesión" }));
      throw new Error(err.error || "Error al iniciar sesión");
    }

    const result = await res.json();
    queryClient.setQueryData(["/api/auth/me"], result.user);
    return result.user;
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
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
