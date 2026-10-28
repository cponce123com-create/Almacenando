import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";

export const PAGE_ID_BY_PATH: Record<string, string> = {
  "/dashboard": "dashboard", "/products": "products", "/inventory": "inventory",
  "/balances": "balances", "/availability": "availability", "/cuadre": "cuadre",
  "/immobilized": "immobilized", "/samples": "samples", "/dye-lots": "dye_lots",
  "/lot-evaluations": "lot_evals", "/disposition": "disposition", "/epp": "epp",
  "/personnel": "personnel", "/documents": "documents", "/supplies": "supplies",
  "/sobrantes": "surplus", "/reports": "reports", "/admin-users": "admin_users",
  "/msds": "msds", "/compatibility": "compatibility",
  "/lot-change-notification": "lot_change_notification",
  "/product-out-notification": "product_out_notification",
  "/email-notifications": "email_notifications", "/locations": "locations",
  "/rounds": "rounds", "/inventory-progress": "inventory_progress",
  "/scanner": "scanner", "/picking": "picking", "/warehouse-map": "warehouse_map",
};

export function useModulePermissions() {
  const { user } = useAuth();
  const query = useQuery<Array<{ pageId: string; canView: boolean }>>({
    queryKey: ["/api/admin/permissions/my-permissions"],
    enabled: !!user && user.role !== "admin",
    queryFn: async () => {
      const res = await fetch("/api/admin/permissions/my-permissions", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("No se pudieron cargar los permisos");
      return res.json();
    },
    staleTime: 30_000,
    retry: 1,
  });
  const allowed = new Set(query.data?.filter(row => row.canView).map(row => row.pageId) ?? []);
  return {
    isLoading: !!user && user.role !== "admin" && query.isLoading,
    isError: !!user && user.role !== "admin" && query.isError,
    canView: (pageId: string) => user?.role === "admin" || allowed.has(pageId),
  };
}
