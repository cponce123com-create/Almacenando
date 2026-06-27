import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WarehouseProvider } from "@/contexts/WarehouseContext";

import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import ResetPassword from "@/pages/auth/reset-password";
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
const CompatibilityPage           = lazy(() => import("@/pages/modules/compatibility"));
const LotChangeNotificationPage   = lazy(() => import("@/pages/modules/lot-change-notification"));
const ProductOutNotificationPage  = lazy(() => import("@/pages/modules/product-out-notification"));
const EmailNotificationsPage      = lazy(() => import("@/pages/modules/email-notifications"));
const SuppliesPage                = lazy(() => import("@/pages/modules/supplies"));
const SobrantesPage               = lazy(() => import("@/pages/modules/sobrantes"));
const ProfilePage                 = lazy(() => import("@/pages/profile"));
const LocationsPage               = lazy(() => import("@/pages/modules/locations"));
const RoundsPage                  = lazy(() => import("@/pages/modules/rounds"));
const InventoryProgressPage       = lazy(() => import("@/pages/modules/inventory-progress"));
const ScannerPage                 = lazy(() => import("@/pages/modules/scanner"));
const PickingPage                 = lazy(() => import("@/pages/modules/picking"));
const WarehouseMapPage            = lazy(() => import("@/pages/modules/warehouse-map"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
    },
    mutations: {
      retry: 2,
      retryDelay: 1_000,
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
      <Route path="/reset-password" component={ResetPassword} />

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
      <Route path="/compatibility"><ProtectedRoute component={CompatibilityPage} /></Route>
      <Route path="/lot-change-notification"><ProtectedRoute component={LotChangeNotificationPage} /></Route>
      <Route path="/product-out-notification"><ProtectedRoute component={ProductOutNotificationPage} /></Route>
      <Route path="/email-notifications"><ProtectedRoute component={EmailNotificationsPage} /></Route>
      <Route path="/supplies"><ProtectedRoute component={SuppliesPage} /></Route>
      <Route path="/sobrantes"><ProtectedRoute component={SobrantesPage} /></Route>
      <Route path="/profile"><ProtectedRoute component={ProfilePage} /></Route>
      <Route path="/locations"><ProtectedRoute component={LocationsPage} /></Route>
      <Route path="/rounds"><ProtectedRoute component={RoundsPage} /></Route>
      <Route path="/inventory-progress"><ProtectedRoute component={InventoryProgressPage} /></Route>
      <Route path="/scanner"><ProtectedRoute component={ScannerPage} /></Route>
      <Route path="/picking"><ProtectedRoute component={PickingPage} /></Route>
      <Route path="/warehouse-map"><ProtectedRoute component={WarehouseMapPage} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WarehouseProvider>
          <GlobalErrorToast />
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

/** Escucha eventos 'app:error' disparados desde main.tsx y muestra toast */
function GlobalErrorToast() {
  const { toast } = useToast();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? "Error inesperado";
      toast({ title: "Error", description: detail, variant: "destructive", duration: 5000 });
    };
    window.addEventListener("app:error", handler);
    return () => window.removeEventListener("app:error", handler);
  }, [toast]);
  return null;
}

export default App;
