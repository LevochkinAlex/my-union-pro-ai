export default function NewsCardSkeleton() {
  return (
    <article className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 animate-pulse">
      <div className="p-4 sm:p-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>

        {/* Cover image skeleton */}
        <div className="mb-4 -mx-4 sm:-mx-6">
          <div className="h-64 bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Title skeleton */}
        <div className="mb-3">
          <div className="h-6 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
          <div className="h-6 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>

        {/* Content skeleton */}
        <div className="mb-4 space-y-2">
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>

        {/* Actions skeleton */}
        <div className="flex items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>
    </article>
  );
}

