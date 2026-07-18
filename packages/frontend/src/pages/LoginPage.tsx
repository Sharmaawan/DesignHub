import { Link } from 'react-router-dom';
import GoogleSignIn from '../components/auth/GoogleSignIn';

export default function LoginPage() {
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
            Collaborate, create, and share professional designs from anywhere.
          </p>
          <div className="mt-12 space-y-4">
            {['Drag-and-drop editor', 'Professional templates', 'Real-time collaboration'].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </div>
                <span className="text-white/90">{feature}</span>
              </div>
            ))}
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

          {/* Google Sign-In */}
          <div className="mb-6">
            <GoogleSignIn text="continue_with" theme="outline" size="large" />
          </div>

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
