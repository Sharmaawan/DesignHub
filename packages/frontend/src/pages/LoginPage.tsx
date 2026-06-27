import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { FcGoogle } from 'react-icons/fc';
import { FaGithub, FaApple, FaFacebook } from 'react-icons/fa';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loginWithGoogle, loginWithSocial, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/');
    } catch {
      toast.error('Invalid credentials');
    }
  };

  const handleGoogleLogin = () => {
    loginWithGoogle();
    toast.success('Welcome!');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-canva-purple to-purple-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-canva-blue rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold">D</span>
            </div>
            <span className="text-2xl font-display font-bold">DesignHub</span>
          </div>
          <h1 className="text-5xl font-display font-bold leading-tight mb-6">
            Create stunning designs
            <span className="text-canva-blue"> effortlessly</span>
          </h1>
          <p className="text-xl text-white/80 leading-relaxed">
            Join millions of creators designing anything they can imagine with our powerful, easy-to-use platform.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-8">
            <div>
              <div className="text-3xl font-bold">10M+</div>
              <div className="text-white/60 text-sm mt-1">Active Users</div>
            </div>
            <div>
              <div className="text-3xl font-bold">500K+</div>
              <div className="text-white/60 text-sm mt-1">Templates</div>
            </div>
            <div>
              <div className="text-3xl font-bold">1B+</div>
              <div className="text-white/60 text-sm mt-1">Designs Made</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-canva-purple to-canva-blue rounded-xl flex items-center justify-center">
              <span className="text-xl font-bold text-white">D</span>
            </div>
            <span className="text-xl font-display font-bold text-gray-900 dark:text-white">DesignHub</span>
          </div>

          <h2 className="text-3xl font-display font-bold text-gray-900 dark:text-white mb-2">
            Welcome back
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            Sign in to continue creating amazing designs
          </p>

          {/* Social Logins */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={handleGoogleLogin}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 font-medium text-sm"
            >
              <FcGoogle className="text-lg" />
              Google
            </button>
            <button
              onClick={() => { loginWithSocial('github'); navigate('/'); }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 font-medium text-sm"
            >
              <FaGithub className="text-lg" />
              GitHub
            </button>
            <button
              onClick={() => { loginWithSocial('apple'); navigate('/'); }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 font-medium text-sm"
            >
              <FaApple className="text-lg" />
              Apple
            </button>
            <button
              onClick={() => { loginWithSocial('facebook'); navigate('/'); }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-750 transition-all duration-200 font-medium text-sm"
            >
              <FaFacebook className="text-lg text-blue-600" />
              Facebook
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-gray-900 text-gray-400">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-11"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <HiEyeOff size={20} /> : <HiEye size={20} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-canva-purple focus:ring-canva-purple" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Remember me</span>
              </label>
              <a href="#" className="text-sm text-canva-purple hover:text-canva-purple-dark font-medium">
                Forgot password?
              </a>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-canva-purple hover:text-canva-purple-dark font-semibold">
              Sign up for free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
