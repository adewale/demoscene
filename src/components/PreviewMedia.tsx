type PreviewMediaProps = {
  alt: string;
  previewImageUrl: string | null;
};

export function PreviewMedia({ alt, previewImageUrl }: PreviewMediaProps) {
  if (!previewImageUrl) {
    return null;
  }

  return (
    <div className="preview-media">
      <img alt={alt} loading="lazy" src={previewImageUrl} />
    </div>
  );
}
