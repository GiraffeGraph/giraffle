export function getTemplateCategoryLabel(category: string) {
  switch (category) {
    case "blank":
      return "Blank";
    case "daily":
      return "Daily";
    case "meeting":
      return "Meeting";
    case "project":
      return "Project";
    case "weekly":
      return "Weekly";
    case "custom":
      return "Custom";
    default:
      return category;
  }
}
