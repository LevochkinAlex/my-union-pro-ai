import { useState } from "react";

export interface Education {
  level: string;
  institution: string;
  year: string;
  specialty: string;
}

export function useEducation() {
  const [educationsData, setEducationsData] = useState<Education[]>([]);
  const [isAddingEducation, setIsAddingEducation] = useState(false);
  const [editingEducationIndex, setEditingEducationIndex] = useState<number | null>(null);
  const [newEducation, setNewEducation] = useState<Education>({
    level: "",
    institution: "",
    year: "",
    specialty: "",
  });

  const openAddEducationForm = () => {
    setNewEducation({ level: "", institution: "", year: "", specialty: "" });
    setIsAddingEducation(true);
    setEditingEducationIndex(null);
  };

  const cancelAddEducation = () => {
    setIsAddingEducation(false);
    setNewEducation({ level: "", institution: "", year: "", specialty: "" });
  };

  const saveEducation = (onError?: (message: string) => void) => {
    if (!newEducation.level || !newEducation.institution || !newEducation.year || !newEducation.specialty.trim()) {
      onError?.("Заполните все поля образования");
      return;
    }

    if (editingEducationIndex !== null) {
      const updated = [...educationsData];
      updated[editingEducationIndex] = { ...newEducation };
      setEducationsData(updated);
      setEditingEducationIndex(null);
    } else {
      setEducationsData([...educationsData, { ...newEducation }]);
      setIsAddingEducation(false);
    }

    setNewEducation({ level: "", institution: "", year: "", specialty: "" });
  };

  const editEducation = (index: number) => {
    setNewEducation({ ...educationsData[index] });
    setIsAddingEducation(true);
    setEditingEducationIndex(index);
  };

  const deleteEducation = (index: number) => {
    setEducationsData(educationsData.filter((_, i) => i !== index));
    if (editingEducationIndex === index) {
      setIsAddingEducation(false);
      setEditingEducationIndex(null);
      setNewEducation({ level: "", institution: "", year: "", specialty: "" });
    } else if (editingEducationIndex !== null && editingEducationIndex > index) {
      setEditingEducationIndex(editingEducationIndex - 1);
    }
  };

  return {
    educationsData,
    setEducationsData,
    isAddingEducation,
    editingEducationIndex,
    newEducation,
    setNewEducation,
    openAddEducationForm,
    cancelAddEducation,
    saveEducation,
    editEducation,
    deleteEducation,
  };
}

