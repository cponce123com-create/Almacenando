import { 
  useGetLegacyItems, 
  useGetLegacyItem,
  useCreateLegacyItem,
  useUpdateLegacyItem,
  useDeleteLegacyItem,
  useGetLegacyItemRecipients,
  useSetLegacyItemRecipients
} from "@workspace/api-client-react";
import { getAuthHeaders } from "./use-auth";
import { useQueryClient } from "@tanstack/react-query";

export function useLegacy() {
  return useGetLegacyItems({
    request: { headers: getAuthHeaders() }
  });
}

export function useLegacyItem(id: string) {
  return useGetLegacyItem(id, {
    request: { headers: getAuthHeaders() }
  });
}

export function useCreateLegacy() {
  const queryClient = useQueryClient();
  return useCreateLegacyItem({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/legacy-items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}

export function useUpdateLegacy() {
  const queryClient = useQueryClient();
  return useUpdateLegacyItem({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ["/api/legacy-items"] });
        queryClient.invalidateQueries({ queryKey: [`/api/legacy-items/${variables.id}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}

export function useDeleteLegacy() {
  const queryClient = useQueryClient();
  return useDeleteLegacyItem({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/legacy-items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}

export function useItemRecipients(id: string) {
  return useGetLegacyItemRecipients(id, {
    request: { headers: getAuthHeaders() }
  });
}

export function useSetItemRecipients() {
  const queryClient = useQueryClient();
  return useSetLegacyItemRecipients({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: [`/api/legacy-items/${variables.id}/recipients`] });
      }
    }
  });
}
