export interface ReaderStory {
  title: string;
  summary: string;
  chapters: readonly { id: string; title: string; body: string }[];
}
