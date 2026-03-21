import { useState } from "react";
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
import { ShieldCheck, Plus, Pencil, Trash2, Loader2, Mail, ShieldAlert, BadgeCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const contactSchema = z.object({
  fullName: z.string().min(2, "Requerido"),
  email: z.string().email("Correo inválido"),
  phone: z.string().optional(),
  relationship: z.string().min(2, "Requerido"),
  dni: z.string().min(6, "DNI requerido (mínimo 6 caracteres)"),
});

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
    </AppLayout>
  );
}
