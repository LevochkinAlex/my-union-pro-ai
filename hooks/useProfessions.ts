import { useState } from "react";

export interface Profession {
  name: string;
  experience: string;
}

export function useProfessions() {
  const [professionsData, setProfessionsData] = useState<Profession[]>([]);
  const [isAddingProfession, setIsAddingProfession] = useState(false);
  const [editingProfessionIndex, setEditingProfessionIndex] = useState<number | null>(null);
  const [newProfession, setNewProfession] = useState<Profession>({
    name: "",
    experience: "",
  });

  const openAddProfessionForm = () => {
    setNewProfession({ name: "", experience: "" });
    setIsAddingProfession(true);
    setEditingProfessionIndex(null);
  };

  const cancelAddProfession = () => {
    setIsAddingProfession(false);
    setNewProfession({ name: "", experience: "" });
  };

  const saveProfession = (onError?: (message: string) => void) => {
    if (!newProfession.name.trim() || !newProfession.experience.trim()) {
      onError?.("Заполните все поля профессии");
      return;
    }

    if (editingProfessionIndex !== null) {
      const updated = [...professionsData];
      updated[editingProfessionIndex] = { ...newProfession };
      setProfessionsData(updated);
      setEditingProfessionIndex(null);
    } else {
      setProfessionsData([...professionsData, { ...newProfession }]);
      setIsAddingProfession(false);
    }

    setNewProfession({ name: "", experience: "" });
  };

  const editProfession = (index: number) => {
    setNewProfession({ ...professionsData[index] });
    setIsAddingProfession(true);
    setEditingProfessionIndex(index);
  };

  const deleteProfession = (index: number) => {
    setProfessionsData(professionsData.filter((_, i) => i !== index));
    if (editingProfessionIndex === index) {
      setIsAddingProfession(false);
      setEditingProfessionIndex(null);
      setNewProfession({ name: "", experience: "" });
    } else if (editingProfessionIndex !== null && editingProfessionIndex > index) {
      setEditingProfessionIndex(editingProfessionIndex - 1);
    }
  };

  return {
    professionsData,
    setProfessionsData,
    isAddingProfession,
    editingProfessionIndex,
    newProfession,
    setNewProfession,
    openAddProfessionForm,
    cancelAddProfession,
    saveProfession,
    editProfession,
    deleteProfession,
  };
}

