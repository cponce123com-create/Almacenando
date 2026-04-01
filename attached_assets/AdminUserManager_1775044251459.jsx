import { useState, useEffect } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLES = [
  { id: "admin",      label: "Admin",      color: "#7c3aed", bg: "#ede9fe" },
  { id: "supervisor", label: "Supervisor", color: "#0369a1", bg: "#e0f2fe" },
  { id: "operator",   label: "Operador",   color: "#047857", bg: "#d1fae5" },
  { id: "quality",    label: "Calidad",    color: "#b45309", bg: "#fef3c7" },
  { id: "readonly",   label: "Solo lectura",color: "#6b7280", bg: "#f3f4f6" },
];

const PAGES = [
  { id: "dashboard",    label: "Dashboard",           icon: "⬛", group: "Principal" },
  { id: "products",     label: "Productos",           icon: "📦", group: "Inventario" },
  { id: "inventory",    label: "Inventario",          icon: "📊", group: "Inventario" },
  { id: "balances",     label: "Balances",            icon: "⚖️",  group: "Inventario" },
  { id: "cuadre",       label: "Cuadre",              icon: "🔢", group: "Inventario" },
  { id: "immobilized",  label: "Inmovilizados",       icon: "🔒", group: "Inventario" },
  { id: "samples",      label: "Muestras",            icon: "🧪", group: "Calidad" },
  { id: "dye_lots",     label: "Lotes de Tinte",      icon: "🎨", group: "Calidad" },
  { id: "lot_evals",    label: "Evaluaciones de Lote",icon: "📋", group: "Calidad" },
  { id: "disposition",  label: "Disposición Final",   icon: "🗑️",  group: "Calidad" },
  { id: "epp",          label: "EPP",                 icon: "🦺", group: "Seguridad" },
  { id: "personnel",    label: "Personal",            icon: "👷", group: "Seguridad" },
  { id: "documents",    label: "Documentos",          icon: "📄", group: "Archivos" },
  { id: "supplies",     label: "Suministros",         icon: "🛒", group: "Archivos" },
  { id: "surplus",      label: "Excedentes",          icon: "📤", group: "Archivos" },
  { id: "reports",      label: "Reportes",            icon: "📈", group: "Reportes" },
  { id: "notifications",label: "Notificaciones",      icon: "🔔", group: "Sistema" },
  { id: "admin_users",  label: "Gestión de Usuarios", icon: "👥", group: "Sistema" },
];

const ACTIONS = [
  { id: "import", label: "Importar", icon: "⬆️" },
  { id: "export", label: "Exportar", icon: "⬇️" },
  { id: "delete", label: "Eliminar", icon: "🗑️" },
  { id: "edit",   label: "Editar",   icon: "✏️" },
];

// Default permissions per role
const DEFAULT_PERMS = {
  admin:      { pages: PAGES.map(p => p.id), actions: ACTIONS.map(a => a.id) },
  supervisor: { pages: PAGES.filter(p => p.id !== "admin_users").map(p => p.id), actions: ["import","export","delete","edit"] },
  operator:   { pages: ["dashboard","products","inventory","balances","cuadre","immobilized","epp","personnel","supplies","surplus","notifications"], actions: ["edit"] },
  quality:    { pages: ["dashboard","products","samples","dye_lots","lot_evals","disposition","epp","reports","notifications"], actions: ["import","export","edit"] },
  readonly:   { pages: ["dashboard","products","inventory","balances","reports"], actions: [] },
};

