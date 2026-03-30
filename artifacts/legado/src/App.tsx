import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WarehouseProvider } from "@/contexts/WarehouseContext";

import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import Dashboard from "@/pages/dashboard";

const ProductsPage       = lazy(() => import("@/pages/modules/products"));
const InventoryPage      = lazy(() => import("@/pages/modules/inventory"));
const BalancesPage       = lazy(() => import("@/pages/modules/balances"));
const CuadrePage         = lazy(() => import("@/pages/modules/cuadre"));
const ImmobilizedPage    = lazy(() => import("@/pages/modules/immobilized"));
const SamplesPage        = lazy(() => import("@/pages/modules/samples"));
const DyeLotsPage        = lazy(() => import("@/pages/modules/dye-lots"));
const DispositionPage    = lazy(() => import("@/pages/modules/disposition"));
const DocumentsPage      = lazy(() => import("@/pages/modules/documents"));
const EppPage            = lazy(() => import("@/pages/modules/epp"));
const PersonnelPage      = lazy(() => import("@/pages/modules/personnel"));
const ReportsPage        = lazy(() => import("@/pages/modules/reports"));
const AdminUsersPage     = lazy(() => import("@/pages/modules/admin-users"));
const LotEvaluationsPage = lazy(() => import("@/pages/modules/lot-evaluations"));
const MsdsPage                    = lazy(() => import("@/pages/modules/msds"));
const LotChangeNotificationPage   = lazy(() => import("@/pages/modules/lot-change-notification"));
const ProfilePage                 = lazy(() => import("@/pages/profile"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="h-screen w-full bg-slate-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return null;

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
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
      <Route path="/msds"><ProtectedRoute component={MsdsPage} /></Route>
      <Route path="/lot-change-notification"><ProtectedRoute component={LotChangeNotificationPage} /></Route>
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
