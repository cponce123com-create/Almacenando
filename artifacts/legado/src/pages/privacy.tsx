import { Link } from "wouter";
import { Heart } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-violet-700 font-serif text-xl font-bold">
            <Heart className="w-5 h-5 fill-current text-rose-400" />
            Legado
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <h1 className="font-serif text-4xl font-bold text-foreground mb-2">Política de Privacidad</h1>
        <p className="text-muted-foreground mb-10">Última actualización: enero de 2025</p>

        <div className="prose prose-zinc prose-violet max-w-none space-y-8 text-zinc-700 leading-relaxed">
          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">1. Datos que recopilamos</h2>
            <p>
              Legado recopila los datos que tú nos proporcionas voluntariamente al registrarte y usar la plataforma: nombre completo, dirección de correo electrónico, documento de identidad (DNI), y los archivos multimedia (videos, fotos, audios, documentos y cartas) que decides almacenar en tu legado digital.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">2. Cifrado y seguridad</h2>
            <p>
              Todos los archivos que subes a Legado son cifrados en tu dispositivo con AES-256-GCM antes de ser transmitidos a nuestros servidores. Esto significa que <strong>solo tú y las personas a quienes hayas designado como destinatarios tienen acceso al contenido de tus archivos</strong>. Legado no tiene acceso a tus archivos descifrados.
            </p>
            <p>
              Los archivos cifrados se almacenan en Cloudinary, un servicio de almacenamiento en la nube con certificaciones de seguridad de nivel empresarial. La clave de descifrado nunca se almacena en nuestros servidores.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">3. Uso de tus datos</h2>
            <p>Usamos tus datos exclusivamente para:</p>
            <ul className="list-disc list-inside space-y-1 mt-2 pl-2">
              <li>Operar y mejorar la plataforma Legado.</li>
              <li>Enviar notificaciones relacionadas con tu cuenta y tu legado.</li>
              <li>Verificar la identidad de tus contactos de confianza mediante DNI.</li>
              <li>Entregar tu legado a tus destinatarios cuando se cumplan las condiciones de activación.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">4. No venta de datos</h2>
            <p>
              <strong>Legado nunca vende, alquila ni comparte tus datos personales con terceros con fines comerciales.</strong> Tus datos son tuyos y los tratamos con la máxima confidencialidad.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">5. Retención y eliminación</h2>
            <p>
              Tus datos y archivos se conservan mientras tu cuenta esté activa. Si deseas eliminar tu cuenta y todos tus datos, puedes solicitarlo en cualquier momento escribiéndonos a <a href="mailto:privacidad@legadoapp.com" className="text-violet-600 hover:underline">privacidad@legadoapp.com</a>. Procesaremos tu solicitud en un plazo máximo de 30 días.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">6. Cookies</h2>
            <p>
              Legado utiliza únicamente cookies de sesión estrictamente necesarias para el funcionamiento de la plataforma. No usamos cookies de seguimiento ni publicidad de terceros.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">7. Contacto</h2>
            <p>
              Si tienes preguntas sobre esta política o sobre el tratamiento de tus datos, escríbenos a <a href="mailto:privacidad@legadoapp.com" className="text-violet-600 hover:underline">privacidad@legadoapp.com</a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Legado — Plataforma de legado digital ·{" "}
          <Link href="/terms" className="hover:text-foreground transition-colors">Términos de Servicio</Link>
        </p>
      </footer>
    </div>
  );
}
