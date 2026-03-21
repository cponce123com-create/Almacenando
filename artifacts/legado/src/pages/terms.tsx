import { Link } from "wouter";
import { Heart } from "lucide-react";

export default function Terms() {
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
        <h1 className="font-serif text-4xl font-bold text-foreground mb-2">Términos de Servicio</h1>
        <p className="text-muted-foreground mb-10">Última actualización: enero de 2025</p>

        <div className="prose prose-zinc prose-violet max-w-none space-y-8 text-zinc-700 leading-relaxed">
          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">1. Aceptación de los términos</h2>
            <p>
              Al crear una cuenta y usar la plataforma Legado, aceptas estos Términos de Servicio en su totalidad. Si no estás de acuerdo con alguna de las condiciones descritas aquí, no debes usar la plataforma.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">2. Edad mínima</h2>
            <p>
              El uso de Legado está reservado a personas mayores de 18 años. Al registrarte, declaras que tienes la edad legal requerida en tu país de residencia para celebrar contratos vinculantes.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">3. Naturaleza del servicio</h2>
            <p>
              <strong>Legado es una plataforma tecnológica de almacenamiento y entrega de mensajes digitales. No somos un servicio legal, notarial ni testamentario.</strong> El contenido almacenado en Legado no tiene validez jurídica como testamento ni como instrumento notarial en ninguna jurisdicción.
            </p>
            <p>
              Para asuntos legales relacionados con herencias, sucesiones o testamentos, debes consultar a un abogado o notario certificado en tu país.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">4. Responsabilidad del usuario</h2>
            <p>Eres el único responsable de:</p>
            <ul className="list-disc list-inside space-y-1 mt-2 pl-2">
              <li>Mantener actualizada la información de tus contactos de confianza y destinatarios.</li>
              <li>Asegurarte de que tus contactos de confianza conocen su rol y saben cómo usar la plataforma.</li>
              <li>Conservar de forma segura tu clave de cifrado. Legado no puede recuperarla si la pierdes.</li>
              <li>El contenido que subes a la plataforma: no puedes almacenar material ilegal, ofensivo o que viole derechos de terceros.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">5. Continuidad del servicio</h2>
            <p>
              Legado se compromete a mantener el servicio disponible de forma continua con el mejor esfuerzo razonable. Sin embargo, <strong>Legado puede interrumpir o discontinuar el servicio con un aviso mínimo de 30 días</strong>, notificando a todos los usuarios registrados por correo electrónico. Antes de la interrupción, te facilitaremos mecanismos para exportar o acceder a tu información almacenada.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">6. Limitación de responsabilidad</h2>
            <p>
              Legado no se hace responsable de errores, fallos técnicos, pérdidas de datos o daños indirectos derivados del uso de la plataforma, salvo en los casos expresamente previstos por la legislación aplicable. El servicio se ofrece "tal cual" y sin garantías de resultado.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">7. Modificaciones</h2>
            <p>
              Podemos actualizar estos Términos de Servicio en cualquier momento. Te notificaremos por correo electrónico con al menos 15 días de antelación ante cualquier cambio material. El uso continuado del servicio después de la notificación implica la aceptación de los nuevos términos.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">8. Contacto</h2>
            <p>
              Si tienes preguntas sobre estos términos, escríbenos a <a href="mailto:legal@legadoapp.com" className="text-violet-600 hover:underline">legal@legadoapp.com</a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Legado — Plataforma de legado digital ·{" "}
          <Link href="/privacy" className="hover:text-foreground transition-colors">Política de Privacidad</Link>
        </p>
      </footer>
    </div>
  );
}
