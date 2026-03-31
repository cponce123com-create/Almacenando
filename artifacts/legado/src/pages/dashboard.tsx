import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth, ROLE_LABELS } from "@/hooks/use-auth";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/hooks/use-auth";
import {
  Package, ClipboardList, Scale, Warehouse,
  AlertTriangle, TestTube, Layers, Bell, Mail,
  PackageSearch, Microscope, Recycle, ShieldCheck,
  FileText, Shield, Users, BarChart2, Settings,
  TrendingUp, FlaskConical, Activity, ArrowRight,
  Boxes, Zap, Star, ArchiveX,
} from "lucide-react";

function useSummary() {
  return useQuery({
    queryKey: ["/api/reports/summary"],
    queryFn: async () => {
      const res = await fetch("/api/reports/summary", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

// ── Colores por grupo (hex puros para compatibilidad Chrome) ──────────────────
const COLORS = {
  teal:   { bg: "#0f766e", light: "#f0fdfa", iconLight: "#ccfbf1", text: "#134e4a", border: "#99f6e4" },
  purple: { bg: "#7c3aed", light: "#faf5ff", iconLight: "#ede9fe", text: "#4c1d95", border: "#c4b5fd" },
  orange: { bg: "#c2410c", light: "#fff7ed", iconLight: "#fed7aa", text: "#7c2d12", border: "#fdba74" },
  rose:   { bg: "#be123c", light: "#fff1f2", iconLight: "#fecdd3", text: "#881337", border: "#fda4af" },
  sky:    { bg: "#0369a1", light: "#f0f9ff", iconLight: "#bae6fd", text: "#0c4a6e", border: "#7dd3fc" },
  slate:  { bg: "#475569", light: "#f8fafc", iconLight: "#e2e8f0", text: "#1e293b", border: "#cbd5e1" },
};

// ── KPI card configuration ─────────────────────────────────────────────────────
const KPI_CONFIG = [
  {
    key: "products",        label: "Productos",        sublabel: "en catálogo",          href: "/products",
    icon: Package,
    barFrom: "#0d9488",     barTo: "#0891b2",
    iconBg:  "#ccfbf1",     iconColor: "#0f766e",
  },
  {
    key: "inventoryRecords", label: "Inventarios",     sublabel: "registros totales",    href: "/inventory",
    icon: ClipboardList,
    barFrom: "#6366f1",     barTo: "#3b82f6",
    iconBg:  "#e0e7ff",     iconColor: "#4338ca",
  },
  {
    key: "activeImmobilized", label: "Inmovilizados", sublabel: "activos actualmente",  href: "/immobilized",
    icon: AlertTriangle,
    barFrom: "#f97316",     barTo: "#f59e0b",
    iconBg:  "#ffedd5",     iconColor: "#c2410c",
  },
  {
    key: "samples",          label: "Muestras",        sublabel: "en seguimiento",       href: "/samples",
    icon: TestTube,
    barFrom: "#a855f7",     barTo: "#7c3aed",
    iconBg:  "#ede9fe",     iconColor: "#6d28d9",
  },
  {
    key: "dispositions",     label: "Disposición Final", sublabel: "gestionados",        href: "/disposition",
    icon: Recycle,
    barFrom: "#f43f5e",     barTo: "#dc2626",
    iconBg:  "#ffe4e6",     iconColor: "#be123c",
  },
];

// ── Module groups ──────────────────────────────────────────────────────────────
const GROUPS: Array<{
  name: string; icon: any; color: keyof typeof COLORS;
  items: Array<{ name: string; href: string; icon: any }>;
}> = [
  {
    name: "Operaciones de Stock", icon: Boxes, color: "teal",
    items: [
      { name: "Maestro de Productos",  href: "/products",   icon: Package },
      { name: "Saldo Actualizado",     href: "/balances",   icon: Scale },
      { name: "Inventarios",           href: "/inventory",  icon: ClipboardList },
      { name: "Cuadre",                href: "/cuadre",     icon: Warehouse },
      { name: "Productos Sobrantes",   href: "/sobrantes",  icon: ArchiveX },
    ],
  },
  {
    name: "Calidad & Análisis", icon: FlaskConical, color: "purple",
    items: [
      { name: "Muestras",         href: "/samples",         icon: TestTube },
      { name: "Lotes / Tinturas", href: "/dye-lots",        icon: Layers },
      { name: "Control de Lotes", href: "/lot-evaluations", icon: Microscope },
    ],
  },
  {
    name: "Seguimiento & Alertas", icon: Activity, color: "orange",
    items: [
      { name: "Productos Inmovilizados", href: "/immobilized",             icon: AlertTriangle },
      { name: "Disposición Final",       href: "/disposition",             icon: Recycle },
      { name: "Cambio de Lote",          href: "/lot-change-notification", icon: Bell },
    ],
  },
  {
    name: "Comunicación", icon: Mail, color: "rose",
    items: [
      { name: "Envío de Correos", href: "/email-notifications", icon: Mail },
      { name: "Suministros",      href: "/supplies",             icon: PackageSearch },
    ],
  },
  {
    name: "Seguridad & Documentos", icon: ShieldCheck, color: "sky",
    items: [
      { name: "MSDS",       href: "/msds",      icon: ShieldCheck },
      { name: "EPP",        href: "/epp",        icon: Shield },
      { name: "Documentos", href: "/documents",  icon: FileText },
    ],
  },
  {
    name: "Administración", icon: Settings, color: "slate",
    items: [
      { name: "Reportes",       href: "/reports",     icon: BarChart2 },
      { name: "Personal",       href: "/personnel",   icon: Users },
      { name: "Administración", href: "/admin-users", icon: Settings },
    ],
  },
];

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ cfg, value, loading }: { cfg: typeof KPI_CONFIG[0]; value: number; loading: boolean }) {
  const Icon = cfg.icon;
  return (
    <Link href={cfg.href}>
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: "16px", padding: "16px",
        cursor: "pointer", background: "#ffffff", border: "1px solid #f1f5f9",
        transition: "all 0.18s ease", display: "block",
      }}
        className="hover:shadow-lg hover:-translate-y-0.5 group"
      >
        {/* Colored top bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "4px",
          borderRadius: "16px 16px 0 0",
          background: `linear-gradient(to right, ${cfg.barFrom}, ${cfg.barTo})`,
        }} />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginTop: "4px" }}>
          <div style={{ minWidth: 0 }}>
            {loading ? (
              <div style={{ height: "36px", width: "64px", background: "#f1f5f9", borderRadius: "8px", marginBottom: "4px" }}
                className="animate-pulse" />
            ) : (
              <p style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a", lineHeight: 1, marginBottom: "4px" }}>
                {value.toLocaleString()}
              </p>
            )}
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#334155" }}>{cfg.label}</p>
            <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{cfg.sublabel}</p>
          </div>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
            background: cfg.iconBg, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon style={{ width: "20px", height: "20px", color: cfg.iconColor }} />
          </div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: "4px", marginTop: "10px",
          fontSize: "12px", fontWeight: 500, color: cfg.iconColor,
          opacity: 0, transition: "opacity 0.15s",
        }} className="group-hover:!opacity-100">
          <span>Ver módulo</span>
          <ArrowRight style={{ width: "12px", height: "12px" }} />
        </div>
      </div>
    </Link>
  );
}

// ── Module Card ────────────────────────────────────────────────────────────────
function ModuleCard({ item, color }: { item: { name: string; href: string; icon: any }; color: typeof COLORS[keyof typeof COLORS] }) {
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <div style={{
        display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px",
        borderRadius: "12px", border: `1px solid ${color.border}`, cursor: "pointer",
        background: color.light, transition: "all 0.15s ease",
      }} className="hover:-translate-y-0.5 hover:shadow-sm group">
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
          background: color.iconLight, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon style={{ width: "16px", height: "16px", color: color.bg }} />
        </div>
        <span style={{ fontSize: "13px", fontWeight: 500, color: color.text, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          {item.name}
        </span>
        <ArrowRight style={{ width: "14px", height: "14px", color: color.bg, flexShrink: 0, opacity: 0 }}
          className="group-hover:!opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

// ── Group Section ──────────────────────────────────────────────────────────────
function GroupSection({ group }: { group: typeof GROUPS[0] }) {
  const GroupIcon = group.icon;
  const color = COLORS[group.color];
  return (
    <div style={{ background: "#ffffff", borderRadius: "16px", border: "1px solid #f1f5f9", overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "12px 16px", background: color.bg,
      }}>
        <GroupIcon style={{ width: "16px", height: "16px", color: "#ffffff", opacity: 0.9 }} />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#ffffff" }}>{group.name}</span>
      </div>
      <div style={{
        padding: "12px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "8px",
      }}>
        {group.items.map(item => (
          <ModuleCard key={item.href} item={item} color={color} />
        ))}
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading } = useSummary();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <AppLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1200px", margin: "0 auto" }}>

        {/* ── HERO ──────────────────────────────────────────────────── */}
        <div style={{
          position: "relative", overflow: "hidden", borderRadius: "18px",
          background: "linear-gradient(135deg, #0f766e 0%, #0d9488 40%, #0e7490 100%)",
          padding: "20px 24px",
        }}>
          <div style={{ position: "absolute", top: "-32px", right: "-32px", width: "160px", height: "160px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
          <div style={{ position: "absolute", bottom: "-48px", right: "-16px", width: "256px", height: "256px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />

          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <FlaskConical style={{ width: "18px", height: "18px", color: "#99f6e4" }} />
                <span style={{ color: "#99f6e4", fontSize: "13px", fontWeight: 500 }}>Almacén Químico</span>
              </div>
              <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#ffffff", lineHeight: 1.2, marginBottom: "4px" }}>
                {greeting}, {firstName}
              </h1>
              <p style={{ color: "#a7f3d0", fontSize: "13px" }}>Panel de control · Sistema de Gestión</p>
            </div>
            <div style={{ flexShrink: 0, textAlign: "center" }}>
              <div style={{
                width: "56px", height: "56px", borderRadius: "14px",
                background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "22px", fontWeight: 700, color: "#ffffff",
              }}>
                {firstName.charAt(0).toUpperCase()}
              </div>
              {user?.role && (
                <div style={{
                  marginTop: "6px", fontSize: "11px", fontWeight: 600, color: "#ffffff",
                  background: "rgba(255,255,255,0.2)", borderRadius: "999px", padding: "2px 10px",
                }}>
                  {ROLE_LABELS[user.role]}
                </div>
              )}
            </div>
          </div>

          <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
            {isLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} style={{ height: "28px", width: "112px", borderRadius: "999px", background: "rgba(255,255,255,0.1)" }}
                  className="animate-pulse" />
              ))
            ) : summary ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.15)", borderRadius: "999px", padding: "4px 12px", fontSize: "12px", color: "#ffffff", fontWeight: 500 }}>
                  <Package style={{ width: "12px", height: "12px" }} />
                  {summary.products} productos
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.15)", borderRadius: "999px", padding: "4px 12px", fontSize: "12px", color: "#ffffff", fontWeight: 500 }}>
                  <TestTube style={{ width: "12px", height: "12px" }} />
                  {summary.samples} muestras
                </div>
                {summary.activeImmobilized > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(251,146,60,0.35)", border: "1px solid rgba(251,146,60,0.35)", borderRadius: "999px", padding: "4px 12px", fontSize: "12px", color: "#fed7aa", fontWeight: 500 }}>
                    <AlertTriangle style={{ width: "12px", height: "12px" }} />
                    {summary.activeImmobilized} inmovilizados
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* ── KPI CARDS ──────────────────────────────────────────────── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <TrendingUp style={{ width: "16px", height: "16px", color: "#94a3b8" }} />
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Métricas del Sistema
            </h2>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }} className="sm:!grid-cols-3 lg:!grid-cols-5">
            {KPI_CONFIG.map(cfg => (
              <KpiCard key={cfg.key} cfg={cfg} value={summary?.[cfg.key] ?? 0} loading={isLoading} />
            ))}
          </div>
        </div>

        {/* ── MODULE GROUPS ──────────────────────────────────────────── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Zap style={{ width: "16px", height: "16px", color: "#94a3b8" }} />
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Acceso Rápido a Módulos
            </h2>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "16px",
          }} className="sm:!grid-cols-2 xl:!grid-cols-3">
            {GROUPS.map(group => (
              <GroupSection key={group.name} group={group} />
            ))}
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: "14px", padding: "12px 16px",
        }}>
          <Star style={{ width: "16px", height: "16px", color: "#0d9488", flexShrink: 0 }} />
          <p style={{ fontSize: "12px", color: "#64748b" }}>
            Sesión activa como{" "}
            <strong style={{ color: "#334155" }}>{user?.email}</strong>
            {" · "}
            <span style={{
              display: "inline-flex", alignItems: "center",
              padding: "1px 8px", borderRadius: "4px",
              fontSize: "11px", fontWeight: 600,
              background: "#f0fdfa", color: "#0f766e",
            }}>
              {user?.role ? ROLE_LABELS[user.role] : ""}
            </span>
          </p>
        </div>

      </div>
    </AppLayout>
  );
}
