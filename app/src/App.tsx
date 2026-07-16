import { useState, useEffect, useCallback, useRef } from 'react';
import { ConfigProvider, theme, Layout, Typography, Progress, Flex, Button } from 'antd';
import {
  SwapOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import type { ApiConfig, QuestionResult, RunRecord, SourceDocument, UsedTool } from './types';
import ConfigPanel from './components/ConfigPanel';
import QuestionInput from './components/QuestionInput';
import ResponsePanel from './components/ResponsePanel';
import RecordPanel from './components/RecordPanel';
import ComparePanel from './components/ComparePanel';
import {
  sendQuestionsBatch,
  listenStreamChunk,
  listenFlowiseExtra,
  listenBatchComplete,
  DEFAULT_API_CONFIG,
} from './services/api';
import { loadRecords, addRecord, deleteRecord, generateId } from './services/storage';
import type { UnlistenFn } from '@tauri-apps/api/event';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

type LiveResult = {
  question: string;
  response: string;
  status: 'streaming' | 'done' | 'error';
  error?: string;
  sourceDocuments?: SourceDocument[];
  usedTools?: UsedTool[];
};

function App() {
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    const saved = localStorage.getItem('llm_api_config');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return DEFAULT_API_CONFIG;
  });

  const [isRunning, setIsRunning] = useState(false);
  const [liveResults, setLiveResults] = useState<Map<number, LiveResult>>(new Map());
  const [completedResults, setCompletedResults] = useState<QuestionResult[]>([]);
  const [records, setRecords] = useState<RunRecord[]>(() => loadRecords());
  const [compareIds, setCompareIds] = useState<string[] | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const unlistenRef = useRef<UnlistenFn[]>([]);
  const listenersReadyRef = useRef(false);

  useEffect(() => {
    localStorage.setItem('llm_api_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  useEffect(() => {
    // Prevent double registration in React Strict Mode
    if (listenersReadyRef.current) return;
    listenersReadyRef.current = true;

    const setup = async () => {
      const un1 = await listenStreamChunk((chunk) => {
        setLiveResults((prev) => {
          const next = new Map(prev);
          const existing = next.get(chunk.question_index);
          if (existing) {
            next.set(chunk.question_index, {
              ...existing,
              response: existing.response + chunk.chunk,
              status: chunk.done ? 'done' : 'streaming',
            });
          } else {
            next.set(chunk.question_index, {
              question: chunk.question,
              response: chunk.chunk,
              status: chunk.done ? 'done' : 'streaming',
            });
          }
          return next;
        });
      });

      const un2 = await listenFlowiseExtra((extra) => {
        setLiveResults((prev) => {
          const next = new Map(prev);
          const existing = next.get(extra.question_index);
          if (existing) {
            const updated = { ...existing };
            if (extra.event_type === 'sourceDocuments' && Array.isArray(extra.data)) {
              updated.sourceDocuments = extra.data as SourceDocument[];
            }
            if (extra.event_type === 'usedTools' && Array.isArray(extra.data)) {
              updated.usedTools = extra.data as UsedTool[];
            }
            next.set(extra.question_index, updated);
          }
          return next;
        });
      });

      const un3 = await listenBatchComplete((results) => {
        setCompletedResults(results);
        setIsRunning(false);
        setProgressPercent(100);
      });

      unlistenRef.current = [un1, un2, un3];
    };
    setup();

    return () => {
      unlistenRef.current.forEach((un) => un());
    };
  }, []);

  const handleBatchSubmit = useCallback(
    async (questions: string[]) => {
      setIsRunning(true);
      setLiveResults(new Map(
        questions.map((question, index) => [
          index,
          { question, response: '', status: 'streaming' as const },
        ])
      ));
      setCompletedResults([]);
      setProgressPercent(0);

      const chatId = apiConfig.chatId || crypto.randomUUID();

      try {
        const results = await sendQuestionsBatch(
          apiConfig.url,
          questions,
          chatId,
          apiConfig.streaming,
          apiConfig.headers
        );

        setCompletedResults(results);
        // Keep the live view reliable even if an SSE event was missed or streaming is disabled.
        setLiveResults((prev) => {
          const next = new Map(prev);
          results.forEach((result) => {
            const existing = next.get(result.question_index);
            next.set(result.question_index, {
              question: result.question,
              response: result.full_response || existing?.response || '',
              status: result.success ? 'done' : 'error',
              error: result.error || undefined,
              sourceDocuments: result.source_documents,
              usedTools: result.used_tools,
            });
          });
          return next;
        });

        const record: RunRecord = {
          id: generateId(),
          name: `运行 ${new Date().toLocaleString()}`,
          apiConfig: { ...apiConfig, chatId },
          questions,
          results,
          createdAt: new Date().toISOString(),
        };
        const updatedRecords = addRecord(record);
        setRecords(updatedRecords);
      } catch (err) {
        console.error('Batch failed:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setLiveResults((prev) => {
          const next = new Map(prev);
          next.forEach((result, index) => {
            next.set(index, {
              ...result,
              status: 'error',
              error: errorMessage,
            });
          });
          return next;
        });
      } finally {
        setIsRunning(false);
        setProgressPercent(100);
      }
    },
    [apiConfig]
  );

  const handleDeleteRecord = useCallback((id: string) => {
    const updated = deleteRecord(id);
    setRecords(updated);
  }, []);

  const handleCompare = useCallback((ids: string[]) => {
    setCompareIds(ids);
  }, []);

  const handleCloseCompare = useCallback(() => {
    setCompareIds(null);
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f5f5f5',
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '0 24px',
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <SwapOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={4} style={{ margin: 0, color: '#1a1a1a' }}>
            LLM Compare Tool
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            批量问题请求 & 响应对比工具
          </Text>
        </Header>

        <Layout>
          {!siderCollapsed && (
            <Sider
              width={400}
              style={{
                background: '#ffffff',
                borderRight: '1px solid #f0f0f0',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: 16,
                height: 'calc(100vh - 64px)',
                position: 'sticky',
                top: 64,
              }}
            >
              <Flex vertical gap={16}>
                <ConfigPanel config={apiConfig} onChange={setApiConfig} />
                <QuestionInput onSubmit={handleBatchSubmit} disabled={isRunning} records={records} />
                <RecordPanel
                  records={records}
                  onDelete={handleDeleteRecord}
                  onSelectForCompare={handleCompare}
                />
              </Flex>
            </Sider>
          )}

          <Content
            style={{
              padding: 24,
              overflowY: 'auto',
              overflowX: 'hidden',
              background: '#f5f5f5',
              height: 'calc(100vh - 64px)',
              position: 'relative',
            }}
          >
            {/* Sidebar toggle button */}
            <Button
              type="text"
              icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setSiderCollapsed(!siderCollapsed)}
              style={{
                position: 'fixed',
                top: 76,
                left: siderCollapsed ? 8 : 384,
                zIndex: 100,
                background: '#fff',
                border: '1px solid #e8e8e8',
                borderRadius: 6,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                transition: 'left 0.2s',
              }}
            />
            {isRunning && (
              <Progress
                percent={progressPercent}
                status="active"
                strokeColor={{ from: '#1677ff', to: '#722ed1' }}
                style={{ marginBottom: 16 }}
              />
            )}

            {compareIds ? (
              <ComparePanel
                records={records}
                selectedIds={compareIds}
                onClose={handleCloseCompare}
              />
            ) : (
              <ResponsePanel
                results={liveResults}
                allResults={completedResults}
              />
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