// Mock users
const MOCK_USERS = [
  { id: "1", name: "Carlos Mendoza", email: "carlos@almacenando.pe",   role: "admin",      status: "active",   createdAt: "2024-01-15" },
  { id: "2", name: "Ana Torres",     email: "ana@almacenando.pe",      role: "supervisor", status: "active",   createdAt: "2024-02-20" },
  { id: "3", name: "Luis Quispe",    email: "luis@almacenando.pe",     role: "operator",   status: "active",   createdAt: "2024-03-10" },
  { id: "4", name: "María Huanca",   email: "maria@almacenando.pe",    role: "quality",    status: "active",   createdAt: "2024-03-12" },
  { id: "5", name: "Roberto Silva",  email: "roberto@almacenando.pe",  role: "readonly",   status: "inactive", createdAt: "2024-04-01" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleInfo(roleId) {
  return ROLES.find(r => r.id === roleId) || ROLES[4];
}

function groupedPages() {
  const groups = {};
  for (const p of PAGES) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }
  return groups;
}

function initPerms() {
  const p = {};
  for (const role of ROLES) p[role.id] = JSON.parse(JSON.stringify(DEFAULT_PERMS[role.id]));
  return p;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const r = roleInfo(role);
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
      background: r.bg, color: r.color, letterSpacing: "0.03em",
    }}>{r.label}</span>
  );
}

