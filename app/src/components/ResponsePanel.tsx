import { useState } from 'react';
import { Tabs, Tag, Button, Empty, Space, Typography, Avatar, Modal, message } from 'antd';
import {
  PrinterOutlined,
  DownloadOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  UserOutlined,
  RobotOutlined,
  FileSearchOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { QuestionResult, SourceDocument, UsedTool } from '../types';
import { exportResultsToExcel } from '../utils/exportExcel';
import MarkdownRenderer from './MarkdownRenderer';

const { Text } = Typography;

interface LiveResult {
  question: string;
  response: string;
  status: 'streaming' | 'done' | 'error';
  error?: string;
  sourceDocuments?: SourceDocument[];
  usedTools?: UsedTool[];
}

interface Props {
  results: Map<number, LiveResult>;
  allResults: QuestionResult[];
}

function handlePrint(content: string, title: string) {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(`
      <html><head><title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; padding: 24px; max-width: 800px; margin: 0 auto; }
        h2 { color: #1677ff; border-bottom: 2px solid #1677ff; padding-bottom: 8px; }
        pre { white-space: pre-wrap; word-wrap: break-word; background: #f5f5f5; padding: 16px; border-radius: 8px; line-height: 1.8; }
      </style>
      </head><body>
      <h2>${title}</h2>
      <pre>${content}</pre>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }
}

function ChatBubble({
  role,
  children,
  status,
  iconOverride,
  bgColorOverride,
}: {
  role: 'user' | 'assistant' | 'source' | 'tool';
  children: React.ReactNode;
  status?: 'streaming' | 'done' | 'error';
  iconOverride?: React.ReactNode;
  bgColorOverride?: string;
}) {
  const isUser = role === 'user';
  const avatarBg = role === 'source' ? '#13c2c2' : role === 'tool' ? '#722ed1' : '#1677ff';
  const defaultIcon = role === 'source' ? <FileSearchOutlined /> : role === 'tool' ? <ToolOutlined /> : <RobotOutlined />;
  const bubbleBg = bgColorOverride || (isUser ? '#1677ff' : '#ffffff');
  const isLeft = !isUser;

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 8,
      }}
    >
      {isLeft && (
        <Avatar
          size={32}
          icon={iconOverride || defaultIcon}
          style={{ backgroundColor: avatarBg, flexShrink: 0, marginTop: 2 }}
        />
      )}
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 16px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: bubbleBg,
          color: isUser ? '#fff' : '#333',
          border: isUser ? 'none' : '1px solid #e8e8e8',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          fontSize: 14,
          lineHeight: 1.75,
        }}
      >
        {children}
        {status === 'streaming' && (
          <span className="typing-cursor">▊</span>
        )}
      </div>
      {isUser && (
        <Avatar
          size={32}
          icon={<UserOutlined />}
          style={{ backgroundColor: '#87d068', flexShrink: 0, marginTop: 2 }}
        />
      )}
    </div>
  );
}

/** Used Tools — Flowise-style inline pill buttons + Modal for full detail */
function UsedToolsBubbles({ tools }: { tools: UsedTool[] }) {
  const [modalTool, setModalTool] = useState<{ tool: UsedTool; index: number } | null>(null);

  return (
    <>
      <div style={{ marginLeft: 42, display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {tools.map((tool, i) => (
          <div
            key={i}
            onClick={() => setModalTool({ tool, index: i })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 12px',
              background: '#f9f0ff',
              border: '1px solid #d3adf7',
              borderRadius: 16,
              cursor: 'pointer',
              fontSize: 13,
              color: '#531dab',
              transition: 'all 0.2s',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = '#efdbff';
              (e.currentTarget as HTMLDivElement).style.borderColor = '#b37feb';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = '#f9f0ff';
              (e.currentTarget as HTMLDivElement).style.borderColor = '#d3adf7';
            }}
          >
            <ToolOutlined style={{ fontSize: 12 }} />
            <span>{tool.tool}</span>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      <Modal
        title={modalTool ? (
          <Space>
            <ToolOutlined style={{ color: '#722ed1' }} />
            <span>{modalTool.tool.tool}</span>
          </Space>
        ) : ''}
        open={!!modalTool}
        onCancel={() => setModalTool(null)}
        footer={null}
        width={720}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        {modalTool && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Input</Text>
              <div style={{
                padding: 12, background: '#fafafa', borderRadius: 8,
                border: '1px solid #f0f0f0', maxHeight: 200, overflowY: 'auto',
              }}>
                <pre style={{
                  whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0,
                  fontSize: 13, lineHeight: 1.6,
                }}>
                  {typeof modalTool.tool.toolInput === 'string'
                    ? modalTool.tool.toolInput
                    : JSON.stringify(modalTool.tool.toolInput, null, 2)}
                </pre>
              </div>
            </div>
            <div>
              <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Output</Text>
              <div style={{
                padding: 16, background: '#fafafa', borderRadius: 8,
                border: '1px solid #f0f0f0',
              }}>
                <MarkdownRenderer content={modalTool.tool.toolOutput || '(empty)'} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Source Documents — Flowise-style inline pill buttons + Modal for full content */
function SourceDocsBubbles({ docs }: { docs: SourceDocument[] }) {
  const [modalDoc, setModalDoc] = useState<{ doc: SourceDocument; index: number } | null>(null);

  // Extract a short title from pageContent (first heading or first line)
  const getDocTitle = (doc: SourceDocument, idx: number): string => {
    const content = doc.pageContent || '';
    const headingMatch = content.match(/^#{1,3}\s+(.+)$/m);
    if (headingMatch) return headingMatch[1].trim();
    const firstLine = content.split('\n').find(l => l.trim())?.trim() || '';
    if (firstLine.length > 40) return firstLine.substring(0, 40) + '...';
    return firstLine || `Document #${idx + 1}`;
  };

  return (
    <>
      <div style={{ marginLeft: 42, display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {docs.map((doc, i) => {
          const title = getDocTitle(doc, i);
          const score = doc.metadata?.score;

          return (
            <div
              key={i}
              onClick={() => setModalDoc({ doc, index: i })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 12px',
                background: '#e6fffb',
                border: '1px solid #87e8de',
                borderRadius: 16,
                cursor: 'pointer',
                fontSize: 13,
                color: '#006d75',
                transition: 'all 0.2s',
                userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = '#b5f5ec';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#5cdbd3';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = '#e6fffb';
                (e.currentTarget as HTMLDivElement).style.borderColor = '#87e8de';
              }}
            >
              <FileSearchOutlined style={{ fontSize: 12 }} />
              <span>{title}</span>
              {score !== undefined && typeof score === 'number' && (
                <span style={{ fontSize: 10, color: '#999', marginLeft: 2 }}>
                  {score.toFixed(2)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      <Modal
        title={modalDoc ? (
          <Space>
            <FileSearchOutlined style={{ color: '#08979c' }} />
            <span>{getDocTitle(modalDoc.doc, modalDoc.index)}</span>
            {modalDoc.doc.metadata?.score !== undefined && (
              <Tag color="green">
                Score: {typeof modalDoc.doc.metadata.score === 'number'
                  ? modalDoc.doc.metadata.score.toFixed(4)
                  : String(modalDoc.doc.metadata.score)}
              </Tag>
            )}
          </Space>
        ) : ''}
        open={!!modalDoc}
        onCancel={() => setModalDoc(null)}
        footer={null}
        width={720}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        {modalDoc && (
          <div>
            <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(modalDoc.doc.metadata || {}).map(([key, val]) => (
                <Tag key={key} style={{ fontSize: 11 }}>
                  {key}: {String(val)}
                </Tag>
              ))}
            </div>
            <div style={{
              padding: 16, background: '#fafafa', borderRadius: 8,
              border: '1px solid #f0f0f0',
            }}>
              <MarkdownRenderer content={modalDoc.doc.pageContent || '(empty)'} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Render extra info (sourceDocuments & usedTools) as chat bubbles */
function ExtraInfoBubbles({
  sourceDocuments,
  usedTools,
}: {
  sourceDocuments?: SourceDocument[];
  usedTools?: UsedTool[];
}) {
  if ((!sourceDocuments || sourceDocuments.length === 0) && (!usedTools || usedTools.length === 0)) {
    return null;
  }
  return (
    <>
      {usedTools && usedTools.length > 0 && <UsedToolsBubbles tools={usedTools} />}
      {sourceDocuments && sourceDocuments.length > 0 && <SourceDocsBubbles docs={sourceDocuments} />}
    </>
  );
}

export default function ResponsePanel({ results, allResults }: Props) {
  const [activeTab, setActiveTab] = useState('live');
  const [messageApi, contextHolder] = message.useMessage();

  const handleExportAll = async () => {
    try {
      const savedPath = await exportResultsToExcel(allResults);
      if (savedPath) {
        messageApi.success('Excel 文件已保存到本地');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      messageApi.error(`导出失败：${errorMessage}`);
    }
  };

  const renderLiveResponses = () => {
    if (results.size === 0) {
      return (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待请求..." />
      );
    }
    return Array.from(results.entries()).map(([index, item]) => (
      <div key={index} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Space>
            <Tag color="blue">#{index + 1}</Tag>
            {item.status === 'streaming' && <Tag icon={<LoadingOutlined spin />} color="processing">流式中</Tag>}
            {item.status === 'done' && <Tag icon={<CheckCircleOutlined />} color="success">完成</Tag>}
            {item.status === 'error' && <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>}
          </Space>
          {item.status === 'done' && (
            <Button size="small" icon={<PrinterOutlined />}
              onClick={() => handlePrint(item.response, `问题: ${item.question}`)}>
              打印
            </Button>
          )}
        </div>
        <ChatBubble role="user">{item.question}</ChatBubble>
        <ChatBubble role="assistant" status={item.status}>
          {item.response ? (
            <div style={{ color: '#333' }}>
              <MarkdownRenderer content={item.response} />
            </div>
          ) : item.status === 'streaming' ? (
            <Text type="secondary">等待响应...</Text>
          ) : null}
        </ChatBubble>
        {item.error && <Text type="danger" style={{ marginLeft: 42 }}>错误: {item.error}</Text>}
        <ExtraInfoBubbles sourceDocuments={item.sourceDocuments} usedTools={item.usedTools} />
      </div>
    ));
  };

  const renderAllResponses = () => {
    if (allResults.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无完整结果" />;
    }
    return allResults.map((result, i) => (
      <div key={i} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Space>
            <Tag color="blue">#{i + 1}</Tag>
            <Tag icon={result.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              color={result.success ? 'success' : 'error'}>
              {result.success ? '成功' : '失败'}
            </Tag>
          </Space>
          <Button size="small" icon={<PrinterOutlined />}
            onClick={() => handlePrint(result.full_response, `问题: ${result.question}`)}>
            打印
          </Button>
        </div>
        <ChatBubble role="user">{result.question}</ChatBubble>
        <ChatBubble role="assistant">
          <div style={{ color: '#333' }}>
            <MarkdownRenderer content={result.full_response} />
          </div>
        </ChatBubble>
        {result.error && <Text type="danger" style={{ marginLeft: 42 }}>错误: {result.error}</Text>}
        <ExtraInfoBubbles
          sourceDocuments={result.source_documents as SourceDocument[] | undefined}
          usedTools={result.used_tools as UsedTool[] | undefined}
        />
      </div>
    ));
  };

  return (
    <div>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'live', label: <Space><ThunderboltOutlined />实时响应</Space> },
            { key: 'all', label: <Space><FileTextOutlined />完整结果</Space> },
          ]}
        />
        {allResults.length > 0 && (
          <Button icon={<DownloadOutlined />} onClick={handleExportAll}>导出全部</Button>
        )}
      </div>
      {activeTab === 'live' ? renderLiveResponses() : renderAllResponses()}
    </div>
  );
}
