import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth, ROLE_LABELS, ROLE_COLORS, type WarehouseRole } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  ShieldCheck, Eye, EyeOff, UserCog, CheckCircle2, KeyRound, RefreshCw,
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
      if (!isEdit) body.password = data.password; // required for create

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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdministracióndeUsuariosPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [showMyProfile, setShowMyProfile] = useState(false);

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
    onSuccess: (data: { temporaryPassword: string; user: AdminUser }) => {
      toast({ title: `Contraseña restablecida → ${data.temporaryPassword}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetAllMutation = useMutation({
    mutationFn: () => api("/api/admin/users/reset-all-passwords", { method: "POST" }),
    onSuccess: (data: { message: string }) => {
      toast({ title: data.message });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isAdmin = currentUser?.role === "admin";
  const activeCount = users.filter((u) => u.status === "active").length;

  // Stats
  const roleCounts = Object.fromEntries(
    (["admin", "supervisor", "operator", "quality", "readonly"] as WarehouseRole[])
      .map((r) => [r, users.filter((u) => u.role === r).length])
  ) as Record<WarehouseRole, number>;

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

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
            {/* Botón "Mi perfil" para cualquier usuario autenticado */}
            {currentUser && (
              <Button variant="outline" onClick={() => setShowMyProfile(true)} className="gap-2">
                <UserCog className="w-4 h-4" /> Mi perfil
              </Button>
            )}
            {/* Resetear todos - solo admin */}
            {isAdmin && (
              <Button
                variant="outline"
                className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
                onClick={() => {
                  if (window.confirm(`¿Restablecer contraseñas de TODOS los usuarios a usuario+123?\n\nEjemplo: jcastillo → jcastillo123`)) {
                    resetAllMutation.mutate();
                  }
                }}
                disabled={resetAllMutation.isPending}
              >
                {resetAllMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Resetear todos
              </Button>
            )}
            {/* Botón crear solo para admin */}
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

        {/* Content */}
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
          <Tabs defaultValue="active">
            <TabsList className="mb-4">
              <TabsTrigger value="active">
                Activos <span className="ml-1.5 text-xs text-slate-500">({activeCount})</span>
              </TabsTrigger>
              <TabsTrigger value="inactive">
                Inactivos <span className="ml-1.5 text-xs text-slate-500">({users.length - activeCount})</span>
              </TabsTrigger>
              <TabsTrigger value="all">
                Todos <span className="ml-1.5 text-xs text-slate-500">({users.length})</span>
              </TabsTrigger>
            </TabsList>

            {(["active", "inactive", "all"] as const).map((tab) => {
              const filtered = tab === "all" ? users : users.filter((u) => u.status === tab);
              return (
                <TabsContent key={tab} value={tab}>
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                    {filtered.length === 0 ? (
                      <div className="py-16 text-center">
                        <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">No hay usuarios {tab === "all" ? "" : tab === "active" ? "activos" : "inactivos"}.</p>
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
                                  <span className="text-xs text-slate-600 capitalize">
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
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-slate-400 hover:text-amber-600"
                                      title={`Resetear contraseña → ${u.email.split("@")[0]}123`}
                                      onClick={() => {
                                        if (window.confirm(`¿Restablecer contraseña de "${u.name}"?\nNueva contraseña: ${u.email.split("@")[0]}123`)) {
                                          resetPasswordMutation.mutate(u.id);
                                        }
                                      }}
                                      disabled={resetPasswordMutation.isPending}
                                    >
                                      <KeyRound className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-slate-400 hover:text-blue-600"
                                      onClick={() => setEditTarget(u)}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    {u.id !== currentUser?.id && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
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
        )}
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
