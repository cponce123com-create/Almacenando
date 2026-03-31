import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { Label } from "@/components/ui/label";

export interface PendingPhoto {
  id: string;
  file: File;
  preview: string;
}

interface Props {
  pendingPhotos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  maxPhotos?: number;
  label?: string;
}

export function PhotoPickerInline({ pendingPhotos, onChange, maxPhotos = 5, label = "Fotos" }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const slots = maxPhotos - pendingPhotos.length;
    if (slots <= 0) return;
    const toAdd = arr.slice(0, slots).map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: URL.createObjectURL(file),
    }));
    onChange([...pendingPhotos, ...toAdd]);
  }, [pendingPhotos, onChange, maxPhotos]);

  const remove = (id: string) => {
    const removed = pendingPhotos.find(p => p.id === id);
    if (removed) URL.revokeObjectURL(removed.preview);
    onChange(pendingPhotos.filter(p => p.id !== id));
  };

  const remaining = maxPhotos - pendingPhotos.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium" style={{ color: "#374151" }}>
          {label}
          <span className="font-normal ml-1" style={{ color: "#9ca3af" }}>(opcional · máx. {maxPhotos})</span>
        </Label>
        {pendingPhotos.length > 0 && (
          <span className="text-xs font-medium" style={{ color: "#7c3aed" }}>
            {pendingPhotos.length} foto{pendingPhotos.length !== 1 ? "s" : ""} lista{pendingPhotos.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {pendingPhotos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
          {pendingPhotos.map(p => (
            <div key={p.id} style={{ position: "relative" }} className="group aspect-square">
              <img
                src={p.preview}
                alt="preview"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px", border: "1px solid #e2e8f0" }}
              />
              <button
                type="button"
                onClick={() => remove(p.id)}
                style={{
                  position: "absolute", top: "2px", right: "2px",
                  background: "rgba(255,255,255,0.92)", border: "none", cursor: "pointer",
                  borderRadius: "50%", width: "20px", height: "20px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  opacity: 0,
                }}
                className="group-hover:!opacity-100 transition-opacity"
              >
                <X style={{ width: "12px", height: "12px", color: "#374151" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <Button
            type="button"
            variant="outline"
            style={{
              height: "44px", display: "flex", flexDirection: "column",
              gap: "2px", borderStyle: "dashed", borderColor: "#c4b5fd",
              color: "#7c3aed", fontSize: "12px",
            }}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera style={{ width: "16px", height: "16px" }} />
            <span>Tomar foto</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            style={{
              height: "44px", display: "flex", flexDirection: "column",
              gap: "2px", borderStyle: "dashed", borderColor: "#e2e8f0",
              color: "#4b5563", fontSize: "12px",
            }}
            onClick={() => galleryRef.current?.click()}
          >
            <ImageIcon style={{ width: "16px", height: "16px" }} />
            <span>Galería</span>
          </Button>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { addFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
