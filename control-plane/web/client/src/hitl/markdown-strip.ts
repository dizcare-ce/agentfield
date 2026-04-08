export function stripMarkdown(markdown: string | undefined): string {
  if (!markdown) return "";

  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/[#*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
