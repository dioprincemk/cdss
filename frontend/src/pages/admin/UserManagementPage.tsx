// pages/admin/UserManagementPage.tsx
import { useEffect, useState } from 'react';
import { UserCog, Shield, Stethoscope, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/utils/helpers';
import { userApi } from '@/services/api';
import type { User } from '@/types';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';

export default function UserManagementPage() {
  const [users, setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: me } = useAuthStore();

  const load = () => userApi.list().then(r => setUsers(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const toggleActive = async (u: User) => {
    try {
      if (u.is_active) {
        await userApi.deactivate(u.id);
        toast.success(`${u.full_name} deactivated`);
      } else {
        await userApi.update(u.id, { is_active: true });
        toast.success(`${u.full_name} activated`);
      }
      load();
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    }
  };

  return (
    <div className="page-content animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ marginBottom: '0.25rem' }}>User Management</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{users.length} registered users</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {users.map(u => (
            <div key={u.id} className="glass-card" style={{ padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', opacity: u.is_active ? 1 : 0.6 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${u.role === 'admin' ? '#8B5CF6' : '#3B82F6'}, ${u.role === 'admin' ? '#EC4899' : '#14B8A6'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {u.full_name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {u.full_name}
                  {u.id === me?.id && <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>You</span>}
                  <span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}`} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem' }}>
                    {u.role === 'admin' ? <Shield size={9} /> : <Stethoscope size={9} />}
                    {u.role}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span>{u.email}</span>
                  {u.department && <span>{u.department}</span>}
                  <span>Joined {format(new Date(u.created_at), 'd MMM yyyy')}</span>
                </div>
              </div>
              {u.id !== me?.id && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => toggleActive(u)}
                  style={{ color: u.is_active ? 'var(--accent-red)' : 'var(--accent-emerald)', flexShrink: 0 }}
                >
                  {u.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {u.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
