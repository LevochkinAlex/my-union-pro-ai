import { useState, useEffect } from "react";

export interface ProfileData {
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  jobTitle: string;
  workplace: string;
  workplaceInn: string;
  directorName: string;
  directorPosition: string;
  email: string;
  preferredDiscountCity: string;
  avatarUrl: string | null;
  organizationId: string | null;
  organization?: {
    id: string;
    name: string;
    inn: string | null;
  } | null;
}

export function useProfileData() {
  const [profileData, setProfileData] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    middleName: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    jobTitle: "",
    workplace: "",
    workplaceInn: "",
    directorName: "",
    directorPosition: "",
    email: "",
    preferredDiscountCity: "",
    avatarUrl: null,
    organizationId: null,
    organization: null,
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await fetch("/api/profile");
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            setProfileData({
              firstName: data.user.firstName || "",
              lastName: data.user.lastName || "",
              middleName: data.user.middleName || "",
              phone: data.user.phone || "",
              dateOfBirth: data.user.dateOfBirth
                ? new Date(data.user.dateOfBirth).toISOString().split("T")[0]
                : "",
              address: data.user.address || "",
              jobTitle: data.user.jobTitle || "",
              workplace: data.user.workplace || "",
              workplaceInn: data.user.workplaceInn || "",
              directorName: data.user.directorName || "",
              directorPosition: data.user.directorPosition || "",
              email: data.user.email || "",
              preferredDiscountCity: data.user.preferredDiscountCity || "",
              avatarUrl: data.user.avatarUrl,
              organizationId: data.user.organizationId,
              organization: data.user.organization,
            });
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  const updateProfileField = <K extends keyof ProfileData>(
    field: K,
    value: ProfileData[K]
  ) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
  };

  const updateProfileData = (data: Partial<ProfileData>) => {
    setProfileData((prev) => ({ ...prev, ...data }));
  };

  return {
    profileData,
    setProfileData,
    updateProfileField,
    updateProfileData,
    isLoading,
  };
}

