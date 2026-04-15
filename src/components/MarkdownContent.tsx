import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ children, href }) => (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ),
};

type MarkdownContentProps = {
  className: string;
  markdown: string;
};

function MarkdownContent({ className, markdown }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeSanitize]}
        remarkPlugins={[remarkGfm]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  return <MarkdownContent className="markdown-preview" markdown={markdown} />;
}

export function MarkdownDocument({ markdown }: { markdown: string }) {
  return <MarkdownContent className="markdown-document" markdown={markdown} />;
}
