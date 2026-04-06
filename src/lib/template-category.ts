export function getTemplateCategoryLabel(category: string) {
  switch (category) {
    case "blank":
      return "Boş";
    case "daily":
      return "Günlük";
    case "meeting":
      return "Toplantı";
    case "project":
      return "Proje";
    case "weekly":
      return "Haftalık";
    case "custom":
      return "Özel";
    default:
      return category;
  }
}
