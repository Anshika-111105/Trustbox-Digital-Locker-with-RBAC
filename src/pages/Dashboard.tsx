import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, User, Shield, FolderLock, LogOut } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 space-y-8">
        <div className="flex flex-col items-center space-y-2">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <h1 className="text-2xl font-bold text-gray-900">Welcome!</h1>
          <p className="text-gray-500 text-sm">{user?.email}</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <User className="h-6 w-6 text-blue-600" />
            <span className="text-gray-700">Role:</span>
            <span className="capitalize font-semibold text-gray-900">{user?.role}</span>
          </div>
          <div className="flex items-center space-x-3">
            <Shield className={`h-6 w-6 ${user?.twoFactorEnabled ? 'text-green-600' : 'text-yellow-600'}`} />
            <span className="text-gray-700">Two-Factor Auth:</span>
            <span className={`font-semibold ${user?.twoFactorEnabled ? 'text-green-700' : 'text-yellow-700'}`}>
              {user?.twoFactorEnabled ? 'Enabled' : 'Not Enabled'}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {/* Go to Document Vault */}
          <button
            onClick={() => navigate('/vault')}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
          >
            <FolderLock className="h-5 w-5" />
            Open Document Vault
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-md transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;