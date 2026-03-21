import { Link } from "wouter";
import { ArrowLeft, Mail } from "lucide-react";

const faqs = [
  {
    q: "¿Cómo funciona Legado?",
    a: "Legado te permite crear mensajes, videos, cartas y documentos cifrados para tus seres queridos. Cuando ocurre tu fallecimiento y tus contactos de confianza lo confirman, el administrador revisa el caso y libera tu legado, enviando los archivos a los destinatarios que elegiste.",
  },
  {
    q: "¿Qué pasa si mis contactos de confianza no confirman el fallecimiento?",
    a: "El equipo de Legado también realiza una revisión independiente de cada reporte. Si los contactos de confianza no responden en un tiempo razonable, el administrador puede continuar el proceso basándose en la evidencia disponible. Siempre habrá supervisión humana antes de liberar cualquier legado.",
  },
  {
    q: "¿Puedo actualizar o eliminar mi legado en cualquier momento?",
    a: "Sí, mientras estés vivo y con acceso a tu cuenta puedes editar, agregar o eliminar cualquier elemento de tu legado. Los cambios son efectivos de inmediato y tus destinatarios solo recibirán la versión final que hayas dejado.",
  },
  {
    q: "¿Puedo borrar mi cuenta?",
    a: "Sí. Puedes solicitar la eliminación completa de tu cuenta y todos tus datos escribiéndonos a soporte@legadoapp.com. Eliminaremos todos tus datos en un plazo máximo de 30 días, de acuerdo con nuestra política de privacidad.",
  },
  {
    q: "¿Cómo se protegen mis archivos?",
    a: "Todos tus archivos (videos, fotos, documentos, audios) se cifran en tu dispositivo con AES-256-GCM antes de ser enviados a los servidores. Solo tú tienes la clave de cifrado. El equipo de Legado no puede acceder al contenido de tus archivos en ningún momento.",
  },
  {
    q: "¿Qué es la clave de descifrado y dónde se guarda?",
    a: "La clave de descifrado es una cadena única generada para tu cuenta que permite a tus destinatarios abrir los archivos cifrados. Puedes compartirla con tus contactos de confianza directamente desde la app. Sin esta clave, los archivos no pueden abrirse.",
  },
  {
    q: "¿Los destinatarios necesitan crear una cuenta en Legado?",
    a: "No. Tus destinatarios recibirán un enlace único por correo electrónico con acceso directo a su portal personal. No necesitan registrarse ni recordar contraseñas.",
  },
  {
    q: "¿Qué tipos de archivos puedo guardar?",
    a: "Puedes guardar videos (mp4), cartas de texto, fotografías, audios y documentos en cualquier formato. También puedes incluir notas funerarias y preferencias de ceremonias.",
  },
  {
    q: "¿Cómo sé que mis datos no serán usados para otro fin?",
    a: "Legado no comparte ni vende tus datos con terceros. Los archivos están cifrados de extremo a extremo y solo los destinatarios designados pueden acceder al contenido. Consulta nuestra Política de Privacidad para más detalles.",
  },
  {
    q: "¿Qué pasa si cambio de correo electrónico o pierdo acceso a mi cuenta?",
    a: "Te recomendamos mantener tu correo actualizado en Mi Perfil. Si pierdes acceso, escríbenos a soporte@legadoapp.com con información que permita verificar tu identidad y te ayudaremos a recuperar el acceso.",
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al inicio
        </Link>

        <h1 className="font-serif text-4xl font-bold text-gray-900 mb-3">
          Preguntas frecuentes
        </h1>
        <p className="text-gray-500 mb-12">
          Todo lo que necesitas saber sobre Legado y cómo funciona.
        </p>

        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
            >
              <h2 className="font-semibold text-gray-900 text-base mb-2">
                {faq.q}
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>

        <div
          id="contacto"
          className="mt-16 bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "rgba(157,23,77,0.1)" }}
          >
            <Mail className="w-6 h-6" style={{ color: "#9d174d" }} />
          </div>
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">
            ¿Tienes otra pregunta?
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Nuestro equipo responde en menos de 24 horas en días hábiles.
          </p>
          <a
            href="mailto:soporte@legadoapp.com"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#9d174d" }}
          >
            <Mail className="w-4 h-4" />
            soporte@legadoapp.com
          </a>
        </div>

        <div className="mt-10 pt-8 border-t border-gray-200 flex flex-wrap justify-center gap-4 text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-600 transition-colors">Inicio</Link>
          <span>›</span>
          <Link href="/privacy" className="hover:text-gray-600 transition-colors">Política de privacidad</Link>
          <span>›</span>
          <Link href="/terms" className="hover:text-gray-600 transition-colors">Términos de servicio</Link>
        </div>
      </div>
    </div>
  );
}
