"use client";

import { useMemo } from "react";
import {
  PARTNER_VENUE_SERVICE_CATEGORIES,
  getPartnerVenueCategoryById,
} from "@/lib/partner-venue-service-taxonomy";

type PartnerVenueServiceFieldsProps = {
  categoryValue: string;
  serviceValue: string;
  onCategoryChange: (categoryId: string) => void;
  onServiceChange: (serviceId: string) => void;
  disabled?: boolean;
};

export default function PartnerVenueServiceFields({
  categoryValue,
  serviceValue,
  onCategoryChange,
  onServiceChange,
  disabled,
}: PartnerVenueServiceFieldsProps) {
  const services = useMemo(
    () => getPartnerVenueCategoryById(categoryValue)?.services ?? [],
    [categoryValue]
  );

  return (
    <>
      <div className="sm:col-span-2">
        <label
          htmlFor="venue-service-category"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Категория услуг
        </label>
        <select
          id="venue-service-category"
          name="serviceCategoryCode"
          value={categoryValue}
          onChange={(e) => onCategoryChange(e.target.value)}
          disabled={disabled}
          className="mt-1 block w-full max-w-2xl rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="">Не выбрано</option>
          {PARTNER_VENUE_SERVICE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label
          htmlFor="venue-service"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Услуга
        </label>
        <select
          id="venue-service"
          name="serviceCode"
          value={serviceValue}
          onChange={(e) => onServiceChange(e.target.value)}
          disabled={disabled || !categoryValue}
          className="mt-1 block w-full max-w-2xl rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          <option value="">Не выбрано</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
