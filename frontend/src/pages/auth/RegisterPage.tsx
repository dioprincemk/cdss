// pages/auth/RegisterPage.tsx
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { extractErrorMessage } from '@/utils/helpers';

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain a number'),
  medical_license: z.string().optional(),
  department: z.string().optional(),
  role: z.enum(['doctor', 'admin']),
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: authRegister, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'doctor' },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await authRegister(data);
      toast.success('Account created! Please sign in.');
      navigate('/login');
    } catch (err: any) {
      toast.error(extractErrorMessage(err));
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg-primary)' }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: 460, padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', boxShadow: 'var(--glow-blue)' }}>
            <Activity size={26} color="white" />
          </div>
          <h2 style={{ fontSize: '1.4rem' }}>Create Account</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Join the CDSS platform</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input {...register('full_name')} className={`form-input ${errors.full_name ? 'error' : ''}`} placeholder="Dr. Jane Smith" />
            {errors.full_name && <span className="form-error">{errors.full_name.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input {...register('email')} type="email" className={`form-input ${errors.email ? 'error' : ''}`} placeholder="doctor@hospital.com" />
            {errors.email && <span className="form-error">{errors.email.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input {...register('password')} type="password" className={`form-input ${errors.password ? 'error' : ''}`} placeholder="Min 8 chars, 1 uppercase, 1 number" />
            {errors.password && <span className="form-error">{errors.password.message}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Medical License</label>
              <input {...register('medical_license')} className="form-input" placeholder="Optional" />
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <input {...register('department')} className="form-input" placeholder="Optional" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Role</label>
            <select {...register('role')} className="form-select">
              <option value="doctor">Doctor</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={isLoading} style={{ marginTop: '0.5rem' }}>
            {isLoading ? <span className="spinner" /> : null}
            {isLoading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
