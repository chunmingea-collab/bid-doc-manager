import { useCallback, useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Alert, Space, Table, Tag, Typography, Spin, Button, List } from 'antd';
import {
  FileTextOutlined,
  WarningOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FolderOpenOutlined,
  SearchOutlined,
  BellOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { DashboardStats } from '../../types/electron';

interface ExpiringDoc {
  id: string;
  fileName: string;
  expireDate: string;
  companyName: string;
  certificateNumber: string;
  daysLeft: number;
  bucket: 'overdue' | '30days' | '60days' | '90days';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ totalCount: 0, thisMonthCount: 0, errorCount: 0, expiringCount: 0 });
  const [recent, setRecent] = useState<Array<{ id: string; fileName: string; category: string | null; importStatus: string; createdAt: string }>>([]);
  const [reminders, setReminders] = useState<{
    overdue: ExpiringDoc[];
    within30Days: ExpiringDoc[];
    within60Days: ExpiringDoc[];
    within90Days: ExpiringDoc[];
  } | null>(null);

  // Derived: flat list sorted by daysLeft
  const expiringDocs = reminders
    ? [...reminders.overdue, ...reminders.within30Days, ...reminders.within60Days, ...reminders.within90Days]
      .sort((a, b) => a.daysLeft - b.daysLeft)
    : [];

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [s, reminderResult, recentResult] = await Promise.all([
        window.electronAPI.getDashboardStats(),
        window.electronAPI.checkReminders(),
        window.electronAPI.getRecentActivity(10).catch(() => []),
      ]);
      setStats(s);
      setReminders(reminderResult);
      setRecent(recentResult);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const expiringColumns = [
    {
      title: '文件名称',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      render: (name: string) => (
        <span style={{ cursor: 'pointer', color: '#1677ff' }}>{name}</span>
      ),
    },
    {
      title: '企业名称',
      dataIndex: 'companyName',
      key: 'companyName',
      width: 150,
      render: (name: string) => name || '--',
    },
    {
      title: '剩余天数',
      dataIndex: 'daysLeft',
      key: 'daysLeft',
      width: 100,
      render: (days: number) => {
        if (days < 0) return <Tag color="error">已过期 {Math.abs(days)} 天</Tag>;
        if (days <= 30) return <Tag color="warning">{days} 天</Tag>;
        return <Tag color="blue">{days} 天</Tag>;
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>资料总览</h2>

      {stats.totalCount === 0 && !loading && (
        <Card style={{ marginBottom: 24, background: '#fffbe6', borderColor: '#ffe58f' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <RocketOutlined style={{ fontSize: 24, color: '#fa8c16' }} />
              <Typography.Title level={4} style={{ margin: 0 }}>欢迎使用投标资料管理工具</Typography.Title>
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              三步开始管理你的投标资料。所有数据都保存在本机，零网络调用。
            </Typography.Paragraph>
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small" hoverable onClick={() => navigate('/import')}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <FolderOpenOutlined style={{ fontSize: 28, color: '#1677ff' }} />
                    <Typography.Text strong>1. 选择文件夹</Typography.Text>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                      把你电脑上的资料文件夹拖进来或点击选择。支持 PDF / Word / Excel / 图片。
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" hoverable onClick={() => navigate('/documents')}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <SearchOutlined style={{ fontSize: 28, color: '#52c41a' }} />
                    <Typography.Text strong>2. 搜索与分类</Typography.Text>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                      系统自动按 8 大类 27 子类关键词分类，也支持全文搜索文件名与内容。
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small" hoverable onClick={() => navigate('/settings')}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <BellOutlined style={{ fontSize: 28, color: '#fa8c16' }} />
                    <Typography.Text strong>3. 到期提醒</Typography.Text>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                      在「设置」里配置每天提醒时间，系统会在 30/60/90 天前自动通知。
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Col>
            </Row>
            <Button type="primary" size="large" icon={<FolderOpenOutlined />} onClick={() => navigate('/import')}>
              开始导入第一份资料
            </Button>
          </Space>
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic
              title="资料总数"
              value={stats.totalCount}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月新增"
              value={stats.thisMonthCount}
              prefix={<PlusOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="即将过期"
              value={stats.expiringCount}
              prefix={<WarningOutlined />}
              valueStyle={{ color: stats.expiringCount > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="处理异常"
              value={stats.errorCount}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: stats.errorCount > 0 ? '#faad14' : '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Space direction="vertical" style={{ marginTop: 24 }} size="large">
        <Card
          title="即将过期的资料"
          extra={
            <Button size="small" onClick={() => navigate('/documents')}>
              查看全部
            </Button>
          }
        >
          {expiringDocs.length > 0 ? (
            <Table
              rowKey="id"
              columns={expiringColumns}
              dataSource={expiringDocs.slice(0, 10)}
              pagination={false}
              size="small"
            />
          ) : (
            <Alert
              message="暂无即将过期的资料"
              description="系统会自动检测资料有效期，并在到期前30/60/90天提醒您"
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
            />
          )}
        </Card>

        {reminders && (
          <Card title="过期统计">
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="已过期"
                  value={reminders.overdue.length}
                  valueStyle={{ color: '#f5222d' }}
                  suffix="份"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="30天内"
                  value={reminders.within30Days.length}
                  valueStyle={{ color: '#faad14' }}
                  suffix="份"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="60天内"
                  value={reminders.within60Days.length}
                  valueStyle={{ color: '#1890ff' }}
                  suffix="份"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="90天内"
                  value={reminders.within90Days.length}
                  valueStyle={{ color: '#52c41a' }}
                  suffix="份"
                />
              </Col>
            </Row>
          </Card>
        )}

        {recent.length > 0 && (
          <Card
            title="最近活动"
            extra={
              <Button size="small" onClick={() => navigate('/documents')}>
                查看全部
              </Button>
            }
          >
            <List
              size="small"
              dataSource={recent}
              renderItem={(item) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/documents?focus=${item.id}`)}
                >
                  <List.Item.Meta
                    avatar={<FileTextOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                    title={
                      <Space>
                        <span>{item.fileName}</span>
                        {item.category && <Tag color="blue">{item.category}</Tag>}
                        {item.importStatus === 'error' && <Tag color="error">出错</Tag>}
                      </Space>
                    }
                    description={new Date(item.createdAt).toLocaleString('zh-CN')}
                  />
                </List.Item>
              )}
            />
          </Card>
        )}
      </Space>
    </div>
  );
}