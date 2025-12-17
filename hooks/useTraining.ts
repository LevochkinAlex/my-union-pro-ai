import { useState } from "react";

export interface Training {
  name: string;
  year: string;
  description: string;
}

export function useTraining() {
  const [training, setTraining] = useState<Training[]>([]);
  const [isAddingTraining, setIsAddingTraining] = useState(false);
  const [editingTrainingIndex, setEditingTrainingIndex] = useState<number | null>(null);
  const [newTraining, setNewTraining] = useState<Training>({
    name: "",
    year: "",
    description: "",
  });

  const openAddTrainingForm = () => {
    setNewTraining({ name: "", year: "", description: "" });
    setIsAddingTraining(true);
    setEditingTrainingIndex(null);
  };

  const cancelAddTraining = () => {
    setIsAddingTraining(false);
    setNewTraining({ name: "", year: "", description: "" });
  };

  const saveTraining = (onError?: (message: string) => void) => {
    if (!newTraining.name.trim() || !newTraining.year || !newTraining.description.trim()) {
      onError?.("Заполните все поля обучения");
      return;
    }

    if (editingTrainingIndex !== null) {
      const updated = [...training];
      updated[editingTrainingIndex] = { ...newTraining };
      setTraining(updated);
      setEditingTrainingIndex(null);
    } else {
      setTraining([...training, { ...newTraining }]);
      setIsAddingTraining(false);
    }

    setNewTraining({ name: "", year: "", description: "" });
  };

  const editTraining = (index: number) => {
    setNewTraining({ ...training[index] });
    setIsAddingTraining(true);
    setEditingTrainingIndex(index);
  };

  const deleteTraining = (index: number) => {
    setTraining(training.filter((_, i) => i !== index));
    if (editingTrainingIndex === index) {
      setIsAddingTraining(false);
      setEditingTrainingIndex(null);
      setNewTraining({ name: "", year: "", description: "" });
    } else if (editingTrainingIndex !== null && editingTrainingIndex > index) {
      setEditingTrainingIndex(editingTrainingIndex - 1);
    }
  };

  return {
    training,
    setTraining,
    isAddingTraining,
    editingTrainingIndex,
    newTraining,
    setNewTraining,
    openAddTrainingForm,
    cancelAddTraining,
    saveTraining,
    editTraining,
    deleteTraining,
  };
}

