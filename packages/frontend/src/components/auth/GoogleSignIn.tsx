import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

// Google Identity Services types
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

interface GoogleSignInProps {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  width?: number;
  className?: string;
}

export default function GoogleSignIn({
  text = 'continue_with',
  theme = 'outline',
  size = 'large',
  width = 300,
  className = '',
}: GoogleSignInProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { loginWithGoogleCredential } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Load Google Identity Services script
    if (!document.getElementById('google-identity-services')) {
      const script = document.createElement('script');
      script.id = 'google-identity-services';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const initializeGoogleSignIn = () => {
      if (!window.google?.accounts?.id || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme,
        size,
        text,
        width,
        shape: 'rectangular',
      });
    };

    // Wait for the script to load
    const checkGoogle = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(checkGoogle);
        initializeGoogleSignIn();
      }
    }, 100);

    return () => clearInterval(checkGoogle);
  }, [theme, size, text, width]);

  const handleCredentialResponse = async (response: { credential: string }) => {
    if (!response.credential) {
      toast.error('Google sign-in failed. No credential received.');
      return;
    }

    setIsLoading(true);
    try {
      await loginWithGoogleCredential(response.credential);
      toast.success('Welcome!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <div className="animate-spin w-4 h-4 border-2 border-[#7B2FBE] border-t-transparent rounded-full" />
          Signing in with Google...
        </div>
      )}
      <div ref={buttonRef} />
      {GOOGLE_CLIENT_ID && (
        <p className="text-[10px] text-gray-400 mt-2">
          Secured by Google Identity Services
        </p>
      )}
      {!GOOGLE_CLIENT_ID && (
        <p className="text-[10px] text-amber-500 mt-2">
          Google Client ID not configured. Add VITE_GOOGLE_CLIENT_ID to .env
        </p>
      )}
    </div>
  );
}
