import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useActivation, useMutateActivation } from "@/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2, ShieldCheck, Info } from "lucide-react";
import { useForm, Controller } from "react-hook-form";

export default function ActivationSettings() {
  const { data: settings, isLoading } = useActivation();
  const updateMutation = useMutateActivation();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: { minConfirmations: 1, adminReviewRequired: true }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        minConfirmations: settings.minConfirmations,
        adminReviewRequired: settings.adminReviewRequired
      });
    }
  }, [settings, form]);

  const onSubmit = async (values: any) => {
    try {
      await updateMutation.mutateAsync({ data: {
        minConfirmations: parseInt(values.minConfirmations.toString()),
        adminReviewRequired: values.adminReviewRequired
      }});
      toast({ title: "Configuración actualizada" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (isLoading) return <AppLayout><div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-3xl font-bold text-foreground flex items-center gap-3 mb-2">
          <Settings className="w-8 h-8 text-primary" /> Configuración de Activación
        </h1>
        <p className="text-muted-foreground mb-8">
          Define las reglas exactas de cómo y cuándo se liberará tu legado.
        </p>

        <div className="grid gap-6">
          <Card className="border-l-4 border-l-primary shadow-md">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-full shrink-0">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">Estado del Sistema: 
                    <span className={`ml-2 uppercase text-sm px-2 py-1 rounded-full ${
                      settings?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {settings?.status}
                    </span>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Tu sistema está activo. Tus contactos de confianza tienen los enlaces necesarios para reportar el evento cuando sea el momento adecuado.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card className="shadow-lg border-border/50">
              <CardContent className="p-6 sm:p-8 space-y-8">
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-bold">Confirmaciones Requeridas</Label>
                    <p className="text-sm text-muted-foreground mb-3">¿Cuántos contactos de confianza deben confirmar independientemente para activar la liberación?</p>
                  </div>
                  <Controller
                    control={form.control}
                    name="minConfirmations"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value.toString()}>
                        <SelectTrigger className="w-full sm:w-[200px] h-12 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 Contacto</SelectItem>
                          <SelectItem value="2">2 Contactos</SelectItem>
                          <SelectItem value="3">3 Contactos</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="pt-6 border-t border-border"></div>

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label className="text-base font-bold">Revisión de Seguridad (Administrador)</Label>
                    <p className="text-sm text-muted-foreground max-w-lg">
                      Añade una capa extra de seguridad. Nuestro equipo verificará la autenticidad del reporte antes de enviar cualquier mensaje. (Recomendado)
                    </p>
                  </div>
                  <Controller
                    control={form.control}
                    name="adminReviewRequired"
                    render={({ field }) => (
                      <Switch 
                        checked={field.value} 
                        onCheckedChange={field.onChange} 
                        className="data-[state=checked]:bg-primary"
                      />
                    )}
                  />
                </div>

                <div className="pt-6 flex justify-end">
                  <Button type="submit" className="rounded-xl h-12 px-8" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar Reglas"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
