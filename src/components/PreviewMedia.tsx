type PreviewMediaProps = {
  alt: string;
  previewImageUrl: string | null;
};

export function PreviewMedia({ alt, previewImageUrl }: PreviewMediaProps) {
  if (!previewImageUrl) {
    return (
      <div className="preview-media preview-media-fallback">
        <div
          aria-label="Preview unavailable"
          className="preview-fallback-art"
          role="img"
        >
          <span>Preview unavailable</span>
          <small>README and links still available</small>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-media">
      <img alt={alt} decoding="async" loading="lazy" src={previewImageUrl} />
    </div>
  );
}
