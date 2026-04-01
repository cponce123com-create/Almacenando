import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth, ROLE_LABELS, ROLE_COLORS, type WarehouseRole } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, Plus, Pencil, Trash2, Loader2, AlertCircle, User,
  ShieldCheck, Eye, EyeOff, UserCog, KeyRound, Search,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: WarehouseRole;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt?: string;
}

// ─── Config de permisos ───────────────────────────────────────────────────────

const ROLES_CONFIG = [
  { id: "admin",      label: "Admin",        color: "#7c3aed", bg: "#ede9fe" },
  { id: "supervisor", label: "Supervisor",   color: "#0369a1", bg: "#e0f2fe" },
  { id: "operator",   label: "Operador",     color: "#047857", bg: "#d1fae5" },
  { id: "quality",    label: "Calidad",      color: "#b45309", bg: "#fef3c7" },
  { id: "readonly",   label: "Solo lectura", color: "#6b7280", bg: "#f3f4f6" },
] as const;

const PAGES_CONFIG = [
  { id: "dashboard",     label: "Dashboard",            icon: "⬛", group: "Principal" },
  { id: "products",      label: "Productos",            icon: "📦", group: "Inventario" },
  { id: "inventory",     label: "Inventario",           icon: "📊", group: "Inventario" },
  { id: "balances",      label: "Balances",             icon: "⚖️",  group: "Inventario" },
  { id: "cuadre",        label: "Cuadre",               icon: "🔢", group: "Inventario" },
  { id: "immobilized",   label: "Inmovilizados",        icon: "🔒", group: "Inventario" },
  { id: "samples",       label: "Muestras",             icon: "🧪", group: "Calidad" },
  { id: "dye_lots",      label: "Lotes de Tinte",       icon: "🎨", group: "Calidad" },
  { id: "lot_evals",     label: "Evaluaciones de Lote", icon: "📋", group: "Calidad" },
  { id: "disposition",   label: "Disposición Final",    icon: "🗑️",  group: "Calidad" },
  { id: "epp",           label: "EPP",                  icon: "🦺", group: "Seguridad" },
  { id: "personnel",     label: "Personal",             icon: "👷", group: "Seguridad" },
  { id: "documents",     label: "Documentos",           icon: "📄", group: "Archivos" },
  { id: "supplies",      label: "Suministros",          icon: "🛒", group: "Archivos" },
  { id: "surplus",       label: "Excedentes",           icon: "📤", group: "Archivos" },
  { id: "reports",       label: "Reportes",             icon: "📈", group: "Reportes" },
  { id: "notifications", label: "Notificaciones",       icon: "🔔", group: "Sistema" },
  { id: "admin_users",   label: "Gestión de Usuarios",  icon: "👥", group: "Sistema" },
];

const ACTIONS_CONFIG = [
  { id: "import", label: "Importar", icon: "⬆️" },
  { id: "export", label: "Exportar", icon: "⬇️" },
  { id: "delete", label: "Eliminar", icon: "🗑️" },
  { id: "edit",   label: "Editar",   icon: "✏️" },
];

const DEFAULT_PERMS: Record<string, { pages: string[]; actions: string[] }> = {
  admin:      { pages: PAGES_CONFIG.map(p => p.id), actions: ACTIONS_CONFIG.map(a => a.id) },
  supervisor: { pages: PAGES_CONFIG.filter(p => p.id !== "admin_users").map(p => p.id), actions: ["import","export","delete","edit"] },
  operator:   { pages: ["dashboard","products","inventory","balances","cuadre","immobilized","epp","personnel","supplies","surplus","notifications"], actions: ["edit"] },
  quality:    { pages: ["dashboard","products","samples","dye_lots","lot_evals","disposition","epp","reports","notifications"], actions: ["import","export","edit"] },
  readonly:   { pages: ["dashboard","products","inventory","balances","reports"], actions: [] },
};

function initPerms() {
  const p: Record<string, { pages: string[]; actions: string[] }> = {};
  for (const role of ROLES_CONFIG) p[role.id] = JSON.parse(JSON.stringify(DEFAULT_PERMS[role.id]));
  return p;
}

