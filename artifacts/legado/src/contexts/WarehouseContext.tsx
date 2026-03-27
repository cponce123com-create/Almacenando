import { createContext, useContext, useState, type ReactNode } from "react";

export const WAREHOUSES = ["QA", "Q1", "QP", "QL", "QD"] as const;
export type Warehouse = typeof WAREHOUSES[number] | "all";

interface WarehouseContextValue {
  warehouse: Warehouse;
  setWarehouse: (w: Warehouse) => void;
}

const WarehouseContext = createContext<WarehouseContextValue>({
  warehouse: "all",
  setWarehouse: () => {},
});

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [warehouse, setWarehouse] = useState<Warehouse>(() => {
    return (localStorage.getItem("selected_warehouse") as Warehouse) || "all";
  });

  const handleSet = (w: Warehouse) => {
    setWarehouse(w);
    localStorage.setItem("selected_warehouse", w);
  };

  return (
    <WarehouseContext.Provider value={{ warehouse, setWarehouse: handleSet }}>
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  return useContext(WarehouseContext);
}
