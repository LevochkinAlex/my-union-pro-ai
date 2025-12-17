import { useState } from "react";

export interface Award {
  type: "ведомственная" | "государственная" | "профсоюзная";
  year: string;
  description: string;
}

export function useAwards() {
  const [awards, setAwards] = useState<Award[]>([]);
  const [isAddingAward, setIsAddingAward] = useState(false);
  const [editingAwardIndex, setEditingAwardIndex] = useState<number | null>(null);
  const [newAward, setNewAward] = useState<Award>({
    type: "ведомственная",
    year: "",
    description: "",
  });

  const openAddAwardForm = () => {
    setNewAward({ type: "ведомственная", year: "", description: "" });
    setIsAddingAward(true);
    setEditingAwardIndex(null);
  };

  const cancelAddAward = () => {
    setIsAddingAward(false);
    setNewAward({ type: "ведомственная", year: "", description: "" });
  };

  const saveAward = (onError?: (message: string) => void) => {
    if (!newAward.type || !newAward.year || !newAward.description.trim()) {
      onError?.("Заполните все поля награды");
      return;
    }

    if (editingAwardIndex !== null) {
      const updatedAwards = [...awards];
      updatedAwards[editingAwardIndex] = { ...newAward };
      setAwards(updatedAwards);
      setEditingAwardIndex(null);
    } else {
      setAwards([...awards, { ...newAward }]);
      setIsAddingAward(false);
    }

    setNewAward({ type: "ведомственная", year: "", description: "" });
  };

  const editAward = (index: number) => {
    setNewAward({ ...awards[index] });
    setIsAddingAward(true);
    setEditingAwardIndex(index);
  };

  const deleteAward = (index: number) => {
    setAwards(awards.filter((_, i) => i !== index));
    if (editingAwardIndex === index) {
      setIsAddingAward(false);
      setEditingAwardIndex(null);
      setNewAward({ type: "ведомственная", year: "", description: "" });
    } else if (editingAwardIndex !== null && editingAwardIndex > index) {
      setEditingAwardIndex(editingAwardIndex - 1);
    }
  };

  return {
    awards,
    setAwards,
    isAddingAward,
    editingAwardIndex,
    newAward,
    setNewAward,
    openAddAwardForm,
    cancelAddAward,
    saveAward,
    editAward,
    deleteAward,
  };
}

