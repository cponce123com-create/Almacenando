import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FlaskConical, Lock, Mail } from "lucide-react";

// ── Neural-network canvas background ─────────────────────────────────────────
interface Node {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  pulse: number; pulseSpeed: number;
}

function NeuralCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;

    const COUNT = 38;
    const MAX_DIST = 160;
    const nodes: Node[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < COUNT; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 2 + 1.5,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.012 + Math.random() * 0.018,
      });
    }

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Update positions
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += n.pulseSpeed;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      }

      // Draw edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > MAX_DIST) continue;
          const fade = 1 - dist / MAX_DIST;
          const alpha = fade * 0.22;
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          grad.addColorStop(0, `rgba(13,212,196,${alpha})`);
          grad.addColorStop(1, `rgba(8,145,178,${alpha})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = fade * 1.1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Draw nodes
      for (const n of nodes) {
        const glow = (Math.sin(n.pulse) + 1) / 2; // 0..1
        const baseAlpha = 0.45 + glow * 0.45;
        const radius = n.r + glow * 1.2;

        // Outer glow
        const glowGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius * 3.5);
        glowGrad.addColorStop(0, `rgba(13,212,196,${baseAlpha * 0.25})`);
        glowGrad.addColorStop(1, "rgba(13,212,196,0)");
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Core dot
        const dotGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius);
        dotGrad.addColorStop(0, `rgba(180,255,248,${baseAlpha})`);
        dotGrad.addColorStop(1, `rgba(13,148,136,${baseAlpha * 0.6})`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = dotGrad;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

// ── Login page ────────────────────────────────────────────────────────────────
export default function Login() {
  const [_, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setIsPending(true);
    try {
      await login(email, password);
      setLocation("/dashboard");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error al iniciar sesión",
        description: err.message || "Correo o contraseña incorrectos.",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #050f1a 0%, #091e35 45%, #091f2e 70%, #071c1a 100%)",
      }}
    >
      {/* Animated background */}
      <NeuralCanvas />

      {/* Subtle radial accent */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 60% at 20% 50%, rgba(13,148,136,0.08) 0%, transparent 70%)",
      }} />

      {/* Left branding panel — hidden on mobile */}
      <div
        className="hidden lg:flex"
        style={{
          width: 380, flexShrink: 0,
          flexDirection: "column", justifyContent: "space-between",
          padding: "48px 44px",
          position: "relative",
          borderRight: "1px solid rgba(13,212,196,0.1)",
          backdropFilter: "blur(2px)",
        }}
      >
        {/* Logo */}
        <div>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 32px rgba(13,212,196,0.3)",
            marginBottom: 24,
          }}>
            <FlaskConical style={{ width: 28, height: 28, color: "#fff" }} />
          </div>
          <h2 style={{
            fontSize: 34, fontWeight: 800, color: "#f0fdfa",
            lineHeight: 1.15, marginBottom: 14,
            letterSpacing: "-0.5px",
          }}>
            Almacén<br />Químico
          </h2>
          <p style={{ fontSize: 13.5, color: "rgba(148,215,208,0.65)", lineHeight: 1.65, maxWidth: 270 }}>
            Sistema integral de gestión para el control, trazabilidad e inventario de productos químicos industriales.
          </p>

          {/* Divider */}
          <div style={{
            width: 40, height: 2, borderRadius: 2,
            background: "linear-gradient(90deg, #0d9488, transparent)",
            margin: "28px 0",
          }} />

          {/* Features */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {[
              { label: "Control de inventario multi-almacén", icon: "🏭" },
              { label: "Trazabilidad de productos químicos", icon: "🔬" },
              { label: "Gestión de EPP y seguridad", icon: "🦺" },
              { label: "Reportes y disposición final", icon: "📊" },
            ].map((f) => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: "rgba(13,148,136,0.12)",
                  border: "1px solid rgba(13,212,196,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16,
                }}>
                  {f.icon}
                </div>
                <span style={{ fontSize: 13, color: "rgba(203,230,228,0.78)", lineHeight: 1.4 }}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: "rgba(148,215,208,0.3)" }}>
          © {new Date().getFullYear()} Sistema de Gestión de Almacén Químico
        </p>
      </div>

      {/* Right — login form */}
      <div style={{
        flex: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
        position: "relative",
      }}>
        <div style={{ width: "100%", maxWidth: 400 }}>

          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center" style={{ marginBottom: 32 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: "linear-gradient(135deg, #0d9488, #0891b2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 28px rgba(13,212,196,0.3)", marginBottom: 12,
            }}>
              <FlaskConical style={{ width: 26, height: 26, color: "#fff" }} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f0fdfa" }}>Almacén Químico</h1>
            <p style={{ fontSize: 13, color: "rgba(148,215,208,0.6)", marginTop: 4 }}>Sistema de Gestión</p>
          </div>

          {/* Glass card */}
          <div style={{
            borderRadius: 20,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(13,212,196,0.08)",
            padding: "36px 36px 30px",
          }}>
            {/* Card header */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 22, fontWeight: 800, color: "#0c1a2e", marginBottom: 4 }}>
                Iniciar Sesión
              </h3>
              <p style={{ fontSize: 13.5, color: "#64748b" }}>
                Ingresa tus credenciales para continuar
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Email */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Label htmlFor="email" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                  Correo Electrónico
                </Label>
                <div style={{ position: "relative" }}>
                  <Mail style={{
                    position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                    width: 16, height: 16, color: "#94a3b8", pointerEvents: "none",
                  }} />
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@almacen.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    style={{ height: 44, paddingLeft: 38, fontSize: 14 }}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Label htmlFor="password" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                  Contraseña
                </Label>
                <div style={{ position: "relative" }}>
                  <Lock style={{
                    position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                    width: 16, height: 16, color: "#94a3b8", pointerEvents: "none",
                  }} />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    style={{ height: 44, paddingLeft: 38, fontSize: 14 }}
                  />
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isPending}
                style={{
                  height: 46, fontWeight: 700, fontSize: 15,
                  background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
                  border: "none", color: "#fff",
                  borderRadius: 10,
                  boxShadow: "0 4px 18px rgba(13,148,136,0.35)",
                  transition: "opacity 0.15s, box-shadow 0.15s",
                  marginTop: 4,
                }}
              >
                {isPending ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                    Iniciando sesión...
                  </span>
                ) : "Iniciar Sesión"}
              </Button>
            </form>

            {/* Hint */}
            <div style={{
              marginTop: 22, paddingTop: 18,
              borderTop: "1px solid #f1f5f9",
              textAlign: "center",
            }}>
              <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>
                Tu contraseña es tu usuario +{" "}
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0d9488" }}>123</span>
                <br />
                <span style={{ color: "#cbd5e1" }}>
                  Ej: jcastillo → contraseña:{" "}
                  <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#64748b" }}>jcastillo123</span>
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
