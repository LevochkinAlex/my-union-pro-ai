function labelFor(status: string): string {
  switch (status) {
    case "NEW":
      return "Новая";
    case "IN_PROGRESS":
      return "В работе";
    case "CANCELLED":
      return "Отменена";
    case "APPROVED":
      return "Одобрена";
    default:
      return status || "—";
  }
}

export default function PartnerVenueApplicationStatusBadge({ status }: { status: string }) {
  const label = labelFor(status);
  switch (status) {
    case "NEW":
      return (
        <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
          {label}
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className="inline-flex shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          {label}
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-400">
          {label}
        </span>
      );
    case "APPROVED":
      return (
        <span className="inline-flex shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {label}
        </span>
      );
    default:
      return (
        <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
          {label}
        </span>
      );
  }
}
