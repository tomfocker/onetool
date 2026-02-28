import React from 'react'
import { Search, Sun, Moon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useGlobalStore } from '@/store'
import { cn } from '@/lib/utils'

interface HeaderProps {
  showSearch?: boolean
  searchQuery?: string
  onSearchChange?: (value: string) => void
}

export const Header: React.FC<HeaderProps> = ({
  showSearch = true,
  searchQuery = '',
  onSearchChange
}) => {
  const theme = useGlobalStore(state => state.theme)
  const toggleTheme = useGlobalStore(state => state.toggleTheme)

  return (
    <header className={cn(
      'h-12 fixed top-8 left-64 right-0 flex items-center px-6 z-20 transition-all duration-300',
      showSearch
        ? 'bg-white/60 dark:bg-[#2a2d35]/80 backdrop-blur-xl border-b border-white/20 dark:border-white/10 shadow-soft-sm'
        : 'bg-transparent border-none shadow-none pointer-events-none'
    )}>
      <div className={cn('flex-1 max-w-xl pointer-events-auto', !showSearch && 'invisible')}>
        {showSearch && (
          <div className='relative group'>
            <Search className='absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground transition-colors duration-300 group-focus-within:text-primary' size={18} />
            <Input
              placeholder='搜索工具...'
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className='pl-11 bg-white/50 dark:bg-white/10 backdrop-blur-sm border-white/20 dark:border-white/10 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:bg-white/70 dark:focus-visible:bg-white/15 rounded-xl transition-all duration-300'
            />
          </div>
        )}
      </div>

      <div className='flex items-center gap-4 pointer-events-auto'>
        <div className='flex items-center gap-3 bg-white/50 dark:bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20 dark:border-white/10 shadow-soft-sm'>
          <Sun className={`h-4 w-4 transition-all duration-300 ${theme === 'dark' ? 'text-muted-foreground' : 'text-amber-500'}`} />
          <button
            onClick={toggleTheme}
            className='relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
            style={{ backgroundColor: theme === 'dark' ? '#6d28d9' : '#d1d5db' }}
          >
            <div
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 flex items-center justify-center ${theme === 'dark' ? 'left-8' : 'left-1'}`}
            >
              {theme === 'dark' ? (
                <Moon className='h-3 w-3 text-purple-600' />
              ) : (
                <Sun className='h-3 w-3 text-amber-500' />
              )}
            </div>
          </button>
          <Moon className={`h-4 w-4 transition-all duration-300 ${theme === 'dark' ? 'text-purple-400' : 'text-muted-foreground'}`} />
        </div>
      </div>
    </header>
  )
}
