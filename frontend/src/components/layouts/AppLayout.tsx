// components/layouts/AppLayout.tsx
import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, Settings,
  Cpu, LogOut, Menu, X, Sun, Moon, UserCog,
  ChevronRight, Activity,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import toast from 'react-hot-toast';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/assessment', label: 'New Assessment',icon: ClipboardList },
  { to: '/patients',   label: 'Patients',      icon: Users },
  { to: '/models',     label: 'AI Models',     icon: Cpu,       adminOnly: true },
  { to: '/users',      label: 'Users',         icon: UserCog,   adminOnly: true },
  { to: '/settings',   label: 'Settings',      icon: Settings },
];

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out successfully');
    navigate('/login');
  };

  const navItems = NAV_ITEMS.filter(n => !n.adminOnly || user?.role === 'admin');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--glass-low)',
        borderRight: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(20px)',
        position: 'fixed',
        top: 0, left: sidebarOpen ? 0 : -240,
        height: '100vh',
        zIndex: 100,
        transition: 'left var(--transition-base)',
        overflowY: 'auto',
      }}
        className="hide-mobile"
      >
        <SidebarContent
          navItems={navItems}
          user={user}
          theme={theme}
          toggleTheme={toggleTheme}
          handleLogout={handleLogout}
          onNavClick={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Desktop sidebar (always visible) */}
      <aside style={{
        width: 240,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--glass-low)',
        borderRight: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(20px)',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
      }}
        className="hide-mobile"
      >
        <SidebarContent
          navItems={navItems}
          user={user}
          theme={theme}
          toggleTheme={toggleTheme}
          handleLogout={handleLogout}
          onNavClick={() => {}}
        />
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>
        {/* Mobile topbar */}
        <header style={{
          display: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--glass-low)',
          backdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
          className="show-mobile"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Activity size={20} color="var(--accent-blue)" />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>CDSS</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSidebarOpen(o => !o)}>
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </header>

        {/* Mobile drawer overlay */}
        {sidebarOpen && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ navItems, user, theme, toggleTheme, handleLogout, onNavClick }: {
  navItems: NavItem[];
  user: any;
  theme: string;
  toggleTheme: () => void;
  handleLogout: () => void;
  onNavClick: () => void;
}) {
  return (
    <>
      {/* Logo */}
      <div style={{ padding: '1.5rem 1.25rem 1rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-teal))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Activity size={18} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>CDSS</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pulmonary AI</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.75rem 0.75rem' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', padding: '0.5rem 0.5rem 0.25rem', textTransform: 'uppercase' }}>
          Navigation
        </div>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavClick}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              marginBottom: '2px',
              color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-blue-dim)' : 'transparent',
              border: isActive ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: isActive ? 600 : 400,
              transition: 'all var(--transition-fast)',
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: theme + user */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={toggleTheme}
          style={{ width: '100%', justifyContent: 'flex-start', gap: '0.65rem', marginBottom: '0.5rem' }}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.65rem',
          padding: '0.6rem 0.5rem',
          borderRadius: 'var(--radius-md)',
          background: 'var(--glass-low)',
          marginBottom: '0.5rem',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 700, color: 'white', flexShrink: 0,
          }}>
            {user?.full_name?.[0] ?? 'U'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name ?? 'User'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user?.role}</div>
          </div>
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={handleLogout}
          style={{ width: '100%', justifyContent: 'flex-start', gap: '0.65rem', color: 'var(--accent-red)' }}
        >
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </>
  );
}
