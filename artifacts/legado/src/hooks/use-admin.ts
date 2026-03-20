import { 
  useAdminGetDeathReports,
  useAdminGetDeathReport,
  useAdminApproveRelease,
  useAdminRejectRelease
} from "@workspace/api-client-react";
import { getAdminAuthHeaders } from "./use-auth";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";

export function useAdminReports() {
  return useAdminGetDeathReports({
    request: { headers: getAdminAuthHeaders() }
  });
}

export function useAdminReport(id: string) {
  return useAdminGetDeathReport(id, {
    request: { headers: getAdminAuthHeaders() }
  });
}

export function useApproveRelease() {
  const queryClient = useQueryClient();
  return useAdminApproveRelease({
    request: { headers: getAdminAuthHeaders() },
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/death-reports"] });
        queryClient.invalidateQueries({ queryKey: [`/api/admin/death-reports/${variables.id}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      }
    }
  });
}

export function useRejectRelease() {
  const queryClient = useQueryClient();
  return useAdminRejectRelease({
    request: { headers: getAdminAuthHeaders() },
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/death-reports"] });
        queryClient.invalidateQueries({ queryKey: [`/api/admin/death-reports/${variables.id}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      }
    }
  });
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  legacyItemsCount: number;
  recipientsCount: number;
  trustedContactsCount: number;
  deathReportStatus: string | null;
  createdAt: string;
}

export function useAdminUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", {
        headers: getAdminAuthHeaders(),
      });
      if (!res.ok) throw new Error("Error al cargar usuarios");
      return res.json();
    },
  });
}

export function useSuspendUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        headers: getAdminAuthHeaders(),
      });
      if (!res.ok) throw new Error("Error al suspender usuario");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}

export function useActivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/activate`, {
        method: "POST",
        headers: getAdminAuthHeaders(),
      });
      if (!res.ok) throw new Error("Error al activar usuario");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });
}
