'use client';

import { memo, Component, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';

// Error Boundary for catching markdown rendering errors
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class MarkdownErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Markdown rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="text-foreground-secondary text-sm p-2 bg-background-secondary rounded">
          <p>Markdown konnte nicht gerendert werden.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView = memo(function MarkdownView({
  content,
  className = '',
}: MarkdownViewProps) {
  if (!content) {
    return null;
  }

  return (
    <motion.div
      className={`markdown-content ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <MarkdownErrorBoundary>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
          // Custom heading rendering
          h1: ({ children }) => (
            <h1 className="text-xl font-semibold text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground">{children}</h3>
          ),
          // Custom code blocks
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;

            if (isInline) {
              return (
                <code
                  className="rounded bg-background-secondary px-1.5 py-0.5 font-mono text-sm"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code className={`block font-mono text-sm ${className}`} {...props}>
                {children}
              </code>
            );
          },
          // Custom pre blocks
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-background-secondary p-4 text-sm">
              {children}
            </pre>
          ),
          // Custom links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          ),
          // Custom lists
          ul: ({ children }) => (
            <ul className="list-disc pl-6 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 space-y-1">{children}</ol>
          ),
          // Custom blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary pl-4 italic text-foreground-secondary">
              {children}
            </blockquote>
          ),
          // Task lists (GFM)
          li: ({ children, ...props }) => {
            return (
              <li className="text-foreground" {...props}>
                {children}
              </li>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
      </MarkdownErrorBoundary>
    </motion.div>
  );
});