function groupedPages() {
  const groups: Record<string, typeof PAGES_CONFIG> = {};
  for (const p of PAGES_CONFIG) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }
  return groups;
}

// ─── API helper ──────────────────────────────────────────────────────────────

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error en el servidor");
  }
  return res.json();
};

// ─── Role badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: WarehouseRole }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={!disabled ? onChange : undefined}
      style={{
        width: 34, height: 19, borderRadius: 10, border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "#6d28d9" : "#d1d5db",
        position: "relative", transition: "background 0.18s",
        padding: 0, flexShrink: 0, opacity: disabled ? 0.4 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: checked ? 17 : 2,
        width: 15, height: 15, borderRadius: "50%", background: "#fff",
        transition: "left 0.18s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

// ─── Password field ──────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder = "Mínimo 8 caracteres" }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ─── Edit self profile dialog ─────────────────────────────────────────────────

function EditMyProfileDialog({
  open, onClose, currentUser,
}: {
  open: boolean; onClose: () => void; currentUser: AdminUser;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: currentUser.name, email: currentUser.email, password: "" });

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      api("/api/admin/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, email: data.email, ...(data.password ? { password: data.password } : {}) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Perfil actualizado", description: "Tus datos fueron guardados correctamente." });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-blue-600" /> Mi Perfil
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700">
            Puedes cambiar tu nombre, correo y contraseña. Tu rol solo puede ser cambiado por un administrador.
          </div>
          <div className="space-y-1">
            <Label>Nombre completo</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Correo electrónico</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Nueva contraseña <span className="text-slate-400 font-normal">(dejar en blanco para no cambiar)</span></Label>
            <PasswordInput value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Tu rol actual: <RoleBadge role={currentUser.role} /></span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={mutation.isPending || !form.name || !form.email}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create / Edit user dialog ────────────────────────────────────────────────

type UserForm = { name: string; email: string; password: string; role: WarehouseRole; status: "active" | "inactive" };
const emptyForm = (): UserForm => ({ name: "", email: "", password: "", role: "operator", status: "active" });

function UserDialog({
  open, onClose, editTarget, currentUserId,
}: {
  open: boolean; onClose: () => void; editTarget: AdminUser | null; currentUserId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!editTarget;
  const isSelf = editTarget?.id === currentUserId;

  const [form, setForm] = useState<UserForm>(
    editTarget
      ? { name: editTarget.name, email: editTarget.email, password: "", role: editTarget.role, status: editTarget.status }
      : emptyForm()
  );

  const set = <K extends keyof UserForm>(k: K, v: UserForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data: UserForm) => {
      const body: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        role: data.role,
        status: data.status,
      };
      if (data.password) body.password = data.password;
      if (!isEdit) body.password = data.password;

      return isEdit
        ? api(`/api/admin/users/${editTarget!.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : api("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: isEdit ? "Usuario actualizado" : "Usuario creado" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const valid = form.name && form.email && (isEdit || form.password.length >= 8);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil className="w-5 h-5 text-slate-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
            {isEdit ? "Editar usuario" : "Nuevo usuario"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isSelf && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-700">
              Estás editando tu propia cuenta. No puedes cambiar tu rol ni desactivarte.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Nombre completo</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ej. María García" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Correo electrónico</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => {
                  const email = e.target.value;
                  set("email", email);
                  if (!isEdit) {
                    const username = email.split("@")[0];
                    if (username) set("password", username + "123");
                  }
                }}
                placeholder="usuario@empresa.com"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>
                Contraseña {isEdit && <span className="text-slate-400 font-normal">(dejar en blanco para no cambiar)</span>}
                {!isEdit && form.email && <span className="text-slate-400 font-normal"> (auto: {form.email.split("@")[0]}123)</span>}
              </Label>
              <PasswordInput value={form.password} onChange={(v) => set("password", v)} />
            </div>

            <div className="space-y-1">
              <Label>Rol</Label>
              <Select
                value={form.role}
                onValueChange={(v) => set("role", v as WarehouseRole)}
                disabled={isSelf}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["admin", "supervisor", "operator", "quality", "readonly"] as WarehouseRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Estado</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as "active" | "inactive")}
                disabled={isSelf}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={mutation.isPending || !valid}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? "Guardar" : "Crear usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Permissions Matrix ──────────────────────────────────────────────────

function PermissionsTab({
  perms, setPerms,
}: {
  perms: Record<string, { pages: string[]; actions: string[] }>;
  setPerms: React.Dispatch<React.SetStateAction<Record<string, { pages: string[]; actions: string[] }>>>;
}) {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>("operator");
  const [saving, setSaving] = useState(false);
  const groups = groupedPages();
  const rp = perms[selectedRole];
  const ri = ROLES_CONFIG.find(r => r.id === selectedRole)!;

  function togglePage(pageId: string) {
    setPerms(p => {
      const cur = p[selectedRole].pages;
      const next = cur.includes(pageId) ? cur.filter(x => x !== pageId) : [...cur, pageId];
      return { ...p, [selectedRole]: { ...p[selectedRole], pages: next } };
    });
  }

  function toggleAction(actionId: string) {
    setPerms(p => {
      const cur = p[selectedRole].actions;
      const next = cur.includes(actionId) ? cur.filter(x => x !== actionId) : [...cur, actionId];
      return { ...p, [selectedRole]: { ...p[selectedRole], actions: next } };
    });
  }

  function toggleAllPages(groupPages: typeof PAGES_CONFIG) {
    const allChecked = groupPages.every(p => rp.pages.includes(p.id));
    setPerms(prev => {
      const ids = groupPages.map(p => p.id);
      const cur = prev[selectedRole].pages;
      const next = allChecked ? cur.filter(x => !ids.includes(x)) : [...new Set([...cur, ...ids])];
      return { ...prev, [selectedRole]: { ...prev[selectedRole], pages: next } };
    });
  }

  function resetToDefault() {
    setPerms(p => ({ ...p, [selectedRole]: JSON.parse(JSON.stringify(DEFAULT_PERMS[selectedRole])) }));
  }

  async function savePermissions() {
    setSaving(true);
    try {
      await api(`/api/admin/permissions/${selectedRole}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(perms[selectedRole]),
      });
      toast({ title: "Permisos guardados", description: `Los permisos de ${ri.label} fueron actualizados.` });
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Role selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {ROLES_CONFIG.map(r => (
          <button key={r.id} onClick={() => setSelectedRole(r.id)} style={{
            padding: "7px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
            border: "2px solid", cursor: "pointer", transition: "all 0.15s",
            borderColor: selectedRole === r.id ? r.color : "#e5e7eb",
            background: selectedRole === r.id ? r.bg : "#fff",
            color: selectedRole === r.id ? r.color : "#6b7280",
          }}>{r.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 20, alignItems: "start" }}>
        {/* Pages section */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>
              Páginas visibles para <span style={{ color: ri.color }}>{ri.label}</span>
            </h3>
            <button onClick={resetToDefault} style={{ fontSize: 12, color: "#6b7280", background: "none",
              border: "none", cursor: "pointer", textDecoration: "underline" }}>Restablecer</button>
          </div>

          {Object.entries(groups).map(([group, pages]) => {
            const allChecked = pages.every(p => rp.pages.includes(p.id));
            return (
              <div key={group} style={{ marginBottom: 14, border: "1px solid #f3f4f6",
                borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 14px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151",
                    textTransform: "uppercase", letterSpacing: "0.06em" }}>{group}</span>
                  <button onClick={() => toggleAllPages(pages)} style={{
                    fontSize: 11, color: allChecked ? ri.color : "#9ca3af",
                    background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                    {allChecked ? "Quitar todas" : "Marcar todas"}
                  </button>
                </div>
                <div style={{ padding: "6px 6px" }}>
                  {pages.map(page => {
                    const checked = rp.pages.includes(page.id);
                    return (
                      <div key={page.id} onClick={() => togglePage(page.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                          borderRadius: 7, cursor: "pointer", transition: "background 0.1s",
                          background: checked ? ri.bg : "transparent" }}>
                        <Toggle checked={checked} onChange={() => togglePage(page.id)} />
                        <span style={{ fontSize: 15 }}>{page.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400,
                          color: checked ? ri.color : "#6b7280" }}>{page.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions section */}
        <div>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#111827" }}>
            Acciones permitidas
          </h3>
          <div style={{ border: "1px solid #f3f4f6", borderRadius: 10, overflow: "hidden" }}>
            {ACTIONS_CONFIG.map(action => {
              const checked = rp.actions.includes(action.id);
              return (
                <div key={action.id} onClick={() => toggleAction(action.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                    borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                    background: checked ? ri.bg : "#fff", transition: "background 0.1s" }}>
                  <Toggle checked={checked} onChange={() => toggleAction(action.id)} />
                  <span style={{ fontSize: 16 }}>{action.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400,
                    color: checked ? ri.color : "#6b7280" }}>{action.label}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, padding: "12px 14px", background: "#f9fafb",
            borderRadius: 10, border: "1px solid #f3f4f6" }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#374151" }}>Resumen</p>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6b7280" }}>
              {rp.pages.length} páginas habilitadas
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              {rp.actions.length} acciones permitidas
            </p>
          </div>

          <Button
            onClick={savePermissions}
            disabled={saving}
            className="mt-3 w-full bg-violet-700 hover:bg-violet-800"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar permisos de {ri.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdministracióndeUsuariosPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [perms, setPerms] = useState(initPerms());

  const { data: users = [], isLoading, isError } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => api("/api/admin/users"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Usuario eliminado" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/users/${id}/reset-password`, { method: "POST" }),
    onSuccess: (_data: unknown, id: string) => {
      const user = users.find((u) => u.id === id);
      toast({ title: "Enlace enviado", description: `Se envió un correo de restablecimiento a ${user?.email ?? "el usuario"}.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isAdmin = currentUser?.role === "admin";
  const activeCount = users.filter((u) => u.status === "active").length;

  const roleCounts = Object.fromEntries(
    (["admin", "supervisor", "operator", "quality", "readonly"] as WarehouseRole[])
      .map((r) => [r, users.filter((u) => u.role === r).length])
  ) as Record<WarehouseRole, number>;

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

  // Filtrado de usuarios con búsqueda y filtro por rol
  const filteredUsers = (statusFilter: "active" | "inactive" | "all") =>
    users.filter(u => {
      const matchStatus = statusFilter === "all" || u.status === statusFilter;
      const matchSearch = !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === "all" || u.role === filterRole;
      return matchStatus && matchSearch && matchRole;
    });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Settings className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Administración de Usuarios</h1>
              <p className="text-slate-500 text-sm">{activeCount} usuarios activos · {users.length} en total</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {currentUser && (
              <Button variant="outline" onClick={() => setShowMyProfile(true)} className="gap-2">
                <UserCog className="w-4 h-4" /> Mi perfil
              </Button>
            )}
            {isAdmin && (
              <Button onClick={() => setShowCreate(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4" /> Nuevo usuario
              </Button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(["admin", "supervisor", "operator", "quality", "readonly"] as WarehouseRole[]).map((r) => (
            <div key={r} className="bg-white rounded-xl border border-slate-100 px-4 py-3">
              <p className="text-2xl font-bold text-slate-800">{roleCounts[r]}</p>
              <p className="text-xs text-slate-500 mt-0.5">{ROLE_LABELS[r]}</p>
            </div>
          ))}
        </div>

        {/* Main tabs: Usuarios | Permisos por rol */}
        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="users">👥 Usuarios</TabsTrigger>
            <TabsTrigger value="permissions">🔐 Permisos por rol</TabsTrigger>
          </TabsList>

          {/* ── Tab Usuarios ── */}
          <TabsContent value="users">
            {isLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
              </div>
            ) : isError ? (
              <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-100 rounded-xl px-5 py-4">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="text-sm">No se pudieron cargar los usuarios.</span>
              </div>
            ) : (
              <>
                {/* Buscador y filtro por rol */}
                <div className="flex gap-3 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar por nombre o email..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 bg-white"
                    />
                  </div>
                  <select
                    value={filterRole}
                    onChange={e => setFilterRole(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-blue-400 text-slate-700"
                  >
                    <option value="all">Todos los roles</option>
                    {ROLES_CONFIG.map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <Tabs defaultValue="active">
                  <TabsList className="mb-4">
                    <TabsTrigger value="active">
                      Activos <span className="ml-1.5 text-xs text-slate-500">({filteredUsers("active").length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="inactive">
                      Inactivos <span className="ml-1.5 text-xs text-slate-500">({filteredUsers("inactive").length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="all">
                      Todos <span className="ml-1.5 text-xs text-slate-500">({filteredUsers("all").length})</span>
                    </TabsTrigger>
                  </TabsList>

                  {(["active", "inactive", "all"] as const).map((tab) => {
                    const filtered = filteredUsers(tab);
                    return (
                      <TabsContent key={tab} value={tab}>
                        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                          {filtered.length === 0 ? (
                            <div className="py-16 text-center">
                              <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                              <p className="text-slate-500 text-sm">No se encontraron usuarios.</p>
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Usuario</TableHead>
                                  <TableHead>Rol</TableHead>
                                  <TableHead className="hidden sm:table-cell">Estado</TableHead>
                                  <TableHead className="hidden md:table-cell">Creado</TableHead>
                                  {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filtered.map((u) => (
                                  <TableRow key={u.id} className={u.id === currentUser?.id ? "bg-blue-50/50" : ""}>
                                    <TableCell>
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-sm shrink-0">
                                          {u.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                          <p className="font-medium text-slate-900 text-sm leading-tight">
                                            {u.name}
                                            {u.id === currentUser?.id && (
                                              <span className="ml-2 text-xs text-blue-600 font-normal">(tú)</span>
                                            )}
                                          </p>
                                          <p className="text-xs text-slate-400 leading-tight">{u.email}</p>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell><RoleBadge role={u.role} /></TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                      <div className="flex items-center gap-1.5">
                                        <div className={`w-1.5 h-1.5 rounded-full ${u.status === "active" ? "bg-emerald-500" : "bg-slate-300"}`} />
                                        <span className="text-xs text-slate-600">
                                          {u.status === "active" ? "Activo" : "Inactivo"}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell text-xs text-slate-400">
                                      {formatDate(u.createdAt)}
                                    </TableCell>
                                    {isAdmin && (
                                      <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <Button
                                            variant="ghost" size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-amber-600"
                                            title={`Enviar enlace de restablecimiento a ${u.email}`}
                                            onClick={() => {
                                              if (window.confirm(`¿Enviar un correo de restablecimiento a "${u.name}" (${u.email})?`)) {
                                                resetPasswordMutation.mutate(u.id);
                                              }
                                            }}
                                            disabled={resetPasswordMutation.isPending}
                                          >
                                            <KeyRound className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button
                                            variant="ghost" size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-blue-600"
                                            onClick={() => setEditTarget(u)}
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </Button>
                                          {u.id !== currentUser?.id && (
                                            <Button
                                              variant="ghost" size="icon"
                                              className="h-8 w-8 text-slate-400 hover:text-red-600"
                                              onClick={() => setDeleteTarget(u)}
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </>
            )}
          </TabsContent>

          {/* ── Tab Permisos ── */}
          <TabsContent value="permissions">
            <div className="bg-white rounded-xl border border-slate-100 p-6">
              <PermissionsTab perms={perms} setPerms={setPerms} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      {showCreate && (
        <UserDialog open={showCreate} onClose={() => setShowCreate(false)} editTarget={null} currentUserId={currentUser?.id ?? ""} />
      )}
      {editTarget && (
        <UserDialog open={!!editTarget} onClose={() => setEditTarget(null)} editTarget={editTarget} currentUserId={currentUser?.id ?? ""} />
      )}
      {currentUser && showMyProfile && (
        <EditMyProfileDialog open={showMyProfile} onClose={() => setShowMyProfile(false)} currentUser={currentUser as AdminUser} />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la cuenta de <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
