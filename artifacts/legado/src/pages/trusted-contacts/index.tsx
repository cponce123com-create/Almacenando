import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useTrustedContacts, useCreateContact, useUpdateContact, useDeleteContact } from "@/hooks/use-contacts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  ShieldCheck, Plus, Pencil, Trash2, Loader2, Mail, ShieldAlert, BadgeCheck,
  Key, Send, HelpCircle, Eye, EyeOff, CheckCircle2, Trash, Lock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const contactSchema = z.object({
  fullName: z.string().min(2, "Requerido"),
  email: z.string().email("Correo inválido"),
  phone: z.string().optional(),
  relationship: z.string().min(2, "Requerido"),
  dni: z.string().min(6, "DNI requerido (mínimo 6 caracteres)"),
});

type KeyMode = "email" | "question" | null;

export default function TrustedContacts() {
  const { data: contacts, isLoading } = useTrustedContacts();
  const createMutation = useCreateContact();
  const updateMutation = useUpdateContact();
  const deleteMutation = useDeleteContact();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: { fullName: "", email: "", phone: "", relationship: "", dni: "" },
  });

  const openEdit = (contact: any) => {
    setEditingId(contact.id);
    form.reset({
      fullName: contact.fullName,
      email: contact.email,
      phone: contact.phone || "",
      relationship: contact.relationship,
      dni: contact.dni || "",
    });
    setIsOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    form.reset({ fullName: "", email: "", phone: "", relationship: "", dni: "" });
    setIsOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof contactSchema>) => {
    try {
      const payload = { ...values, dni: values.dni.toUpperCase() };
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: payload });
        toast({ title: "Contacto actualizado" });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: "Contacto añadido" });
      }
      setIsOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ─── Clave de cifrado state ───────────────────────────────────────────────
  const [keyMode, setKeyMode] = useState<KeyMode>(null);
  const [showKey, setShowKey] = useState(false);
  const [encKey, setEncKey] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);

  const [secretQuestion, setSecretQuestion] = useState("");
  const [secretAnswer, setSecretAnswer] = useState("");
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [keyConfig, setKeyConfig] = useState<{ hasSecretQuestion: boolean; secretQuestion: string | null; hasStoredKey: boolean } | null>(null);

  const apiBase = "/api";
  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("legado_token")}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    const stored = sessionStorage.getItem("legado_enc_key");
    if (stored) setEncKey(stored);
    fetchKeyConfig();
  }, []);

  const fetchKeyConfig = async () => {
    try {
      const res = await fetch(`${apiBase}/key-config`, { headers: authHeader() });
      if (res.ok) setKeyConfig(await res.json());
    } catch {}
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSendEmail = async () => {
    if (!encKey) {
      toast({ variant: "destructive", title: "Ingresa la clave de cifrado primero" });
      return;
    }
    if (selectedContactIds.length === 0) {
      toast({ variant: "destructive", title: "Selecciona al menos un contacto" });
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch(`${apiBase}/key-config/send-email`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ encryptionKey: encKey, contactIds: selectedContactIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const sent = data.results.filter((r: any) => r.ok).length;
      toast({ title: `Clave enviada a ${sent} contacto(s)` });
      setSelectedContactIds([]);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error al enviar", description: e.message });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSaveQuestion = async () => {
    if (!encKey) {
      toast({ variant: "destructive", title: "Necesitas ingresar tu clave de cifrado" });
      return;
    }
    if (secretQuestion.trim().length < 5) {
      toast({ variant: "destructive", title: "La pregunta es demasiado corta" });
      return;
    }
    const words = secretAnswer.trim().split(/\s+/);
    if (words.length !== 1 || words[0].length === 0) {
      toast({ variant: "destructive", title: "La respuesta debe ser exactamente una palabra" });
      return;
    }
    setSavingQuestion(true);
    try {
      const res = await fetch(`${apiBase}/key-config/secret-question`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({
          secretQuestion: secretQuestion.trim(),
          secretAnswer: secretAnswer.trim().toLowerCase(),
          encryptionKey: encKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Pregunta secreta guardada" });
      setSecretQuestion("");
      setSecretAnswer("");
      await fetchKeyConfig();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!confirm("¿Eliminar la pregunta secreta? Los destinatarios ya no podrán desbloquear por esta vía.")) return;
    try {
      const res = await fetch(`${apiBase}/key-config/secret-question`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Pregunta secreta eliminada" });
      await fetchKeyConfig();
    } catch {
      toast({ variant: "destructive", title: "Error al eliminar" });
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-primary" /> Contactos de Confianza
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Estas personas serán responsables de reportar tu partida. Su DNI es necesario para verificar su identidad al activar el legado.
          </p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl shadow-md gap-2" onClick={openNew}>
              <Plus className="w-4 h-4" /> Añadir Contacto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[440px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">
                {editingId ? "Editar Contacto" : "Nuevo Contacto de Confianza"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Nombre Completo</Label>
                <Input
                  {...form.register("fullName")}
                  className="rounded-xl h-11"
                  placeholder="Ej: Roberto Sánchez"
                />
                {form.formState.errors.fullName && (
                  <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <BadgeCheck className="w-4 h-4 text-violet-500" />
                  DNI / Documento de Identidad <span className="text-red-500">*</span>
                </Label>
                <Input
                  {...form.register("dni")}
                  className="rounded-xl h-11 uppercase tracking-widest"
                  placeholder="Ej: 12345678A"
                  onChange={(e) => form.setValue("dni", e.target.value.toUpperCase())}
                />
                {form.formState.errors.dni && (
                  <p className="text-xs text-destructive">{form.formState.errors.dni.message}</p>
                )}
                <p className="text-xs text-gray-400">
                  El DNI se usará para verificar la identidad al reportar el fallecimiento.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Correo Electrónico</Label>
                <Input
                  type="email"
                  {...form.register("email")}
                  className="rounded-xl h-11"
                  placeholder="roberto@ejemplo.com"
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Teléfono (opcional)</Label>
                <Input
                  {...form.register("phone")}
                  className="rounded-xl h-11"
                  placeholder="+34 600 000 000"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Relación</Label>
                <Input
                  {...form.register("relationship")}
                  className="rounded-xl h-11"
                  placeholder="Ej: Abogado, Esposo, Hermana"
                />
                {form.formState.errors.relationship && (
                  <p className="text-xs text-destructive">{form.formState.errors.relationship.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full rounded-xl h-11 mt-2" disabled={isPending}>
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar contacto"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : contacts?.length === 0 ? (
        <Card className="border-dashed bg-secondary/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <ShieldAlert className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">No tienes guardianes asignados</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              El sistema de entrega no podrá activarse hasta que asignes al menos un contacto de confianza.
            </p>
            <Button onClick={openNew}>Asignar mi primer contacto</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contacts?.map((contact) => (
            <Card key={contact.id} className="hover:shadow-lg transition-all border-border/50">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold text-lg border border-violet-100">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => openEdit(contact)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm("¿Eliminar contacto de confianza?"))
                          deleteMutation.mutate({ id: contact.id });
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-bold text-lg text-foreground truncate">{contact.fullName}</h3>
                <p className="text-primary font-medium text-sm mb-1">{contact.relationship}</p>
                {contact.dni && (
                  <div className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 rounded-lg px-2 py-1 w-fit mb-2">
                    <BadgeCheck className="w-3 h-3" />
                    <span className="font-mono tracking-wider">{contact.dni}</span>
                  </div>
                )}
                <div className="flex items-center text-sm text-muted-foreground mb-3">
                  <Mail className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </div>
                <div className="pt-3 border-t border-border">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      contact.inviteStatus === "accepted"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {contact.inviteStatus === "accepted" ? "Aceptado" : "Invitación pendiente"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Clave de cifrado ─────────────────────────────────────────────────── */}
      <div className="mt-12">
        <div className="flex items-center gap-3 mb-2">
          <Key className="w-6 h-6 text-violet-600" />
          <h2 className="font-serif text-2xl font-bold text-foreground">Clave de Descifrado</h2>
        </div>
        <p className="text-muted-foreground text-sm mb-6 max-w-2xl">
          Tus archivos están cifrados. Para que tus seres queridos puedan acceder a ellos cuando llegue el momento,
          decide cómo deseas entregar la clave de descifrado.
        </p>

        {/* Campo de clave actual */}
        <Card className="border border-violet-100 bg-violet-50/30 mb-6">
          <CardContent className="p-5">
            <Label className="text-sm font-semibold text-violet-800 mb-2 block">Tu clave de cifrado actual</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={encKey}
                  onChange={(e) => setEncKey(e.target.value)}
                  className="rounded-xl h-11 font-mono text-sm pr-10"
                  placeholder="Pega aquí tu clave base64..."
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Esta es la clave que usas al subir archivos cifrados. Sin ella, nadie podrá abrir tu legado.
            </p>
          </CardContent>
        </Card>

        {/* Opciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            type="button"
            onClick={() => setKeyMode(keyMode === "email" ? null : "email")}
            className={`text-left rounded-2xl border-2 p-5 transition-all ${
              keyMode === "email"
                ? "border-violet-500 bg-violet-50"
                : "border-border bg-card hover:border-violet-300"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${keyMode === "email" ? "bg-violet-100" : "bg-secondary"}`}>
                <Send className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Enviar por correo</p>
                <p className="text-xs text-muted-foreground">A tus contactos de confianza</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              La clave se envía directamente por correo electrónico a las personas que elijas de tu lista.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setKeyMode(keyMode === "question" ? null : "question")}
            className={`text-left rounded-2xl border-2 p-5 transition-all ${
              keyMode === "question"
                ? "border-violet-500 bg-violet-50"
                : "border-border bg-card hover:border-violet-300"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${keyMode === "question" ? "bg-violet-100" : "bg-secondary"}`}>
                <HelpCircle className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Pregunta secreta</p>
                <p className="text-xs text-muted-foreground">Que solo tú y él/ella saben</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              El destinatario responde una pregunta que solo los dos conocen para desbloquear el legado.
            </p>
          </button>
        </div>

        {/* Panel: Enviar por correo */}
        {keyMode === "email" && (
          <Card className="border border-violet-200">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Send className="w-4 h-4 text-violet-600" />
                Selecciona los contactos que recibirán la clave
              </h3>
              {contacts && contacts.length > 0 ? (
                <div className="space-y-2">
                  {contacts.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedContactIds.includes(c.id)
                          ? "border-violet-400 bg-violet-50"
                          : "border-border hover:border-violet-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedContactIds.includes(c.id)}
                        onChange={() => toggleContact(c.id)}
                        className="w-4 h-4 accent-violet-600"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground">{c.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                      </div>
                      {selectedContactIds.includes(c.id) && (
                        <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0" />
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tienes contactos añadidos aún.</p>
              )}
              <Button
                onClick={handleSendEmail}
                disabled={sendingEmail || selectedContactIds.length === 0 || !encKey}
                className="w-full rounded-xl h-11 bg-violet-600 hover:bg-violet-700 text-white"
              >
                {sendingEmail ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Mail className="w-4 h-4 mr-2" /> Enviar clave por correo</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Panel: Pregunta secreta */}
        {keyMode === "question" && (
          <Card className="border border-violet-200">
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-violet-600" />
                Configura la pregunta secreta
              </h3>

              {keyConfig?.hasSecretQuestion && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-green-800 text-sm">Pregunta secreta activa</p>
                    <p className="text-green-700 text-sm mt-0.5 italic">"{keyConfig.secretQuestion}"</p>
                    <p className="text-xs text-green-600 mt-1">
                      Los destinatarios podrán desbloquear el legado respondiendo esta pregunta.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-400 hover:text-red-600"
                    onClick={handleDeleteQuestion}
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Pregunta secreta</Label>
                <Input
                  value={secretQuestion}
                  onChange={(e) => setSecretQuestion(e.target.value)}
                  className="rounded-xl h-11"
                  placeholder="Ej: ¿Cuál es el nombre de nuestro lugar secreto?"
                />
                <p className="text-xs text-muted-foreground">
                  Debe ser algo que solo tú y tu ser querido sepan. No la olvides.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-violet-500" />
                  Respuesta (exactamente una palabra)
                </Label>
                <Input
                  value={secretAnswer}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\s/g, "");
                    setSecretAnswer(v);
                  }}
                  className="rounded-xl h-11 font-medium"
                  placeholder="Ej: Varadero"
                  maxLength={30}
                />
                <p className="text-xs text-muted-foreground">
                  Solo una palabra, sin espacios. La respuesta no distingue mayúsculas ni minúsculas.
                </p>
              </div>

              <Button
                onClick={handleSaveQuestion}
                disabled={savingQuestion || !secretQuestion || !secretAnswer || !encKey}
                className="w-full rounded-xl h-11 bg-violet-600 hover:bg-violet-700 text-white"
              >
                {savingQuestion ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><HelpCircle className="w-4 h-4 mr-2" /> Guardar pregunta secreta</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
