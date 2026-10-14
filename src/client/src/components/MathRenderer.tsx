import React, { useEffect, useRef } from "react";
import katex from "katex";

interface MathRendererProps {
  content: string;
  className?: string;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ content, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Parse LaTeX blocks ($$...$$ for display math, $...$ for inline math)
    const container = containerRef.current;
    
    if (!content) {
      container.innerHTML = "";
      return;
    }

    // Split content by inline and display math tokens
    let formatted = content;

    // Display math: $$...$$
    formatted = formatted.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math) => {
      try {
        return `<div class="my-2 py-1 overflow-x-auto text-center">${katex.renderToString(math, { displayMode: true, throwOnError: false })}</div>`;
      } catch (err) {
        return `<span class="text-rose-500 font-mono text-xs">[LaTeX Error: ${math}]</span>`;
      }
    });

    // Inline math: $...$
    formatted = formatted.replace(/\$([^\$\n]+?)\$/g, (_match, math) => {
      try {
        return katex.renderToString(math, { displayMode: false, throwOnError: false });
      } catch (err) {
        return `<span class="text-rose-500 font-mono text-xs">[LaTeX Error: ${math}]</span>`;
      }
    });

    // Markdown images: ![alt](url)
    formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
      return `<img src="${url}" alt="${alt}" class="my-2 max-h-48 rounded border border-slate-200 object-contain mx-auto" />`;
    });

    container.innerHTML = formatted;
  }, [content]);

  return <div ref={containerRef} class-name={className} />;
};
