import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { 
  LayoutDashboard, 
  Briefcase, 
  Users, 
  FilePieChart, 
  Settings, 
  LogOut, 
  Menu, 
  ChevronLeft, 
  ChevronRight, 
  User, 
  Clock 
} from 'lucide-react';
import GlobalSearch from '../common/GlobalSearch';
import NotificationBell from '../common/NotificationBell';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Jobs', path: '/jobs', icon: Briefcase },
    { name: 'Clients', path: '/clients', icon: Users },
    { name: 'Reports', path: '/reports', icon: FilePieChart },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  // Helper to generate custom human-readable role labeling badges
  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case 'senior_admin':
        return 'bg-danger-100 text-danger-500 border border-danger-500/10';
      case 'customs_broker':
        return 'bg-accent-100 text-accent-500 border border-accent-500/10';
      case 'freight_forwarder':
        return 'bg-primary-50 text-primary-700 border border-primary-500/10';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  const getRoleDisplayName = (role: string) => {
    return role ? role.replace('_', ' ').toUpperCase() : 'USER';
  };

  // Safe split breadcrumbs parser
  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    if (paths.length === 0) return [{ name: 'Dashboard', path: '/' }];
    
    return [
      { name: 'Dashboard', path: '/' },
      ...paths.map((p, index) => {
        const fullLink = '/' + paths.slice(0, index + 1).join('/');
        const cleanName = p.charAt(0).toUpperCase() + p.slice(1).replace('-', ' ');
        return { name: cleanName, path: fullLink };
      })
    ];
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans" id="clearpath-app-shell">
      {/* LEFT SIDEBAR PANEL */}
      <aside 
        className={`hidden sm:flex flex-col justify-between border-r border-slate-200 bg-white transition-all duration-300 shadow-sm z-30 ${
          isSidebarExpanded ? 'w-60' : 'w-16'
        }`}
        id="app-sidebar"
      >
        <div>
          {/* Sidebar Brand Logo and Collapse Control Button */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center text-white font-bold shrink-0 shadow-md">
                CP
              </div>
              {isSidebarExpanded && (
                <span className="font-bold text-lg text-primary-900 tracking-tight animate-fade-in text-ellipsis whitespace-nowrap overflow-hidden">
                  ClearPath
                </span>
              )}
            </div>
            {isSidebarExpanded && (
              <button 
                onClick={() => setIsSidebarExpanded(false)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer hidden md:block"
                title="Collapse sidebar"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {!isSidebarExpanded && (
              <button 
                onClick={() => setIsSidebarExpanded(true)}
                className="mx-auto p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer hidden md:block"
                title="Expand sidebar"
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>

          {/* Navigation Links Loop */}
          <nav className="p-3 space-y-1">
            {menuItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = location.pathname === item.path || 
                (item.path !== '/' && location.pathname.startsWith(item.path));
                
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  id={`nav-link-${item.name.toLowerCase()}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-primary-50 text-primary-700' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <IconComponent size={20} className={isActive ? 'text-primary-700' : 'text-slate-400'} />
                  {isSidebarExpanded && <span className="animate-fade-in">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info & Quick Action at Bottom */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          {user && (
            <div className="flex items-center justify-between gap-2 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary-900 flex items-center justify-center text-white font-bold shrink-0 shadow-sm border border-primary-700/20">
                  <User size={16} />
                </div>
                {isSidebarExpanded && (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold inline-block mt-0.5 ${getRoleBadgeClasses(user.role)}`}>
                      {getRoleDisplayName(user.role)}
                    </span>
                  </div>
                )}
              </div>
              {isSidebarExpanded && (
                <button 
                  onClick={logout}
                  className="p-1.5 text-slate-400 hover:text-danger-500 hover:bg-danger-100/50 rounded-md transition-colors cursor-pointer shrink-0"
                  title="Sign out of system"
                  id="btn-logout-sidebar"
                >
                  <LogOut size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* MOBILE MINI NAVIGATION BOTTOM OR TOP PANEL */}
      <aside className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 flex justify-around items-center h-14 px-2 shadow-lg">
        {menuItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = location.pathname === item.path || 
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex flex-col items-center justify-center py-1 flex-1 text-xs font-medium transition-colors ${
                isActive ? 'text-primary-700' : 'text-slate-500'
              }`}
            >
              <IconComponent size={18} />
              <span className="text-[10px] mt-0.5">{item.name}</span>
            </Link>
          );
        })}
        <button 
          onClick={logout}
          className="flex flex-col items-center justify-center py-1 flex-1 text-slate-500 text-xs hover:text-danger-500"
        >
          <LogOut size={18} />
          <span className="text-[10px] mt-0.5">Logout</span>
        </button>
      </aside>

      {/* RIGHT SIDE MASTER CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 sm:pb-0" id="main-frame-wrapper">
        {/* TOP HEADER STATUS PANEL */}
        <header className="h-16 border-b border-indigo-50 bg-white px-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-sm">
          {/* Left Block: Heading or Collapsible Menu Button for responsive drawer */}
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-slate-900 hidden sm:block">
              {getBreadcrumbs()[getBreadcrumbs().length - 1]?.name || 'ClearPath'}
            </h1>
            <div className="sm:hidden w-8 h-8 rounded bg-primary-700 text-white flex items-center justify-center font-bold text-sm">
              CP
            </div>
          </div>

          {/* Core Block: Global Search Form */}
          <div className="flex-1 max-w-md mx-4 md:mx-8">
            <GlobalSearch />
          </div>

          {/* Right Block: Realtime Bell Notification Area */}
          <div className="flex items-center gap-4 relative">
            <NotificationBell />
            
            {/* Quick mini info block on header */}
            <div className="hidden md:flex flex-col items-end text-right">
              <span className="text-xs font-semibold text-slate-900 leading-none">{user?.full_name}</span>
              <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{user?.role.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </header>

        {/* BREADCRUMBS ROW (Rendered only on secondary views to prevent noise) */}
        <div className="bg-white border-b border-slate-100 px-4 md:px-6 py-2.5 flex items-center gap-1.5 text-xs text-slate-400">
          {getBreadcrumbs().map((crumb, idx, arr) => (
            <React.Fragment key={crumb.path}>
              {idx > 0 && <span className="mx-0.5 text-slate-300">/</span>}
              {idx === arr.length - 1 ? (
                <span className="text-slate-700 font-medium truncate max-w-[120px]">{crumb.name}</span>
              ) : (
                <Link to={crumb.path} className="hover:text-primary-500 transition-colors">{crumb.name}</Link>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* PRIMARY MAIN LAYOUT CONTENT VIEW */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto" id="app-shell-main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
