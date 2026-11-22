export const sections = [
  {
    id: "foundations",
    terms: "color palette swatch type font rhythm touch target reduced motion",
    name: "Foundations",
    detail: "Colour, typography, spacing and motion",
  },
  {
    id: "actions",
    terms:
      "button primary secondary outline ghost link tooltip icon capture pressed saving pending success disabled reset discard",
    name: "Buttons",
    detail: "Inset key, save states and destructive actions",
  },
  {
    id: "navigation",
    terms: "tabs rail sidebar dock archived",
    name: "Navigation",
    detail: "Destination tabs and vertical navigation",
  },
  {
    id: "fields",
    terms:
      "input textarea select form masked schedule calendar clock read only disabled show hide",
    name: "Text fields",
    detail: "Validation, password, date and time pickers",
  },
  {
    id: "selection",
    terms: "checkbox radio switch toggle disabled unavailable",
    name: "Selection",
    detail: "Checkboxes, radio choices and switches",
  },
  {
    id: "feedback",
    terms:
      "toast notification warning error empty skeleton loading retry queued upload",
    name: "Feedback",
    detail: "Receipts, alerts, upload progress and recovery",
  },
  {
    id: "expression",
    terms:
      "spinner splash launch animation empty folded map lucide bookmark compass",
    name: "Icons, illustration & loading",
    detail: "Fold mark, journey map and skeletons",
  },
  {
    id: "surfaces",
    terms: "cards row card avatar badge role density disclosure",
    name: "Rows & cards",
    detail: "Avatars, role badges and disclosures",
  },
  {
    id: "overlays",
    terms:
      "dialog menu sheet dropdown sort command destructive remove bookmark",
    name: "Menus & overlays",
    detail: "Sort, bookmarks, dialogs and sheets",
  },
] as const;
export type SectionId = (typeof sections)[number]["id"];
