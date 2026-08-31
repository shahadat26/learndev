import { initials } from '@/lib/format';

interface ProductThumbnailProps {
  name: string;
  imageUrl?: string | null;
  className?: string;
  priority?: boolean;
}

/**
 * The catalogue may or may not carry an image URL, and the host it points at is not
 * known in advance. Rather than open next/image up to arbitrary remote hosts (an
 * image-proxy is a classic SSRF footgun), the seeded catalogue renders a generated
 * tile; a real deployment would add its own CDN host to next.config images.remotePatterns.
 */
export function ProductThumbnail({ name, imageUrl, className = '' }: ProductThumbnailProps) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- unknown remote host, so no next/image optimisation
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`flex h-full w-full items-center justify-center bg-linear-to-br from-brand-100 to-brand-300 ${className}`}
    >
      <span className="text-2xl font-bold tracking-tight text-brand-800/70">{initials(name)}</span>
    </div>
  );
}
