import { 
  useGetRecipients, 
  useCreateRecipient, 
  useUpdateRecipient, 
  useDeleteRecipient,
  useGetTrustedContacts,
  useCreateTrustedContact,
  useUpdateTrustedContact,
  useDeleteTrustedContact
} from "@workspace/api-client-react";
import { getAuthHeaders } from "./use-auth";
import { useQueryClient } from "@tanstack/react-query";

export function useRecipients() {
  return useGetRecipients({
    request: { headers: getAuthHeaders() }
  });
}

export function useCreateRecip() {
  const queryClient = useQueryClient();
  return useCreateRecipient({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}

export function useUpdateRecip() {
  const queryClient = useQueryClient();
  return useUpdateRecipient({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
      }
    }
  });
}

export function useDeleteRecip() {
  const queryClient = useQueryClient();
  return useDeleteRecipient({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}

export function useTrustedContacts() {
  return useGetTrustedContacts({
    request: { headers: getAuthHeaders() }
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useCreateTrustedContact({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/trusted-contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useUpdateTrustedContact({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/trusted-contacts"] });
      }
    }
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useDeleteTrustedContact({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/trusted-contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
    }
  });
}