function StatusDot({ status }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12,
      color: status === "active" ? "#047857" : "#6b7280" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%",
        background: status === "active" ? "#10b981" : "#d1d5db",
        display: "inline-block" }} />
      {status === "active" ? "Activo" : "Inactivo"}
    </span>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button onClick={!disabled ? onChange : undefined} style={{
      width: 34, height: 19, borderRadius: 10, border: "none", cursor: disabled ? "not-allowed" : "pointer",
      background: checked ? "#6d28d9" : "#d1d5db", position: "relative",
      transition: "background 0.18s", padding: 0, flexShrink: 0,
      opacity: disabled ? 0.4 : 1,
    }}>
      <span style={{
        position: "absolute", top: 2, left: checked ? 17 : 2,
        width: 15, height: 15, borderRadius: "50%", background: "#fff",
        transition: "left 0.18s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

// ─── Modal: Create / Edit User ────────────────────────────────────────────────

function UserModal({ user, onSave, onClose }) {
  const isNew = !user?.id;
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    role: user?.role || "operator",
    status: user?.status || "active",
    password: "",
  });
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Nombre requerido";
    if (!form.email.match(/^[^@]+@[^@]+\.[^@]+$/)) e.email = "Email inválido";
    if (isNew && form.password.length < 8) e.password = "Mínimo 8 caracteres";
    if (isNew && !form.password.match(/[A-Z]/)) e.password = "Debe incluir una mayúscula";
    if (isNew && !form.password.match(/[0-9]/)) e.password = "Debe incluir un número";
    return e;
  }

  function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...user, ...form, id: user?.id || String(Date.now()) });
  }

  const inp = (field, label, type="text", placeholder="") => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>{label}</label>
      <input
        type={type} value={form[field]} placeholder={placeholder}
        onChange={e => { setForm(f => ({ ...f, [field]: e.target.value })); setErrors(er => ({ ...er, [field]: null })); }}
        style={{
          width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 14,
          border: errors[field] ? "1.5px solid #ef4444" : "1.5px solid #e5e7eb",
          outline: "none", fontFamily: "inherit", color: "#111827", background: "#fff",
        }}
      />
      {errors[field] && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#ef4444" }}>{errors[field]}</p>}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>
            {isNew ? "Nuevo usuario" : "Editar usuario"}
          </h2>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer",
            fontSize: 20, color: "#9ca3af", lineHeight: 1 }}>×</button>
        </div>

        {inp("name", "Nombre completo", "text", "Ej. Juan Pérez")}
        {inp("email", "Correo electrónico", "email", "usuario@empresa.com")}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>Rol</label>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb",
              fontSize: 14, fontFamily: "inherit", color: "#111827", background: "#fff", outline: "none" }}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        {!isNew && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>Estado</label>
            <div style={{ display: "flex", gap: 10 }}>
              {["active","inactive"].map(s => (
                <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                    border: "1.5px solid", borderColor: form.status === s ? "#6d28d9" : "#e5e7eb",
                    background: form.status === s ? "#ede9fe" : "#fff",
                    color: form.status === s ? "#6d28d9" : "#6b7280" }}>
                  {s === "active" ? "Activo" : "Inactivo"}
                </button>
              ))}
            </div>
          </div>
        )}

        {inp("password", isNew ? "Contraseña" : "Nueva contraseña (opcional)", "password", "Mín. 8 chars, 1 mayúscula, 1 número")}

        {isNew && (
          <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8,
            padding: "8px 12px", fontSize: 12, color: "#92400e", marginBottom: 14 }}>
            ⚠️ La contraseña se enviará al usuario por email. Asegúrate de que sea temporal.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1.5px solid #e5e7eb",
            background: "#fff", color: "#374151", fontWeight: 500, fontSize: 14, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleSave} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none",
            background: "#6d28d9", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            {isNew ? "Crear usuario" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Permissions Matrix ───────────────────────────────────────────────────

function PermissionsTab({ perms, setPerms }) {
  const [selectedRole, setSelectedRole] = useState("operator");
  const groups = groupedPages();
  const rp = perms[selectedRole];

  function togglePage(pageId) {
    setPerms(p => {
      const cur = p[selectedRole].pages;
      const next = cur.includes(pageId) ? cur.filter(x => x !== pageId) : [...cur, pageId];
      return { ...p, [selectedRole]: { ...p[selectedRole], pages: next } };
    });
  }

  function toggleAction(actionId) {
    setPerms(p => {
      const cur = p[selectedRole].actions;
      const next = cur.includes(actionId) ? cur.filter(x => x !== actionId) : [...cur, actionId];
      return { ...p, [selectedRole]: { ...p[selectedRole], actions: next } };
    });
  }

  function toggleAllPages(groupPages) {
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

  const ri = roleInfo(selectedRole);

  return (
    <div>
      {/* Role selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {ROLES.map(r => (
          <button key={r.id} onClick={() => setSelectedRole(r.id)} style={{
            padding: "7px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
            border: "2px solid", cursor: "pointer", transition: "all 0.15s",
            borderColor: selectedRole === r.id ? r.color : "#e5e7eb",
            background: selectedRole === r.id ? r.bg : "#fff",
            color: selectedRole === r.id ? r.color : "#6b7280",
          }}>{r.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 20, alignItems: "start" }}>
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
            const someChecked = pages.some(p => rp.pages.includes(p.id));
            return (
              <div key={group} style={{ marginBottom: 14, border: "1px solid #f3f4f6",
                borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 14px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase",
                    letterSpacing: "0.06em" }}>{group}</span>
                  <button onClick={() => toggleAllPages(pages)} style={{
                    fontSize: 11, color: (allChecked || someChecked) ? ri.color : "#9ca3af",
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
        <div style={{ minWidth: 200 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#111827" }}>
            Acciones permitidas
          </h3>
          <div style={{ border: "1px solid #f3f4f6", borderRadius: 10, overflow: "hidden" }}>
            {ACTIONS.map(action => {
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

          <button style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 8,
            background: "#6d28d9", color: "#fff", border: "none", fontWeight: 600,
            fontSize: 13, cursor: "pointer" }}>
            Guardar permisos de {ri.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Users List ───────────────────────────────────────────────────────────

function UsersTab({ users, setUsers, setModal }) {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  function deleteUser(id) {
    setUsers(us => us.filter(u => u.id !== id));
    setConfirmDelete(null);
  }

  function toggleStatus(id) {
    setUsers(us => us.map(u => u.id === id
      ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u));
  }

  function resetPassword(user) {
    alert(`Se enviará un email de reset de contraseña seguro a:\n${user.email}\n\n(En producción: genera token, hash en DB, envía link con TTL de 24h)`);
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o email..."
          style={{ flex: 1, minWidth: 200, padding: "9px 12px", borderRadius: 8, fontSize: 13,
            border: "1.5px solid #e5e7eb", outline: "none", fontFamily: "inherit" }} />
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb",
            fontSize: 13, fontFamily: "inherit", color: "#374151", background: "#fff" }}>
          <option value="all">Todos los roles</option>
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button onClick={() => setModal({ type: "user", user: null })} style={{
          padding: "9px 18px", borderRadius: 8, background: "#6d28d9", color: "#fff",
          border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          + Nuevo usuario
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        {[
          { label: "Total", val: users.length, color: "#6d28d9" },
          { label: "Activos", val: users.filter(u => u.status === "active").length, color: "#047857" },
          { label: "Inactivos", val: users.filter(u => u.status === "inactive").length, color: "#6b7280" },
          { label: "Admins", val: users.filter(u => u.role === "admin").length, color: "#dc2626" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: "#f9fafb", border: "1px solid #f3f4f6",
            borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ border: "1px solid #f3f4f6", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
              {["Usuario", "Rol", "Estado", "Creado", "Acciones"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11,
                  fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((user, i) => (
              <tr key={user.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f9fafb" : "none",
                background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: roleInfo(user.role).bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: roleInfo(user.role).color, flexShrink: 0 }}>
                      {user.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{user.name}</div>
                      <div style={{ color: "#9ca3af", fontSize: 12 }}>{user.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 14px" }}><RoleBadge role={user.role} /></td>
                <td style={{ padding: "12px 14px" }}><StatusDot status={user.status} /></td>
                <td style={{ padding: "12px 14px", color: "#9ca3af" }}>{user.createdAt}</td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setModal({ type: "user", user })}
                      title="Editar" style={actionBtn("#6d28d9")}>✏️</button>
                    <button onClick={() => toggleStatus(user.id)}
                      title={user.status === "active" ? "Desactivar" : "Activar"}
                      style={actionBtn(user.status === "active" ? "#b45309" : "#047857")}>
                      {user.status === "active" ? "⏸" : "▶"}
                    </button>
                    <button onClick={() => resetPassword(user)}
                      title="Resetear contraseña" style={actionBtn("#0369a1")}>🔑</button>
                    <button onClick={() => setConfirmDelete(user)}
                      title="Eliminar" style={actionBtn("#dc2626")}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "#9ca3af" }}>
                No se encontraron usuarios
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, maxWidth: 380, width: "90%" }}>
            <h3 style={{ margin: "0 0 8px", color: "#111827" }}>Eliminar usuario</h3>
            <p style={{ color: "#6b7280", margin: "0 0 20px", fontSize: 14 }}>
              ¿Estás seguro de eliminar a <strong>{confirmDelete.name}</strong>? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: 10, borderRadius: 8,
                border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 500 }}>
                Cancelar
              </button>
              <button onClick={() => deleteUser(confirmDelete.id)} style={{ flex: 1, padding: 10, borderRadius: 8,
                border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function actionBtn(color) {
  return {
    padding: "5px 8px", borderRadius: 6, border: `1px solid ${color}20`,
    background: `${color}10`, color, cursor: "pointer", fontSize: 14,
    transition: "all 0.1s",
  };
}

// ─── Root Component ────────────────────────────────────────────────────────────

export default function AdminUserManager() {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState(MOCK_USERS);
  const [perms, setPerms] = useState(initPerms());
  const [modal, setModal] = useState(null);

  function saveUser(updatedUser) {
    setUsers(us => {
      const exists = us.find(u => u.id === updatedUser.id);
      if (exists) return us.map(u => u.id === updatedUser.id ? updatedUser : u);
      return [...us, { ...updatedUser, createdAt: new Date().toISOString().split("T")[0] }];
    });
    setModal(null);
  }

  return (
    <div style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif", maxWidth: 1100,
      margin: "0 auto", padding: "24px 20px", color: "#111827" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#111827" }}>
          Gestión de usuarios
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
          Administra usuarios, roles y permisos por módulo
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24,
        borderBottom: "2px solid #f3f4f6", paddingBottom: 0 }}>
        {[
          { id: "users",       label: "👥 Usuarios" },
          { id: "permissions", label: "🔐 Permisos por rol" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
            fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? "#6d28d9" : "#6b7280",
            borderBottom: tab === t.id ? "2px solid #6d28d9" : "2px solid transparent",
            marginBottom: -2, transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      {tab === "users" && (
        <UsersTab users={users} setUsers={setUsers} setModal={setModal} />
      )}
      {tab === "permissions" && (
        <PermissionsTab perms={perms} setPerms={setPerms} />
      )}

      {/* Modal */}
      {modal?.type === "user" && (
        <UserModal user={modal.user} onSave={saveUser} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
