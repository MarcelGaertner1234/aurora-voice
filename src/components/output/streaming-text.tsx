'use client';

import { motion } from 'framer-motion';
import { MarkdownView } from './markdown-view';

interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export function StreamingText({
  content,
  isStreaming = false,
  className = '',
}: StreamingTextProps) {
  return (
    <div className={`relative ${className}`}>
      <MarkdownView content={content} />

      {/* Streaming Cursor */}
      {isStreaming && (
        <motion.span
          className="inline-block h-5 w-2 bg-primary ml-1"
          animate={{ opacity: [1, 0] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
        />
      )}
    </div>
  );
}
