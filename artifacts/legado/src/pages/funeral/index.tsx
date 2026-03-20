import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useFuneralPrefs, useMutateFuneralPrefs } from "@/hooks/use-settings";
import { useForm } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Flower2, Loader2, Save } from "lucide-react";

export default function FuneralPreferences() {
  const { data: prefs, isLoading } = useFuneralPrefs();
  const updateMutation = useMutateFuneralPrefs();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      burialType: "", ceremonyType: "", musicNotes: "", 
      dressCode: "", guestNotes: "", locationNotes: "", additionalNotes: ""
    }
  });

  useEffect(() => {
    if (prefs) {
      form.reset({
        burialType: prefs.burialType || "",
        ceremonyType: prefs.ceremonyType || "",
        musicNotes: prefs.musicNotes || "",
        dressCode: prefs.dressCode || "",
        guestNotes: prefs.guestNotes || "",
        locationNotes: prefs.locationNotes || "",
        additionalNotes: prefs.additionalNotes || ""
      });
    }
  }, [prefs, form]);

  const onSubmit = async (values: any) => {
    try {
      await updateMutation.mutateAsync({ data: values });
      toast({ title: "Preferencias guardadas exitosamente" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (isLoading) return <AppLayout><div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <h1 className="font-serif text-3xl font-bold text-foreground flex items-center gap-3 mb-2">
          <Flower2 className="w-8 h-8 text-primary" /> Preferencias Funerarias
        </h1>
        <p className="text-muted-foreground mb-8">
          Asegúrate de que tus últimos deseos sean conocidos. Esta información estará disponible para tus contactos de confianza de forma inmediata.
        </p>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="shadow-lg border-border/50">
            <CardContent className="p-6 sm:p-8 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Tipo de Disposición</Label>
                  <Input {...form.register("burialType")} className="h-12 rounded-xl" placeholder="Ej: Cremación, Entierro tradicional..." />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Ceremonia</Label>
                  <Input {...form.register("ceremonyType")} className="h-12 rounded-xl" placeholder="Ej: Íntima, Religiosa, Celebración de vida..." />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ubicación Deseada</Label>
                <Input {...form.register("locationNotes")} className="h-12 rounded-xl" placeholder="Ej: Iglesia principal, Esparcir cenizas en el mar..." />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Música</Label>
                  <Textarea {...form.register("musicNotes")} className="rounded-xl min-h-[100px]" placeholder="Canciones que te gustaría que sonaran..." />
                </div>
                <div className="space-y-2">
                  <Label>Código de Vestimenta</Label>
                  <Textarea {...form.register("dressCode")} className="rounded-xl min-h-[100px]" placeholder="Ej: Ropa colorida, formal..." />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Invitados y Personas Especiales</Label>
                <Textarea {...form.register("guestNotes")} className="rounded-xl min-h-[100px]" placeholder="Notas sobre a quién avisar primero, personas específicas que deben asistir..." />
              </div>

              <div className="space-y-2">
                <Label>Notas Adicionales</Label>
                <Textarea {...form.register("additionalNotes")} className="rounded-xl min-h-[150px]" placeholder="Cualquier otro deseo, lectura específica, o petición especial..." />
              </div>

            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" className="rounded-xl h-12 px-8 shadow-lg shadow-primary/20" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2"/> Guardar Preferencias</>}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
