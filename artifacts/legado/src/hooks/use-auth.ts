import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type UserResponse, type LoginRequest, type RegisterRequest } from "@workspace/api-client-react";
import { storeEncryptionKey, clearEncryptionKey } from "@/lib/encryption";

const TOKEN_KEY = "legado_token";
const ADMIN_TOKEN_KEY = "legado_admin_token";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAdminAuthToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getAdminAuthHeaders() {
  const token = getAdminAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(getAuthToken());

  useEffect(() => {
    const handleStorage = () => setToken(getAuthToken());
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const { data: user, isLoading, error } = useQuery<UserResponse | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const currentToken = getAuthToken();
      if (!currentToken) return null;

      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
        return null;
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const login = async (data: LoginRequest) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Login failed");
    }

    const result = await res.json();
    localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    queryClient.setQueryData(["/api/auth/me"], result.user);
    if (result.encryptionKey) {
      storeEncryptionKey(result.encryptionKey);
    }
    return result;
  };

  // Set session directly from pre-fetched token + user (no extra API call)
  const setUserSession = (userToken: string, userData: UserResponse, encryptionKey?: string) => {
    localStorage.setItem(TOKEN_KEY, userToken);
    setToken(userToken);
    queryClient.setQueryData(["/api/auth/me"], userData);
    if (encryptionKey) {
      storeEncryptionKey(encryptionKey);
    }
  };

  const register = async (data: RegisterRequest) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Registration failed");
    }

    const result = await res.json();
    localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    queryClient.setQueryData(["/api/auth/me"], result.user);
    if (result.encryptionKey) {
      storeEncryptionKey(result.encryptionKey);
    }
    return result;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    queryClient.setQueryData(["/api/auth/me"], null);
    queryClient.clear();
    clearEncryptionKey();
  };

  return {
    user,
    isLoading: isLoading && !!token,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    setUserSession,
  };
}
