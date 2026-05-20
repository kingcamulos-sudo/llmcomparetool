import { useState } from 'react';
import { Collapse, Input, Switch, Form, Space, Button } from 'antd';
import { SettingOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ApiConfig } from '../types';

interface Props {
  config: ApiConfig;
  onChange: (config: ApiConfig) => void;
}

export default function ConfigPanel({ config, onChange }: Props) {
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  const headers = config.headers || {};

  const addHeader = () => {
    const key = newHeaderKey.trim();
    if (!key) return;
    onChange({ ...config, headers: { ...headers, [key]: newHeaderValue } });
    setNewHeaderKey('');
    setNewHeaderValue('');
  };

  const removeHeader = (key: string) => {
    const next = { ...headers };
    delete next[key];
    onChange({ ...config, headers: next });
  };

  const updateHeader = (key: string, value: string) => {
    onChange({ ...config, headers: { ...headers, [key]: value } });
  };

  return (
    <Collapse
      defaultActiveKey={['api']}
      items={[
        {
          key: 'api',
          label: (
            <Space>
              <SettingOutlined />
              <span>API 配置</span>
            </Space>
          ),
          children: (
            <Form layout="vertical" size="small">
              <Form.Item label="API URL">
                <Input
                  value={config.url}
                  onChange={(e) => onChange({ ...config, url: e.target.value })}
                  placeholder="http://host:port/api/v1/prediction/xxx"
                />
              </Form.Item>
              <Form.Item label="Chat ID（留空则自动生成）">
                <Input
                  value={config.chatId}
                  onChange={(e) => onChange({ ...config, chatId: e.target.value })}
                  placeholder="可选，留空自动生成 UUID"
                />
              </Form.Item>
              <Form.Item label="启用流式输出 (SSE)">
                <Switch
                  checked={config.streaming}
                  onChange={(checked) => onChange({ ...config, streaming: checked })}
                  checkedChildren="SSE"
                  unCheckedChildren="关闭"
                />
              </Form.Item>

              {/* Custom Headers */}
              <Form.Item label="自定义请求头">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <Input
                        style={{ flex: 1 }}
                        value={key}
                        disabled
                        size="small"
                      />
                      <Input
                        style={{ flex: 2 }}
                        value={value}
                        onChange={(e) => updateHeader(key, e.target.value)}
                        placeholder="值"
                        size="small"
                      />
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeHeader(key)}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Input
                      style={{ flex: 1 }}
                      value={newHeaderKey}
                      onChange={(e) => setNewHeaderKey(e.target.value)}
                      placeholder="Header名"
                      size="small"
                      onPressEnter={addHeader}
                    />
                    <Input
                      style={{ flex: 2 }}
                      value={newHeaderValue}
                      onChange={(e) => setNewHeaderValue(e.target.value)}
                      placeholder="值"
                      size="small"
                      onPressEnter={addHeader}
                    />
                    <Button
                      size="small"
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={addHeader}
                      disabled={!newHeaderKey.trim()}
                    />
                  </div>
                </div>
              </Form.Item>
            </Form>
          ),
        },
      ]}
    />
  );
}
