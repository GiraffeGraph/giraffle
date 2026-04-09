export interface NoteGptWorkspaceProps {
  notes: Array<{
    id: string;
    title: string;
    icon: string | null;
    folderId: string | null;
    updatedAtLabel: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    icon: string | null;
    parentId: string | null;
  }>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export type PromptModeId = "general" | "summary" | "plan" | "structure";

export interface PromptMode {
  id: PromptModeId;
  label: string;
  description: string;
  promptPrefix: string;
}

export interface PromptSuggestion {
  id: string;
  icon: string;
  title: string;
  body: string;
  prompt: string;
  mode: PromptModeId;
}

export interface StarterCard {
  id: string;
  icon: string;
  title: string;
  body: string;
  prompt: string;
  mode: PromptModeId;
}

export const PROMPT_MODES: PromptMode[] = [
  {
    id: "general",
    label: "Genel",
    description: "Serbest soru sor ve çalışma alanı üzerinden düşün.",
    promptPrefix: "Genel çalışma alanı analizi",
  },
  {
    id: "summary",
    label: "Özet",
    description: "Notları toparla, sinyal çıkar ve kısa sentez üret.",
    promptPrefix: "Özet modu",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Hedefleri adımlara böl ve uygulanabilir plan çıkar.",
    promptPrefix: "Planlama modu",
  },
  {
    id: "structure",
    label: "Yapı",
    description: "Klasör ve not organizasyonunu iyileştirmeye odaklan.",
    promptPrefix: "Yapı iyileştirme modu",
  },
];

export const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  {
    id: "library-summary",
    icon: "auto_awesome",
    title: "Bu kütüphaneyi özetle",
    body: "Genel yapı, baskın konular ve boşlukları tek bakışta çıkar.",
    prompt: "Bu kütüphaneyi genel yapısı, tekrar eden temaları ve dikkat çeken boşluklarıyla özetle.",
    mode: "summary",
  },
  {
    id: "focus-areas",
    icon: "radar",
    title: "Odak alanlarını çıkar",
    body: "Tüm notlar arasında hangi iş akışlarının öne çıktığını bul.",
    prompt: "Tüm notlar üzerinden ana odak alanlarını ve kümelenen çalışma başlıklarını çıkar.",
    mode: "summary",
  },
  {
    id: "structure-cleanup",
    icon: "folder_managed",
    title: "Klasör yapısını iyileştir",
    body: "Karmaşık veya dağınık alanlar için daha net bir yapı öner.",
    prompt: "Mevcut klasör ve not yapısını değerlendir, daha temiz ve ölçeklenebilir bir düzen öner.",
    mode: "structure",
  },
];

export const STARTER_CARDS: StarterCard[] = [
  {
    id: "weekly-brief",
    icon: "calendar_view_week",
    title: "Haftalık özet",
    body: "Yakın tarihte güncellenen notlardan hızlı bir çalışma özeti üret.",
    prompt: "Son güncellenen notları baz alarak bu hafta için kısa bir çalışma özeti çıkar.",
    mode: "summary",
  },
  {
    id: "plan-next",
    icon: "event_upcoming",
    title: "Sonraki adımlar",
    body: "Dağınık işleri somut aksiyon listesine dönüştür.",
    prompt: "Bu çalışma alanına bakarak önümüzdeki en mantıklı 5 adımı sıralı bir plan halinde çıkar.",
    mode: "plan",
  },
  {
    id: "cleanup-map",
    icon: "grid_view",
    title: "Yapı temizliği",
    body: "Kök notlar, klasörler ve tekrar eden başlıklar için düzen öner.",
    prompt: "Klasörsüz notlar, tekrar eden başlıklar ve dağınık alanlar için yapısal temizlik önerileri ver.",
    mode: "structure",
  },
];
