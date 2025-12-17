import { useState } from "react";

export interface Child {
  name: string;
  birthDate: string;
  gender: "М" | "Ж" | "";
  age?: number;
}

export function useChildren() {
  const [children, setChildren] = useState<Child[]>([]);
  const [childErrors, setChildErrors] = useState<Record<number, string>>({});

  const calculateAge = (birthDate: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const addChild = () => {
    setChildren([...children, { name: "", birthDate: "", gender: "" }]);
  };

  const removeChild = (index: number) => {
    setChildren(children.filter((_, i) => i !== index));
    const updatedErrors = { ...childErrors };
    delete updatedErrors[index];
    const newErrors: Record<number, string> = {};
    Object.keys(updatedErrors).forEach((key) => {
      const oldIndex = parseInt(key);
      if (oldIndex > index) {
        newErrors[oldIndex - 1] = updatedErrors[oldIndex];
      } else if (oldIndex < index) {
        newErrors[oldIndex] = updatedErrors[oldIndex];
      }
    });
    setChildErrors(newErrors);
  };

  const updateChild = (index: number, field: keyof Child, value: string) => {
    const updatedChildren = [...children];
    const updatedErrors = { ...childErrors };

    updatedChildren[index] = {
      ...updatedChildren[index],
      [field]: value,
    };

    if (field === "birthDate" && value) {
      try {
        const birthDate = new Date(value);
        const age = calculateAge(birthDate);
        updatedChildren[index].age = age;

        if (age > 18) {
          updatedErrors[index] = "Возраст ребенка не может быть больше 18 лет";
        } else {
          delete updatedErrors[index];
        }
      } catch (error) {
        console.error("Invalid date:", error);
        updatedErrors[index] = "Неверный формат даты";
      }
    }

    setChildren(updatedChildren);
    setChildErrors(updatedErrors);
  };

  return {
    children,
    setChildren,
    childErrors,
    addChild,
    removeChild,
    updateChild,
  };
}

