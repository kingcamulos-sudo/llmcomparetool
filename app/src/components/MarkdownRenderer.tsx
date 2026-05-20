import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button, Typography } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { useState } from 'react';

const { Text } = Typography;

interface Props {
  content: string;
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeStr = String(children).replace(/\n$/, '');

            if (match) {
              return (
                <CodeBlock language={match[1]} code={codeStr} />
              );
            }

            return (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p style={{ margin: '4px 0', lineHeight: 1.75 }}>{children}</p>;
          },
          ul({ children }) {
            return <ul style={{ paddingLeft: 20, margin: '4px 0' }}>{children}</ul>;
          },
          ol({ children }) {
            return <ol style={{ paddingLeft: 20, margin: '4px 0' }}>{children}</ol>;
          },
          li({ children }) {
            return <li style={{ margin: '2px 0', lineHeight: 1.75 }}>{children}</li>;
          },
          h1({ children }) {
            return <h1 style={{ fontSize: 20, margin: '12px 0 8px', fontWeight: 700 }}>{children}</h1>;
          },
          h2({ children }) {
            return <h2 style={{ fontSize: 18, margin: '10px 0 6px', fontWeight: 700 }}>{children}</h2>;
          },
          h3({ children }) {
            return <h3 style={{ fontSize: 16, margin: '8px 0 4px', fontWeight: 600 }}>{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote style={{
                borderLeft: '4px solid #1677ff',
                padding: '4px 12px',
                margin: '8px 0',
                background: '#f6f8fa',
                borderRadius: '0 6px 6px 0',
                color: '#595959',
              }}>
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                <table style={{
                  borderCollapse: 'collapse',
                  width: '100%',
                  fontSize: 13,
                }}>
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th style={{
                border: '1px solid #e8e8e8',
                padding: '8px 12px',
                background: '#fafafa',
                fontWeight: 600,
                textAlign: 'left',
              }}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td style={{
                border: '1px solid #e8e8e8',
                padding: '8px 12px',
              }}>
                {children}
              </td>
            );
          },
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1677ff' }}>{children}</a>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: 'relative', margin: '8px 0', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 12px',
        background: '#f0f0f0',
        borderBottom: '1px solid #e8e8e8',
        fontSize: 12,
      }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{language}</Text>
        <Button
          size="small"
          type="text"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
          style={{ fontSize: 12 }}
        >
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <SyntaxHighlighter
        style={oneLight}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 8px 8px',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
