"use client";

interface LinkPreviewProps {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  onRemove?: () => void;
}

export default function LinkPreviewCard({
  url,
  title,
  description,
  image,
  siteName,
  favicon,
  onRemove,
}: LinkPreviewProps) {
  const hostname = new URL(url).hostname.replace("www.", "");

  return (
    <div className="relative border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {image && (
          <div className="relative w-full aspect-video bg-gray-100 dark:bg-gray-800">
            <img
              src={image}
              alt={title || "Link preview"}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />
          </div>
        )}
        
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            {favicon && (
              <img
                src={favicon}
                alt=""
                className="w-4 h-4 rounded"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                }}
              />
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {siteName || hostname}
            </span>
          </div>

          {title && (
            <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2">
              {title}
            </h4>
          )}

          {description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {description}
            </p>
          )}

          <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 truncate">
            {hostname}
          </div>
        </div>
      </a>

      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
          className="absolute top-2 right-2 p-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm text-gray-600 dark:text-gray-400 rounded-full hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors shadow-sm"
          title="Удалить превью"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

