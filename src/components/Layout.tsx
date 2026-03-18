import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useTranslation } from 'react-i18next';

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors">
            <Wallet className="w-6 h-6" />
            <span className="text-xl font-semibold tracking-tight">{t('auth.title')}</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            {user && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium">
                      {user.displayName?.charAt(0) || 'U'}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">{user.displayName}</span>
                </div>
                <button
                  onClick={signOut}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  title={t('auth.signOut')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
