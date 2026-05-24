import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../lib/apiClient';
import { Lock, Mail, AlertTriangle, ShieldCheck, Eye, EyeOff } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Kindly structure a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long')
});

type LoginFields = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [apiError, setApiError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFields>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginFields) => {
    setApiError(null);
    try {
      const response = await apiClient.post('/api/auth/login', {
        email: data.email,
        password: data.password
      });

      if (response.data && response.data.success) {
        const { user, token } = response.data.data;
        if (!user.is_active) {
          setApiError('Your account has been deactivated. Please contact an administrator.');
          return;
        }
        
        // Save to Zustand
        setAuth(user, token);
        
        // Navigate to primary route dashboard
        navigate('/');
      } else {
        setApiError(response.data?.error?.message || 'Login rejected by gateway.');
      }
    } catch (err: any) {
      const serverMessage = err.response?.data?.error?.message;
      setApiError(serverMessage || 'Could not contact authentication servers. Try again later.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-12 relative overflow-hidden" id="clearpath-login-page">
      {/* Background radial overlays for refined visuals */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#1e293b,transparent)] opacity-80" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-700/10 rounded-full filter blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/5 rounded-full filter blur-3xl" />

      <div className="relative w-full max-w-md bg-white/95 backdrop-blur-md px-6 py-8 md:px-8 border border-slate-100 rounded-2xl shadow-2xl">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary-700 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-primary-700/15">
            CP
          </div>
          <h2 className="mt-4 text-2xl font-bold text-slate-900 tracking-tight">
            ClearPath Logistics Portal
          </h2>
          <p className="mt-1.5 text-xs text-slate-500 font-medium">
            Nigeria Custom Clearance & Last-mile Freight Orchestrator
          </p>
        </div>

        {/* Global Error Banner Display */}
        {apiError && (
          <div className="mb-5 p-3.5 bg-danger-100 text-danger-500 rounded-xl border border-danger-500/10 flex items-start gap-2.5 text-xs font-semibold leading-relaxed animate-fade-in">
            <AlertTriangle className="shrink-0 mt-0.5" size={16} />
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email input field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="login-email">
              Institutional Email
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                <Mail size={16} />
              </span>
              <input
                {...register('email')}
                type="email"
                id="login-email"
                placeholder="broker@clearpath.com"
                className={`w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border ${
                  errors.email ? 'border-danger-500 focus:ring-danger-500' : 'border-slate-200 focus:ring-primary-500'
                } rounded-xl focus:border-transparent focus:ring-2 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400/80 text-slate-900`}
              />
            </div>
            {errors.email && (
              <span className="text-[10px] font-bold text-danger-500 mt-1 block">
                {errors.email.message}
              </span>
            )}
          </div>

          {/* Password input field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="login-password">
              Security Creed Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                <Lock size={16} />
              </span>
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                id="login-password"
                placeholder="••••••••••••"
                className={`w-full pl-10 pr-10 py-2 text-sm bg-slate-50 border ${
                  errors.password ? 'border-danger-500 focus:ring-danger-500' : 'border-slate-200 focus:ring-primary-500'
                } rounded-xl focus:border-transparent focus:ring-2 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400/80 text-slate-900`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <span className="text-[10px] font-bold text-danger-500 mt-1 block">
                {errors.password.message}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer">
              <input type="checkbox" className="rounded text-primary-500 border-slate-300" />
              <span>Remember credential token</span>
            </label>
            <span className="text-primary-700 hover:underline cursor-pointer font-bold">Forgot password?</span>
          </div>

          {/* Submit credentials button */}
          <button
            type="submit"
            disabled={isSubmitting}
            id="login-submit"
            className="w-full mt-3 py-2.5 px-4 bg-primary-700 hover:bg-primary-900 text-white font-bold text-sm rounded-xl transition-all cursor-pointer shadow-md shadow-primary-700/10 focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center justify-center gap-2 text-center"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck size={18} />
                <span>Sign In Securely</span>
              </>
            )}
          </button>
        </form>

        {/* Informative instructions sidebar footer */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-center text-[10px] text-slate-400 gap-1 tracking-wide uppercase font-bold text-center">
          <span>Encrypted Gateway</span>
          <span>•</span>
          <span>Compliance Guard Enabled</span>
        </div>
      </div>
    </div>
  );
}
