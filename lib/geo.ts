import type { DiscountCity } from "@/types/discounts";

const CITY_COORDINATES: { name: string; lat: number; lng: number }[] = [
  { name: "Москва", lat: 55.7558, lng: 37.6176 },
  { name: "Санкт-Петербург", lat: 59.9343, lng: 30.3351 },
  { name: "Новосибирск", lat: 55.0084, lng: 82.9357 },
  { name: "Екатеринбург", lat: 56.8389, lng: 60.6057 },
  { name: "Нижний Новгород", lat: 56.2965, lng: 43.9361 },
  { name: "Казань", lat: 55.7961, lng: 49.1064 },
  { name: "Самара", lat: 53.1959, lng: 50.1008 },
  { name: "Омск", lat: 54.9885, lng: 73.3242 },
  { name: "Челябинск", lat: 55.1644, lng: 61.4368 },
  { name: "Ростов-на-Дону", lat: 47.2357, lng: 39.7015 },
  { name: "Уфа", lat: 54.7388, lng: 55.9721 },
  { name: "Красноярск", lat: 56.0153, lng: 92.8932 },
  { name: "Пермь", lat: 58.0105, lng: 56.2501 },
  { name: "Воронеж", lat: 51.6755, lng: 39.2089 },
  { name: "Краснодар", lat: 45.0355, lng: 38.9753 },
  { name: "Саратов", lat: 51.5336, lng: 46.0343 },
  { name: "Тюмень", lat: 57.1522, lng: 65.5272 },
  { name: "Тольятти", lat: 53.5078, lng: 49.4204 },
  { name: "Ижевск", lat: 56.8526, lng: 53.2060 },
  { name: "Барнаул", lat: 53.3480, lng: 83.7798 },
  { name: "Ульяновск", lat: 54.3142, lng: 48.4031 },
  { name: "Иркутск", lat: 52.2869, lng: 104.3050 },
  { name: "Владивосток", lat: 43.1198, lng: 131.8869 },
  { name: "Онлайн", lat: 0, lng: 0 },
];

const CITY_COORDINATES_MAP = CITY_COORDINATES.reduce<Record<string, { lat: number; lng: number }>>(
  (acc, city) => {
    acc[city.name.toLowerCase()] = { lat: city.lat, lng: city.lng };
    return acc;
  },
  {}
);

export function getCityCoordinates(cityName?: string | null) {
  if (!cityName) {
    return undefined;
  }
  return CITY_COORDINATES_MAP[cityName.toLowerCase()];
}

export function attachCoordinatesToCities(cities: DiscountCity[]): DiscountCity[] {
  return cities.map((city) => {
    if (city.coordinates) {
      return city;
    }

    const coords = getCityCoordinates(city.name);
    return coords
      ? { ...city, coordinates: coords }
      : city;
  });
}

export function calculateDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const R = 6371;
  const dLat = degreesToRadians(to.lat - from.lat);
  const dLon = degreesToRadians(to.lng - from.lng);
  const lat1 = degreesToRadians(from.lat);
  const lat2 = degreesToRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}
