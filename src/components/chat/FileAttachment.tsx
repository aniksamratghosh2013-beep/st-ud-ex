import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";

interface FileAttachmentProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

export function FileAttachmentButton({ file, onFileSelect, disabled }: FileAttachmentProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      alert("File must be under 10MB");
      return;
    }
    onFileSelect(f);
    if (inputRef.current) inputRef.current.value = "";
  };

  const isImage = file?.type.startsWith("image/");

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-9 w-9 shrink-0"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        <Paperclip className="h-4 w-4" />
      </Button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
        onChange={handleSelect}
      />
      {file && (
        <div className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded max-w-[160px]">
          {isImage ? <ImageIcon className="h-3 w-3 shrink-0" /> : <FileText className="h-3 w-3 shrink-0" />}
          <span className="truncate">{file.name}</span>
          <Button type="button" size="icon" variant="ghost" className="h-4 w-4 p-0 shrink-0" onClick={() => onFileSelect(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function AttachmentPreview({ url, name, type }: { url: string; name: string; type: string }) {
  const isImage = type?.startsWith("image/");

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img src={url} alt={name} className="max-w-[240px] max-h-[180px] rounded-md object-cover border" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 px-3 py-2 bg-muted/50 rounded-md border text-xs hover:bg-muted transition-colors max-w-[240px]"
    >
      <FileText className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate">{name}</span>
    </a>
  );
}
