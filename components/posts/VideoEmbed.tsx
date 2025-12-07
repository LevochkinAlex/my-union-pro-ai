"use client";

interface VideoEmbedProps {
  videoType: "youtube" | "vimeo" | "rutube" | "vk";
  videoId: string;
  title?: string;
  onRemove?: () => void;
}

export default function VideoEmbed({
  videoType,
  videoId,
  title = "Video",
  onRemove,
}: VideoEmbedProps) {
  let embedUrl = "";
  
  switch (videoType) {
    case "youtube":
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
      break;
    case "vimeo":
      embedUrl = `https://player.vimeo.com/video/${videoId}`;
      break;
    case "rutube":
      embedUrl = `https://rutube.ru/play/embed/${videoId}`;
      break;
    case "vk":
      // videoId для VK имеет формат "-12345_67890"
      const [oid, id] = videoId.split("_");
      embedUrl = `https://vk.com/video_ext.php?oid=${oid}&id=${id}`;
      break;
    default:
      embedUrl = "";
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="relative w-full aspect-video bg-black">
        <iframe
          src={embedUrl}
          title={title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        ></iframe>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 p-2 bg-black/60 backdrop-blur-sm text-white rounded-full hover:bg-red-600 transition-colors shadow-lg z-10"
          title="Удалить видео"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

