import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useRecipients, useCreateRecip, useUpdateRecip, useDeleteRecip } from "@/hooks/use-contacts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Users, Plus, Pencil, Trash2, Loader2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const recipSchema = z.object({
  fullName: z.string().min(2, "Requerido"),
  email: z.string().email("Inválido"),
  phone: z.string().optional(),
  relationship: z.string().min(2, "Requerido"),
});

export default function Recipients() {
  const { data: recipients, isLoading } = useRecipients();
  const createMutation = useCreateRecip();
  const updateMutation = useUpdateRecip();
  const deleteMutation = useDeleteRecip();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof recipSchema>>({
    resolver: zodResolver(recipSchema),
    defaultValues: { fullName: "", email: "", phone: "", relationship: "" }
  });

  const openEdit = (recip: any) => {
    setEditingId(recip.id);
    form.reset(recip);
    setIsOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    form.reset({ fullName: "", email: "", phone: "", relationship: "" });
    setIsOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof recipSchema>) => {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: values });
        toast({ title: "Destinatario actualizado" });
      } else {
        await createMutation.mutateAsync({ data: values });
        toast({ title: "Destinatario añadido" });
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
          <h1 className="font-serif text-3xl font-bold text-foreground">Destinatarios</h1>
          <p className="text-muted-foreground mt-2">Las personas que recibirán tus mensajes y legados.</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl shadow-md gap-2" onClick={openNew}>
              <Plus className="w-4 h-4" /> Añadir Destinatario
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">{editingId ? 'Editar Destinatario' : 'Nuevo Destinatario'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Nombre Completo</Label>
                <Input {...form.register("fullName")} className="rounded-xl h-11" placeholder="Ej: María Gómez" />
                {form.formState.errors.fullName && <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Correo Electrónico</Label>
                <Input type="email" {...form.register("email")} className="rounded-xl h-11" placeholder="maria@ejemplo.com" />
                {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Relación</Label>
                <Input {...form.register("relationship")} className="rounded-xl h-11" placeholder="Ej: Hija, Hermano, Amigo" />
              </div>
              <div className="space-y-2">
                <Label>Teléfono (opcional)</Label>
                <Input {...form.register("phone")} className="rounded-xl h-11" placeholder="+1 234..." />
              </div>
              <Button type="submit" className="w-full rounded-xl h-11 mt-4" disabled={isPending}>
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : recipients?.length === 0 ? (
         <Card className="border-dashed bg-secondary/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Sin destinatarios</h3>
            <p className="text-muted-foreground max-w-md mb-6">Añade a las personas que quieres que reciban tus mensajes.</p>
            <Button onClick={openNew}>Añadir Destinatario</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipients?.map(recip => (
            <Card key={recip.id} className="hover:shadow-lg transition-all border-border/50">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {recip.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(recip)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => {
                      if(confirm('¿Eliminar destinatario?')) deleteMutation.mutate({id: recip.id});
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-bold text-lg text-foreground truncate">{recip.fullName}</h3>
                <p className="text-primary font-medium text-sm mb-3">{recip.relationship}</p>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Mail className="w-4 h-4 mr-2 shrink-0" />
                  <span className="truncate">{recip.email}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
