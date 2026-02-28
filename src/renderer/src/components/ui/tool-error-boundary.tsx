import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCcw, Home } from 'lucide-react'
import { Button } from './button'
import { Card, CardContent } from './card'

interface Props {
  children: ReactNode
  toolId: string
  onReset: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ToolErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ToolErrorBoundary caught an error in tool [${this.props.toolId}]:`, error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 animate-in fade-in duration-500">
          <Card className="max-w-md w-full glass-card border-red-500/20 bg-red-500/5">
            <CardContent className="pt-10 pb-10 flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-red-500/10 rounded-[2rem] flex items-center justify-center shadow-lg shadow-red-500/10">
                <AlertCircle size={40} className="text-red-500" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black tracking-tight">工具运行异常</h3>
                <p className="text-sm text-muted-foreground font-medium px-4">
                  抱歉，该工具组件在渲染过程中发生了未知错误。这可能是由于环境差异或插件 Bug 导致的。
                </p>
              </div>

              {this.state.error && (
                <div className="w-full p-3 bg-black/5 dark:bg-white/5 rounded-xl text-[10px] font-mono text-left overflow-auto max-h-32 opacity-60">
                  {this.state.error.toString()}
                </div>
              )}

              <div className="flex gap-3 w-full px-4">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl font-bold"
                  onClick={() => window.location.reload()}
                >
                  <Home className="mr-2 h-4 w-4" />
                  重启应用
                </Button>
                <Button
                  className="flex-1 rounded-xl font-bold bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
                  onClick={this.handleRetry}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  重试该工具
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
