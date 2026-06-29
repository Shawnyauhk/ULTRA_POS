import PermissionSettingsPage from './PermissionSettingsPage';

export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">系統設置 Settings</h1>
      <PermissionSettingsPage embedded />
    </div>
  );
}
