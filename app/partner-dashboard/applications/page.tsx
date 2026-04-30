import PartnerVenueApplicationsList from "@/components/partner/PartnerVenueApplicationsList";

export default function PartnerApplicationsPage() {
  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Заявки</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Площадки, по которым пользователи подали заявку на участие.
        </p>
      </div>

      <PartnerVenueApplicationsList apiUrl="/api/partner/applications" variant="partner" />
    </div>
  );
}
