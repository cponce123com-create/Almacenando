import { 
  useGetProfile,
  useUpdateProfile,
  useGetFuneralPreferences,
  useUpdateFuneralPreferences,
  useGetActivationSettings,
  useUpdateActivationSettings,
  useGetDashboardStats
} from "@workspace/api-client-react";
import { getAuthHeaders } from "./use-auth";
import { useQueryClient } from "@tanstack/react-query";

export function useProfile() {
  return useGetProfile({
    request: { headers: getAuthHeaders() }
  });
}

export function useMutateProfile() {
  const queryClient = useQueryClient();
  return useUpdateProfile({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      }
    }
  });
}

export function useFuneralPrefs() {
  return useGetFuneralPreferences({
    request: { headers: getAuthHeaders() }
  });
}

export function useMutateFuneralPrefs() {
  const queryClient = useQueryClient();
  return useUpdateFuneralPreferences({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/funeral-preferences"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}

export function useActivation() {
  return useGetActivationSettings({
    request: { headers: getAuthHeaders() }
  });
}

export function useMutateActivation() {
  const queryClient = useQueryClient();
  return useUpdateActivationSettings({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/activation-settings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}

export function useDashboard() {
  return useGetDashboardStats({
    request: { headers: getAuthHeaders() }
  });
}
