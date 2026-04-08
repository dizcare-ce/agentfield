import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

interface HitlMarkdownProps {
  content: string;
}

export function HitlMarkdown({ content }: HitlMarkdownProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </Markdown>
    </div>
  );
}
