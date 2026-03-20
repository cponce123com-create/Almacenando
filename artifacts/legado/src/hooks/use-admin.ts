import { 
  useAdminGetDeathReports,
  useAdminGetDeathReport,
  useAdminApproveRelease,
  useAdminRejectRelease
} from "@workspace/api-client-react";
import { getAdminAuthHeaders } from "./use-auth";
import { useQueryClient } from "@tanstack/react-query";

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
      }
    }
  });
}
