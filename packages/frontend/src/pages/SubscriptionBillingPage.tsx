import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { HiOutlineArrowLeft, HiOutlineCheck, HiOutlineStar, HiOutlineClock } from 'react-icons/hi';
import toast from 'react-hot-toast';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For individuals getting started',
    features: [
      '5 projects',
      '1 GB storage',
      'Basic templates',
      'Standard exports (PNG, JPG)',
      'Email support',
    ],
    current: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$12.99',
    period: '/month',
    description: 'For professionals and freelancers',
    features: [
      'Unlimited projects',
      '100 GB storage',
      'Premium templates',
      'All export formats (PNG, JPG, PDF, SVG)',
      'Background remover',
      'Brand kit (1 brand)',
      'Priority support',
      'Custom fonts',
    ],
    current: false,
    popular: true,
  },
  {
    id: 'teams',
    name: 'Teams',
    price: '$29.99',
    period: '/month',
    description: 'For teams and organizations',
    features: [
      'Everything in Pro',
      'Unlimited storage',
      'Team collaboration',
      'Brand kit (unlimited brands)',
      'Admin controls',
      'Audit log',
      'Dedicated support',
      'SSO authentication',
    ],
    current: false,
  },
];

export default function SubscriptionBillingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const handleUpgrade = (planId: string) => {
    if (planId === 'free') return;
    toast('Upgrade flow coming soon!', { icon: '🚀' });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f0f23]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <HiOutlineArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Subscription & Billing</h1>
            <p className="text-sm text-gray-500">Choose the plan that works for you</p>
          </div>
        </div>

        {/* Current Plan */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-1">Current Plan</p>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white capitalize">{user?.subscriptionPlan || 'Free'}</h3>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-medium text-green-700 dark:text-green-400">Active</span>
            </div>
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white dark:bg-[#1e1e30] rounded-2xl border p-6 relative transition-all hover:shadow-lg ${
                plan.popular
                  ? 'border-[#7B2FBE] dark:border-[#7B2FBE]'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#7B2FBE] text-white text-[10px] font-bold rounded-full uppercase flex items-center gap-1">
                  <HiOutlineStar size={10} /> Most Popular
                </div>
              )}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                <p className="text-xs text-gray-400 mt-1">{plan.description}</p>
              </div>
              <div className="mb-6">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{plan.price}</span>
                <span className="text-sm text-gray-400">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <HiOutlineCheck size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={plan.current}
                className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  plan.current
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    : plan.popular
                    ? 'bg-[#7B2FBE] text-white hover:bg-[#6A25A8]'
                    : 'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-800 dark:hover:bg-gray-600'
                }`}
              >
                {plan.current ? 'Current Plan' : 'Upgrade'}
              </button>
            </div>
          ))}
        </div>

        {/* Billing Info */}
        <div className="mt-8 bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Billing Information</h3>
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <HiOutlineClock size={20} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">No active subscription</p>
              <p className="text-xs text-gray-400">Upgrade to a paid plan to unlock premium features</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
