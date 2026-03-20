import { AppLayout } from "@/components/layout/AppLayout";
import { useLegacy, useDeleteLegacy } from "@/hooks/use-legacy";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  FileVideo, Mail, Mic, Image as ImageIcon, FileText, Flower2,
  MoreVertical, Pencil, Trash2, Loader2, Plus
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const typeIcons: Record<string, any> = {
  video: FileVideo,
  letter: Mail,
  audio: Mic,
  photo: ImageIcon,
  document: FileText,
  funeral_note: Flower2,
};

const typeLabels: Record<string, string> = {
  video: "Video",
  letter: "Carta",
  audio: "Audio",
  photo: "Foto",
  document: "Documento",
  funeral_note: "Nota Funeraria",
};

export default function LegacyList() {
  const { data: items, isLoading } = useLegacy();
  const deleteMutation = useDeleteLegacy();

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Mi Legado</h1>
          <p className="text-muted-foreground mt-2">Gestiona los mensajes y documentos que dejarás atrás.</p>
        </div>
        <Link href="/legacy/new">
          <Button className="rounded-xl shadow-md gap-2">
            <Plus className="w-4 h-4" /> Nuevo Elemento
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : items?.length === 0 ? (
        <Card className="border-dashed bg-secondary/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Archive className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Aún no hay elementos</h3>
            <p className="text-muted-foreground max-w-md mb-6">Comienza a crear tu legado agregando videos, cartas o documentos para tus seres queridos.</p>
            <Link href="/legacy/new">
              <Button>Crear mi primer mensaje</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {items?.map((item) => {
            const Icon = typeIcons[item.type] || FileText;
            return (
              <Card key={item.id} className="group hover:shadow-xl hover:border-primary/30 transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        item.status === 'active' ? 'bg-green-100 text-green-700' : 
                        item.status === 'draft' ? 'bg-amber-100 text-amber-700' : 
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {item.status === 'active' ? 'Activo' : item.status === 'draft' ? 'Borrador' : 'Archivado'}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <Link href={`/legacy/${item.id}`}>
                            <DropdownMenuItem className="cursor-pointer">
                              <Pencil className="w-4 h-4 mr-2" /> Editar
                            </DropdownMenuItem>
                          </Link>
                          <DropdownMenuItem 
                            className="text-destructive cursor-pointer focus:text-destructive"
                            onClick={() => {
                              if(confirm('¿Seguro que deseas eliminar este elemento?')) {
                                deleteMutation.mutate({ id: item.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-lg text-foreground mb-1 line-clamp-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{typeLabels[item.type]}</p>
                  
                  {item.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{item.description}</p>
                  )}
                  
                  <div className="mt-auto pt-4 border-t border-border flex justify-between items-center text-xs text-muted-foreground">
                    <span>Modificado {format(new Date(item.updatedAt), "d MMM yyyy", { locale: es })}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}

// Dummy Archive component since it wasn't imported from lucide
function Archive(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="5" x="2" y="4" rx="2"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>;
}
