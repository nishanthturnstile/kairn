import type { ReaderStory } from "@kairn/contracts";
import { hydrateRoot } from "react-dom/client";
import { Story } from "./story";
import "../index.css";

const root = document.getElementById("reader");
const data = document.getElementById("reader-data");
if (root && data?.textContent) {
  const story: ReaderStory | null = JSON.parse(data.textContent);
  hydrateRoot(root, <Story story={story} />);
}
