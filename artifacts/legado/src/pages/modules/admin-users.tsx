import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth, getAuthHeaders, ROLE_LABELS, ROLE_COLORS } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { Settings, Plus, Edit2, Trash2, Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { clsx } from "clsx";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

interface CreateUserForm {
  email: string;
  name: string;
  password: string;
  role: string;
}

interface EditUserForm {
  name: string;
  email: string;
  role: string;
  status: string;
}

export default function AdministracióndeUsuariosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: "",
    name: "",
    password: "",
    role: "operator",
  });

  const [editForm, setEditForm] = useState<EditUserForm>({
    name: "",
    email: "",
    role: "operator",
    status: "active",
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/users", {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        toast({ title: "Error", description: "No se pudieron cargar los usuarios", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al cargar usuarios", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.name || !createForm.password) {
      toast({ title: "Error", description: "Completa todos los campos", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      if (response.ok) {
        const newUser = await response.json();
        setUsers([...users, newUser]);
        setCreateForm({ email: "", name: "", password: "", role: "operator" });
        setShowCreateDialog(false);
        toast({ title: "Éxito", description: "Usuario creado correctamente" });
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "No se pudo crear el usuario", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al crear usuario", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser || !editForm.name || !editForm.email) {
      toast({ title: "Error", description: "Completa todos los campos", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        const updatedUser = await response.json();
        setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
        setShowEditDialog(false);
        setSelectedUser(null);
        toast({ title: "Éxito", description: "Usuario actualizado correctamente" });
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "No se pudo actualizar el usuario", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al actualizar usuario", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        setUsers(users.filter(u => u.id !== selectedUser.id));
        setShowDeleteDialog(false);
        setSelectedUser(null);
        toast({ title: "Éxito", description: "Usuario eliminado correctamente" });
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "No se pudo eliminar el usuario", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al eliminar usuario", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setGeneratedPassword(data.temporaryPassword);
        toast({ title: "Éxito", description: "Contraseña temporal generada" });
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "No se pudo generar la contraseña", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Error al generar contraseña", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const openEditDialog = (u: User) => {
    setSelectedUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (u: User) => {
    setSelectedUser(u);
    setShowDeleteDialog(true);
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isAdmin = user?.role === "admin";

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Settings className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Administración de Usuarios</h1>
              <p className="text-slate-500 text-sm">Gestiona los usuarios y permisos del sistema</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Nuevo Usuario
            </Button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-6">
          <div className="mb-6">
            <Input
              placeholder="Buscar por nombre o correo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No hay usuarios disponibles</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <span className={clsx("text-xs px-2.5 py-1 rounded-full font-medium", ROLE_COLORS[u.role as keyof typeof ROLE_COLORS])}>
                          {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={clsx("text-xs px-2.5 py-1 rounded-full font-medium", u.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                          {u.status === "active" ? "Activo" : "Inactivo"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString("es-PE")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isAdmin && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResetPassword(u.id)}
                                disabled={isSubmitting}
                                title="Generar contraseña temporal"
                              >
                                <AlertCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(u)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              {u.id !== user?.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openDeleteDialog(u)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Dialog para crear usuario */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nuevo Usuario</DialogTitle>
            <DialogDescription>Completa los datos para crear un nuevo usuario del sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Nombre</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Nombre completo"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Correo</label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Contraseña</label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Rol</label>
              <Select value={createForm.role} onValueChange={(value) => setCreateForm({ ...createForm, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operario</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="quality">Calidad</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="readonly">Solo Lectura</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateUser} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Crear Usuario
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para editar usuario */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>Actualiza los datos del usuario</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Nombre</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Nombre completo"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Correo</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Rol</label>
              <Select value={editForm.role} onValueChange={(value) => setEditForm({ ...editForm, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operario</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="quality">Calidad</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="readonly">Solo Lectura</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Estado</label>
              <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleEditUser} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Guardar Cambios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para confirmar eliminación */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar a {selectedUser?.name}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} disabled={isSubmitting} className="bg-red-600 hover:bg-red-700">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para mostrar contraseña temporal */}
      <Dialog open={!!generatedPassword} onOpenChange={(open) => !open && setGeneratedPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contraseña Temporal Generada</DialogTitle>
            <DialogDescription>Copia esta contraseña y comparte con el usuario</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <code className="text-lg font-mono font-bold text-slate-900">{generatedPassword}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(generatedPassword!)}
                >
                  {copiedPassword ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p>El usuario debe cambiar esta contraseña en su primer inicio de sesión.</p>
            </div>
            <Button onClick={() => setGeneratedPassword(null)} className="w-full">
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
