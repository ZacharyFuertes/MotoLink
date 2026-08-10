import React from 'react'
import { AlertTriangle, ArrowLeft, Home } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'

interface AccessDeniedProps {
  requestedPage: string
  onNavigate?: (page: string) => void
}

/**
 * AccessDenied Component
 * Displays when a user tries to access a page they don't have permission for.
 * Provides helpful navigation options based on user role.
 */
const AccessDenied: React.FC<AccessDeniedProps> = ({ requestedPage, onNavigate }) => {
  const { user } = useAuth()

  // Determine default page based on role
  const getDefaultPage = () => {
    if (user?.role === 'customer') return 'appointments'
    if (user?.role === 'owner') return 'dashboard'
    return 'landing'
  }

  const defaultPage = getDefaultPage()

  const handleNavigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page)
    }
  }

  const rolePermissions: Record<string, string[]> = {
    customer: ['My Appointments', 'Browse Parts', 'Customer Portal'],
    owner: ['All Features', 'Dashboard', 'Inventory Management', 'Appointments', 'Customers', 'Products'],
  }

  const allowedPages = rolePermissions[user?.role || 'customer'] || []

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4 py-12"
    >
      <div className="max-w-md w-full">
        <div className="text-center">
          {/* Icon */}
          <motion.div
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="flex justify-center mb-6"
          >
            <div className="bg-red-50 border border-red-200 rounded-full p-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="text-3xl font-bold text-slate-900 mb-2"
          >
            Access Denied
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="text-slate-500 mb-6"
          >
            You don't have permission to access <span className="text-slate-900 font-semibold">{requestedPage}</span>.
          </motion.p>

          {/* User Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="bg-white border border-slate-200 rounded-xl p-4 mb-6 text-left shadow-sm"
          >
            <div className="text-sm text-slate-500 mb-1">Your Role</div>
            <div className="text-slate-900 font-semibold capitalize mb-3">
              {user?.role || 'Unknown'}
            </div>
            <div className="text-sm text-slate-500 mb-1">You Can Access</div>
            <div className="text-slate-600 text-sm space-y-1">
              {allowedPages.map((page, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  <span>{page}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="space-y-3"
          >
            <button
              onClick={() => handleNavigate(defaultPage)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition"
            >
              <Home className="w-4 h-4" />
              Go to {defaultPage === 'appointments' ? 'Appointments' : 'Dashboard'}
            </button>
            <button
              onClick={() => handleNavigate('landing')}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl font-medium transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>
          </motion.div>

          {/* Footer Info */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            className="text-xs text-slate-400 mt-6"
          >
            If you believe this is an error, please contact your administrator.
          </motion.p>
        </div>
      </div>
    </motion.div>
  )
}

export default AccessDenied
