import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, BadgeCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { useDniLookup } from "@/hooks/use-dni-lookup";

type DniInputProps = {
  value: string;
  onChange: (dni: string) => void;
  onResolved: (data: {
    fullName: string;
    firstName: string;
    firstLastName: string;
    secondLastName: string;
  }) => void;
  onClear?: () => void;
  label?: string;
  required?: boolean;
  className?: string;
};

export function DniInput({
  value,
  onChange,
  onResolved,
  onClear,
  label = "DNI",
  required = false,
  className = "",
}: DniInputProps) {
  const { result, lookup, reset } = useDniLookup();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const digits = value.replace(/\D/g, "");

    if (digits.length !== 8) {
      reset();
      if (onClear) onClear();
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const data = await lookup(digits);
      if (data) {
        onResolved({
          fullName: data.fullName,
          firstName: data.firstName,
          firstLastName: data.firstLastName,
          secondLastName: data.secondLastName,
        });
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="flex items-center gap-1.5 text-gray-700 text-sm">
        <BadgeCheck className="w-4 h-4" style={{ color: "#9d174d" }} />
        {label} {required && <span className="text-red-500">*</span>}
      </Label>

      <div className="relative">
        <Input
          value={value}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
            onChange(digits);
          }}
          placeholder="12345678"
          maxLength={8}
          className="rounded-xl h-11 text-gray-900 tracking-widest font-mono pr-10"
          inputMode="numeric"
        />
        {result.status === "loading" && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#9d174d" }} />
          </div>
        )}
        {result.status === "success" && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </div>
        )}
        {result.status === "error" && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AlertCircle className="w-4 h-4 text-red-500" />
          </div>
        )}
      </div>

      {result.status === "loading" && (
        <p className="text-xs flex items-center gap-1" style={{ color: "#9d174d" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
          Consultando RENIEC...
        </p>
      )}

      {result.status === "success" && result.fullName && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span className="text-green-800">
            Verificado: <strong>{result.fullName}</strong>
          </span>
        </div>
      )}

      {result.status === "error" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-red-700">{result.message}</span>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Los nombres se completan automáticamente al ingresar los 8 dígitos
      </p>
    </div>
  );
}
