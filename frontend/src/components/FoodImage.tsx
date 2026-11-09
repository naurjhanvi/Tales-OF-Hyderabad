import { useState } from "react";
import { Soup } from "lucide-react";
import { cn } from "@/lib/utils";

interface FoodImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function FoodImage({ src, alt, className }: FoodImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-secondary to-accent/60 text-accent-foreground/70",
          className,
        )}
      >
        <Soup className="size-6" aria-hidden />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}
