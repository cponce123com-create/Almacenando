/**
 * Búsqueda Global
 * Buscador unificado en la barra superior. Busca en productos, ubicaciones,
 * insumos, muestras, personal y lotes.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "wouter";
import { Search, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/hooks/use-auth";

interface SearchItem {
  id: string;
  label: string;
  subtitle: string | null;
  link: string;
}

interface SearchCategory {
  category: string;
  label: string;
  items: SearchItem[];
}

interface SearchResponse {
  query: string;
  total: number;
  results: SearchCategory[];
}

const CATEGORY_ICONS: Record<string, string> = {
  producto: "📦",
  ubicación: "📍",
  insumo: "🔧",
  muestra: "🧪",
  personal: "👤",
  lote: "🏷️",
};

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCategory[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) return;
      const data: SearchResponse = await res.json();
      setResults(data.results);
      setIsOpen(data.results.length > 0);
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  };

  const handleSelect = (item: SearchItem) => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    navigate(item.link);
  };

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  return (
    <div className="relative flex-1 max-w-md" ref={dropdownRef}>
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ width: 16, height: 16, color: "#94a3b8" }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          placeholder="Buscar productos, ubicaciones, insumos..."
          className="w-full h-10 pl-9 pr-4 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors placeholder:text-slate-400"
          aria-label="Búsqueda global"
        />
        {isLoading && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin"
            style={{ width: 14, height: 14, color: "#94a3b8" }}
          />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 z-[100] overflow-hidden"
          style={{ maxHeight: "70vh" }}
        >
          <div className="overflow-y-auto py-1">
            {results.map((category) => (
              <div key={category.category}>
                <div
                  className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50"
                >
                  {CATEGORY_ICONS[category.category] ?? "•"} {category.label}
                </div>
                {category.items.map((item) => (
                  <button
                    key={`${category.category}-${item.id}`}
                    onClick={() => handleSelect(item)}
                    className="w-full px-4 py-2 text-left hover:bg-emerald-50 transition-colors flex flex-col gap-0.5"
                  >
                    <span
                      className="text-sm font-medium text-slate-800 truncate"
                      dangerouslySetInnerHTML={{ __html: highlightMatch(item.label, query) }}
                    />
                    {item.subtitle && (
                      <span
                        className="text-[11px] text-slate-400 truncate"
                        dangerouslySetInnerHTML={{ __html: highlightMatch(item.subtitle, query) }}
                      />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Resalta el término de búsqueda en el texto */
function highlightMatch(text: string, query: string): string {
  if (!query || query.length < 2) return escapeHtml(text);
  // Escapar caracteres especiales de regex de forma segura
  const specialChars = [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"];
  let escaped = "";
  for (const ch of query) {
    escaped += specialChars.includes(ch) ? "\\" + ch : ch;
  }
  const regex = new RegExp(`(${escaped})`, "gi");
  return escapeHtml(text).replace(regex, '<mark class="bg-amber-200 rounded-sm px-0.5">$1</mark>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
