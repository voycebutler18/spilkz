import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, X } from "lucide-react";

type Props = {
  value?: string | null;                      // current avatar_url
  onChange?: (publicUrl: string) => void;     // callback with new public URL
  size?: number;                              // px
};

export default function AvatarUploader({ value, onChange, size = 72 }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const openPicker = () => fileRef.current?.click();

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file");
      return;
    }

    setUploading(true);

    try {
      // compress lightly for mobile
      const compressed = await compressImage(file, 768, 768, 0.82);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert("You must be signed in");
        return;
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, compressed, { cacheControl: "3600", upsert: false });

      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);

      // save to profile
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      if (profErr) throw profErr;

      setPreview(publicUrl);
      onChange?.(publicUrl);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div className="flex items-center gap-3">
      <Avatar className="ring-2 ring-primary/20" style={{ width: size, height: size }}>
        <AvatarImage src={preview || value || undefined} />
        <AvatarFallback className="font-medium">U</AvatarFallback>
      </Avatar>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={openPicker} disabled={uploading}>
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" /> Upload
            </>
          )}
        </Button>
        {preview && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPreview(null)}
            disabled={uploading}
          >
            <X className="mr-2 h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      <Input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}

/** Simple client-side compression using canvas */
async function compressImage(file: File, maxW: number, maxH: number, quality = 0.85) {
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  await new Promise((r) => (img.onload = () => r(null)));

  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", quality)
  );
  URL.revokeObjectURL(img.src);
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}
