import React from "react";
import { Result, Button, Typography } from "antd";

const { Paragraph, Text } = Typography;

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface Props {
  children: React.ReactNode;
}

/**
 * Top-level renderer error boundary. Prevents a single component crash from
 * rendering a blank white window. Captures errors thrown during render or
 * lifecycle and surfaces a recovery affordance.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  private reset = (): void => {
    this.setState({ error: null, errorInfo: null });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error, errorInfo } = this.state;
    if (!error) return this.props.children;

    return (
      <Result
        status="error"
        title="界面渲染出现异常"
        subTitle="请尝试返回上一步，或者重新加载页面。如反复出现，请将下方信息提交给开发者。"
        extra={[
          <Button key="reset" type="primary" onClick={this.reset}>
            重试
          </Button>,
          <Button key="reload" onClick={this.reload}>
            重新加载页面
          </Button>,
        ]}
      >
        <div style={{ textAlign: "left", maxWidth: 720, margin: "0 auto" }}>
          <Paragraph>
            <Text strong>错误信息：</Text>
            <Text code copyable>{error.message}</Text>
          </Paragraph>
          {errorInfo?.componentStack && (
            <Paragraph>
              <Text strong>组件栈：</Text>
              <pre style={{ background: "#fafafa", padding: 12, borderRadius: 4, fontSize: 12, overflowX: "auto" }}>
                {errorInfo.componentStack}
              </pre>
            </Paragraph>
          )}
        </div>
      </Result>
    );
  }
}
