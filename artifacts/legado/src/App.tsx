import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WarehouseProvider } from "@/contexts/WarehouseContext";

import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import Dashboard from "@/pages/dashboard";

import ProductsPage from "@/pages/modules/products";
import InventoryPage from "@/pages/modules/inventory";
import BalancesPage from "@/pages/modules/balances";
import CuadrePage from "@/pages/modules/cuadre";
import ImmobilizedPage from "@/pages/modules/immobilized";
import SamplesPage from "@/pages/modules/samples";
import DyeLotsPage from "@/pages/modules/dye-lots";
import DispositionPage from "@/pages/modules/disposition";
import DocumentsPage from "@/pages/modules/documents";
import EppPage from "@/pages/modules/epp";
import PersonnelPage from "@/pages/modules/personnel";
import ReportsPage from "@/pages/modules/reports";
import AdminUsersPage from "@/pages/modules/admin-users";
import LotEvaluationsPage from "@/pages/modules/lot-evaluations";
import ProfilePage from "@/pages/profile";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <Component />;
}

function PublicOnlyRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) return null;
  if (isAuthenticated) return null;

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/"><PublicOnlyRoute component={Login} /></Route>
      <Route path="/login"><PublicOnlyRoute component={Login} /></Route>

      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/products"><ProtectedRoute component={ProductsPage} /></Route>
      <Route path="/inventory"><ProtectedRoute component={InventoryPage} /></Route>
      <Route path="/balances"><ProtectedRoute component={BalancesPage} /></Route>
      <Route path="/cuadre"><ProtectedRoute component={CuadrePage} /></Route>
      <Route path="/immobilized"><ProtectedRoute component={ImmobilizedPage} /></Route>
      <Route path="/samples"><ProtectedRoute component={SamplesPage} /></Route>
      <Route path="/dye-lots"><ProtectedRoute component={DyeLotsPage} /></Route>
      <Route path="/disposition"><ProtectedRoute component={DispositionPage} /></Route>
      <Route path="/documents"><ProtectedRoute component={DocumentsPage} /></Route>
      <Route path="/epp"><ProtectedRoute component={EppPage} /></Route>
      <Route path="/personnel"><ProtectedRoute component={PersonnelPage} /></Route>
      <Route path="/reports"><ProtectedRoute component={ReportsPage} /></Route>
      <Route path="/admin-users"><ProtectedRoute component={AdminUsersPage} /></Route>
      <Route path="/lot-evaluations"><ProtectedRoute component={LotEvaluationsPage} /></Route>
      <Route path="/profile"><ProtectedRoute component={ProfilePage} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WarehouseProvider>
          <ErrorBoundary moduleName="la aplicación">
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </ErrorBoundary>
        </WarehouseProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
