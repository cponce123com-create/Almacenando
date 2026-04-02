import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FlaskConical, Lock, Mail } from "lucide-react";

// ── Organic neural-network canvas ────────────────────────────────────────────
function NeuralCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const COUNT   = 30;
    const MAX_D   = 175;
    const MAX_PUL = 10;

    // ── types ──────────────────────────────────────────────────────────────
    type N = { x:number; y:number; vx:number; vy:number; r:number; glow:number };
    type P = { fi:number; ti:number; t:number; spd:number };

    const nodes: N[] = [];
    const pulses: P[] = [];

    // ── init ───────────────────────────────────────────────────────────────
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < COUNT; i++) {
      nodes.push({
        x:  Math.random() * canvas.width,
        y:  Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r:  1.8 + Math.random() * 2,
        glow: 0,
      });
    }

    // ── helpers ────────────────────────────────────────────────────────────
    // Deterministic bezier control point (organic curve, stable per pair)
    const cp = (a: N, b: N, i: number, j: number) => {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = Math.sin((i * 17 + j * 11) * 0.63) * 42;
      return { x: mx + (-dy / len) * off, y: my + (dx / len) * off };
    };

    // Point on quadratic bezier at t
    const bz = (ax:number, ay:number, cx:number, cy:number, bx:number, by:number, t:number) => {
      const u = 1 - t;
      return { x: u*u*ax + 2*u*t*cx + t*t*bx, y: u*u*ay + 2*u*t*cy + t*t*by };
    };

    // Neighbors within range
    const nbrs = (idx: number) =>
      nodes.map((_, i) => i).filter(i => i !== idx && Math.hypot(nodes[i].x - nodes[idx].x, nodes[i].y - nodes[idx].y) < MAX_D);

    // Start a new pulse (ignores duplicates & capacity)
    const fire = (from: number, to: number) => {
      if (pulses.length >= MAX_PUL) return;
      if (pulses.some(p => p.fi === from && p.ti === to)) return;
      pulses.push({ fi: from, ti: to, t: 0, spd: 0.006 + Math.random() * 0.009 });
    };

    // Kickstart
    for (let k = 0; k < 5; k++) {
      const f = Math.floor(Math.random() * COUNT);
      const ns = nbrs(f);
      if (ns.length) fire(f, ns[Math.floor(Math.random() * ns.length)]);
    }

    // ── main loop ──────────────────────────────────────────────────────────
    let frame = 0;
    const draw = () => {
      frame++;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // move nodes
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
        n.glow = Math.max(0, n.glow - 0.022);
      }

      // ── draw base branches ─────────────────────────────────────────────
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (d > MAX_D) continue;
          const fade = 1 - d / MAX_D;
          const c = cp(a, b, i, j);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
          ctx.strokeStyle = `rgba(13,180,170,${fade * 0.10})`;
          ctx.lineWidth = 0.7 + fade * 0.5;
          ctx.stroke();
        }
      }

      // ── update & draw pulses ───────────────────────────────────────────
      for (let pi = pulses.length - 1; pi >= 0; pi--) {
        const p = pulses[pi];
        const a = nodes[p.fi], b = nodes[p.ti];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > MAX_D * 1.4) { pulses.splice(pi, 1); continue; }

        p.t += p.spd;

        if (p.t >= 1) {
          // arrived → flash node → cascade
          nodes[p.ti].glow = 1;
          pulses.splice(pi, 1);
          const ns = nbrs(p.ti).filter(n => n !== p.fi);
          if (ns.length) {
            const next = ns[Math.floor(Math.random() * ns.length)];
            const tid = setTimeout(() => fire(p.ti, next), 60 + Math.random() * 140);
            timeouts.push(tid);
          }
          // keep network alive
          if (pulses.length < 2) {
            const rf = Math.floor(Math.random() * COUNT);
            const rns = nbrs(rf);
            if (rns.length) {
              const tid2 = setTimeout(() => fire(rf, rns[Math.floor(Math.random() * rns.length)]), 200);
              timeouts.push(tid2);
            }
          }
          continue;
        }

        const c = cp(a, b, Math.min(p.fi, p.ti), Math.max(p.fi, p.ti));
        const TRAIL = 0.30;
        const t0 = Math.max(0, p.t - TRAIL);

        // illuminated trail: multiple segments, fading towards start
        const STEPS = 14;
        for (let s = 0; s < STEPS; s++) {
          const ta = t0 + (p.t - t0) * (s / STEPS);
          const tb = t0 + (p.t - t0) * ((s + 1) / STEPS);
          const ratio = (s + 1) / STEPS; // 0→1 from tail to head
          const pa = bz(a.x, a.y, c.x, c.y, b.x, b.y, ta);
          const pb = bz(a.x, a.y, c.x, c.y, b.x, b.y, tb);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.strokeStyle = `rgba(0,240,210,${ratio * 0.75})`;
          ctx.lineWidth  = 0.8 + ratio * 1.8;
          ctx.stroke();
        }

        // pulse head glow
        const pt = bz(a.x, a.y, c.x, c.y, b.x, b.y, p.t);

        // wide outer halo
        const halo = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 18);
        halo.addColorStop(0,   "rgba(100,255,240,0.45)");
        halo.addColorStop(0.4, "rgba(13,220,200,0.12)");
        halo.addColorStop(1,   "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();

        // mid ring
        const ring = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 5);
        ring.addColorStop(0, "rgba(255,255,255,0.9)");
        ring.addColorStop(1, "rgba(13,240,210,0)");
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = ring;
        ctx.fill();

        // hard white core
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.97)";
        ctx.fill();
      }

      // randomly restart if too quiet
      if (frame % 120 === 0 && pulses.length < 3) {
        const f = Math.floor(Math.random() * COUNT);
        const ns = nbrs(f);
        if (ns.length) fire(f, ns[Math.floor(Math.random() * ns.length)]);
      }

      // ── draw nodes ─────────────────────────────────────────────────────
      for (const n of nodes) {
        const g = n.glow;
        const base = 0.28 + g * 0.72;

        // electric burst when node fires
        if (g > 0.05) {
          const burst = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * (4 + g * 6));
          burst.addColorStop(0, `rgba(0,255,210,${g * 0.55})`);
          burst.addColorStop(1, "rgba(0,200,170,0)");
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * (4 + g * 6), 0, Math.PI * 2);
          ctx.fillStyle = burst;
          ctx.fill();
        }

        // core dot
        const dot = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        dot.addColorStop(0, `rgba(210,255,250,${base})`);
        dot.addColorStop(1, `rgba(13,148,136,${base * 0.55})`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = dot;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      timeouts.forEach(clearTimeout);
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
