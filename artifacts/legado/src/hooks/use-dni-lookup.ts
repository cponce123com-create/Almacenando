import { useState, useCallback } from "react";
import { getAuthHeaders } from "@/hooks/use-auth";

type DniResult = {
  status: "idle" | "loading" | "success" | "error";
  fullName?: string;
  firstName?: string;
  firstLastName?: string;
  secondLastName?: string;
  message?: string;
};

export function useDniLookup() {
  const [result, setResult] = useState<DniResult>({ status: "idle" });

  const lookup = useCallback(async (dni: string) => {
    if (!dni || dni.replace(/\D/g, "").length !== 8) {
      setResult({ status: "idle" });
      return null;
    }

    setResult({ status: "loading" });

    try {
      const res = await fetch("/api/trusted-contacts/verify-dni", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dni: dni.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ status: "error", message: data.error || "DNI no encontrado" });
        return null;
      }

      setResult({
        status: "success",
        fullName: data.fullName,
        firstName: data.firstName,
        firstLastName: data.firstLastName,
        secondLastName: data.secondLastName,
      });

      return data;
    } catch {
      setResult({ status: "error", message: "Error de conexión con RENIEC" });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setResult({ status: "idle" });
  }, []);

  return { result, lookup, reset };
}
