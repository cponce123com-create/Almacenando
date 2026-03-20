import { useRoute } from "wouter";
import { useGetRecipientAccess } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { FileVideo, Mail, Mic, Image as ImageIcon, FileText, Heart, LockKeyhole } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const typeIcons: Record<string, any> = {
  video: FileVideo,
  letter: Mail,
  audio: Mic,
  photo: ImageIcon,
  document: FileText,
};

export default function AccessPortal() {
  const [match, params] = useRoute("/access/:token");
  const token = params?.token || "";
  
  const { data, isLoading, error } = useGetRecipientAccess(token, {
    query: { retry: false }
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-900">
      <Heart className="w-10 h-10 animate-pulse text-rose-500" />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 p-6">
      <LockKeyhole className="w-12 h-12 mb-4 opacity-50" />
      <h2 className="text-xl font-serif text-zinc-200 mb-2">Enlace no válido o expirado</h2>
      <p className="text-center max-w-md">Este enlace de acceso seguro no es válido. Si crees que es un error, por favor contacta al equipo de soporte de Legado.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 pb-20">
      <header className="bg-white border-b border-zinc-200 py-6 px-6 text-center">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <div className="w-12 h-12 bg-zinc-900 text-white rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-zinc-200">
            <Heart className="w-6 h-6 text-rose-400 fill-current" />
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Un mensaje para ti</h1>
          <p className="text-zinc-500 mt-2">Hola {data.recipient.fullName}, {data.deceasedName} ha dejado esto para ti.</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-12">
        {data.deceasedIntroMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 text-center"
          >
            <p className="font-serif text-xl md:text-2xl text-zinc-700 italic leading-relaxed">
              "{data.deceasedIntroMessage}"
            </p>
          </motion.div>
        )}

        <div className="space-y-6">
          {data.items.map((item, i) => {
            const Icon = typeIcons[item.type] || FileText;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 + 0.3 }}
              >
                <Card className="overflow-hidden border-zinc-200 shadow-sm hover:shadow-md transition-shadow bg-white rounded-2xl">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-serif text-xl font-bold">{item.title}</h3>
                        <p className="text-sm text-zinc-500 capitalize">{item.type}</p>
                      </div>
                    </div>
                    
                    {item.description && (
                      <p className="text-zinc-600 mb-6">{item.description}</p>
                    )}

                    {item.contentText && (
                      <div className="bg-zinc-50 rounded-xl p-6 border border-zinc-100">
                        <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-zinc-800">
                          {item.contentText}
                        </p>
                      </div>
                    )}

                    {item.mediaUrl && (
                      <div className="mt-6">
                        <a href={item.mediaUrl} target="_blank" rel="noreferrer">
                          <Button className="w-full sm:w-auto rounded-xl bg-zinc-900 text-white hover:bg-zinc-800">
                            Ver Archivo Adjunto
                          </Button>
                        </a>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
