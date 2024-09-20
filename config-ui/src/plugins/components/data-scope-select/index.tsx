/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import { useState, useEffect, useCallback } from 'react';
import { RedoOutlined, PlusOutlined } from '@ant-design/icons';
import { Flex, Button, Input, Space, Tag } from 'antd';
import { MillerColumns } from '@mints/miller-columns';
import { useDebounce } from '@mints/hooks';

import API from '@/api';
import { Loading, Block, ExternalLink, Message } from '@/components';
import { getPluginScopeId } from '@/plugins';

interface Props {
  plugin: string;
  connectionId: ID;
  showWarning?: boolean;
  initialScope?: any[];
  onCancel?: () => void;
  onSubmit?: (scope: any) => void;
}

export const DataScopeSelect = ({
  plugin,
  connectionId,
  showWarning = false,
  initialScope,
  onSubmit,
  onCancel,
}: Props) => {
  const [selectedIds, setSelectedIds] = useState<ID[]>([]);
  const [selectedScope, setSelectedScope] = useState<
    Array<{
      id: ID;
      name: string;
    }>
  >([]);
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState(0);

  const searchDebounce = useDebounce(search, { wait: 500 });

  useEffect(() => {
    setSelectedIds((initialScope ?? []).map((it) => getPluginScopeId(plugin, it.scope)));
    setSelectedScope(
      (initialScope ?? []).map((it) => ({
        id: getPluginScopeId(plugin, it.scope),
        name: it.scope.fullName ?? it.scope.name,
      })),
    );
  }, []);

  const request = useCallback(
    async (_?: string | number, params?: any) => {
      const res = await API.scope.list(plugin, connectionId, {
        page: params?.page ?? 1,
        pageSize: 20,
        searchTerm: searchDebounce,
      });

      return {
        data: res.scopes.map((it) => ({
          parentId: null,
          id: getPluginScopeId(plugin, it.scope),
          title: it.scope.fullName ?? it.scope.name,
          canExpand: false,
          original: it,
        })),
        hasMore: res.count > (params?.page ?? 1) * 20,
        params: {
          page: (params?.page ?? 1) + 1,
        },
      };
    },
    [plugin, connectionId, searchDebounce, version],
  );

  const handleSubmit = () => onSubmit?.(selectedIds);

  return (
    <Block
      title="Select Data Scope"
      description={
        <>
          If no Data Scope appears in the dropdown list, please{' '}
          <ExternalLink link={`/connections/${plugin}/${connectionId}`}>add one to this connection</ExternalLink> first.
        </>
      }
      required
    >
      <Flex vertical gap="middle">
        {showWarning ? (
          <Message
            style={{ marginBottom: 24 }}
            content={
              <>
                Unchecking Data Scope below will only remove it from the current Project and will not delete the
                historical data. If you would like to delete the data of Data Scope, please{' '}
                <ExternalLink link={`/connections/${plugin}/${connectionId}`}>go to the Connection page</ExternalLink>.
              </>
            }
          />
        ) : (
          <Flex>
            <Button type="primary" icon={<RedoOutlined />} onClick={() => setVersion(version + 1)}>
              Refresh Data Scope
            </Button>
          </Flex>
        )}
        <Space wrap>
          {selectedScope.length ? (
            selectedScope.map(({ id, name }) => {
              return (
                <Tag
                  key={id}
                  color="blue"
                  closable
                  onClose={() => setSelectedIds(selectedIds.filter((it) => it !== id))}
                >
                  {name}
                </Tag>
              );
            })
          ) : (
            <span>Please select scope...</span>
          )}
        </Space>
        <div>
          <Input.Search value={search} onChange={(e) => setSearch(e.target.value)} />
          <MillerColumns
            bordered
            theme={{
              colorPrimary: '#7497f7',
              borderColor: '#dbe4fd',
            }}
            request={request}
            columnHeight={200}
            renderLoading={() => <Loading size={20} style={{ padding: '4px 12px' }} />}
            renderError={() => <span style={{ color: 'red' }}>Something Error</span>}
            renderNoData={() => (
              <Flex style={{ height: '100%' }} justify="center" align="center">
                <ExternalLink link={`/connections/${plugin}/${connectionId}`}>
                  <Button type="primary" icon={<PlusOutlined />}>
                    Add Data Scope
                  </Button>
                </ExternalLink>
              </Flex>
            )}
            selectable
            selectedIds={selectedIds}
            onSelectedIds={(ids, data) => {
              setSelectedIds(ids);
              setSelectedScope(
                (data ?? []).map((it) => ({
                  id: it.scope.id,
                  name: it.scope.name,
                })),
              );
            }}
          />
        </div>
        <Flex justify="flex-end" gap="small">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" disabled={!selectedIds.length} onClick={handleSubmit}>
            Save
          </Button>
        </Flex>
      </Flex>
    </Block>
  );
};
