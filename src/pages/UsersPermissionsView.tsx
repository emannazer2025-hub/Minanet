import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, History, Save, Pencil, X } from 'lucide-react';
import { apiFetch } from '../api.ts';
import type { PermissionRow } from '../types.ts';

interface RoleWithPerms {
  id: number;
  name: string;
  description: string;
  permissions: PermissionRow[];
}

interface UsersPermissionsViewProps {
  modules: Array<{ key: string; label: string }>;
  initialTab?: 'permissions' | 'users' | 'audit';
  onRefreshBootstrap?: () => void;
}

export const UsersPermissionsView: React.FC<UsersPermissionsViewProps> = ({
  modules,
  initialTab = 'permissions',
  onRefreshBootstrap,
}) => {
  const [tab, setTab] = useState<'permissions' | 'users' | 'audit'>(initialTab);
  const [roles, setRoles] = useState<RoleWithPerms[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number>(1);
  const [permDraft, setPermDraft] = useState<PermissionRow[]>([]);
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    full_name: '',
    password: '',
    role_id: '3',
    is_active: true,
    allow_negative_stock: false,
    allow_price_change: true,
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const buildDraft = (role: RoleWithPerms) => {
    const rows: PermissionRow[] = modules.map((m) => {
      const existing = role.permissions.find((p) => p.module_key === m.key);
      return (
        existing || {
          role_id: role.id,
          module_key: m.key,
          can_view: 0,
          can_add: 0,
          can_edit: 0,
          can_delete: 0,
          can_approve: 0,
          can_print: 0,
          can_export: 0,
          can_view_cost: 0,
        }
      );
    });
    setPermDraft(rows);
  };

  const loadAll = async () => {
    try {
      const [r, u, a] = await Promise.all([
        apiFetch<RoleWithPerms[]>('/api/roles'),
        apiFetch<Array<Record<string, unknown>>>('/api/users'),
        apiFetch<Array<Record<string, unknown>>>('/api/audit-logs'),
      ]);
      setRoles(r);
      setUsers(u);
      setAuditLogs(a);
      const activeRole = r.find((x) => x.id === selectedRoleId) || r[0];
      if (activeRole) {
        setSelectedRoleId(activeRole.id);
        buildDraft(activeRole);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const selectRole = (role: RoleWithPerms) => {
    setSelectedRoleId(role.id);
    buildDraft(role);
    setMsg('');
  };

  const toggleAll = (val: 0 | 1) => {
    setPermDraft((prev) =>
      prev.map((p) => ({
        ...p,
        can_view: val,
        can_add: val,
        can_edit: val,
        can_delete: val,
        can_approve: val,
        can_print: val,
        can_export: val,
        can_view_cost: val,
      }))
    );
  };

  const savePermissions = async () => {
    setMsg('');
    setError('');
    try {
      await apiFetch(`/api/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: permDraft }),
      });
      setMsg('تم حفظ صلاحيات الدور الوظيفي بنجاح');
      loadAll();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm({
      username: '',
      full_name: '',
      password: '',
      role_id: '3',
      is_active: true,
      allow_negative_stock: false,
      allow_price_change: true,
    });
  };

  const startEditUser = (u: Record<string, unknown>) => {
    setError('');
    setMsg('');
    setEditingUserId(Number(u.id));
    setUserForm({
      username: String(u.username || ''),
      full_name: String(u.full_name || ''),
      password: '',
      role_id: String(u.role_id || 3),
      is_active: Number(u.is_active ?? 1) === 1,
      allow_negative_stock: Number(u.allow_negative_stock) === 1,
      allow_price_change: Number(u.allow_price_change) === 1,
    });
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      if (editingUserId !== null) {
        await apiFetch(`/api/users/${editingUserId}`, {
          method: 'PUT',
          body: JSON.stringify({
            username: userForm.username,
            full_name: userForm.full_name,
            password: userForm.password,
            role_id: Number(userForm.role_id),
            is_active: userForm.is_active ? 1 : 0,
            allow_negative_stock: userForm.allow_negative_stock,
            allow_price_change: userForm.allow_price_change,
          }),
        });
        setMsg(`تم تحديث بيانات المستخدم (${userForm.username}) بنجاح`);
      } else {
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({ ...userForm, role_id: Number(userForm.role_id) }),
        });
        setMsg('تم إنشاء حساب المستخدم بنجاح');
      }
      resetUserForm();
      await loadAll();
      if (onRefreshBootstrap) onRefreshBootstrap();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const permCols: Array<{ key: keyof PermissionRow; label: string }> = [
    { key: 'can_view', label: 'فتح' },
    { key: 'can_add', label: 'إضافة' },
    { key: 'can_edit', label: 'تعديل' },
    { key: 'can_delete', label: 'حذف' },
    { key: 'can_approve', label: 'اعتماد' },
    { key: 'can_print', label: 'طباعة' },
    { key: 'can_export', label: 'تصدير' },
    { key: 'can_view_cost', label: 'التكلفة' },
  ];

  return (
    <div className="bg-[#ece9d8] text-slate-900">
      {/* Classic Sub-Tabs Strip */}
      <div className="bg-[#d6d2c2] border-b border-[#aca899] px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setTab('permissions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${
            tab === 'permissions'
              ? 'bg-[#214283] text-white border-[#12264d]'
              : 'win-btn text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> صلاحيات المستخدمين
        </button>
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${
            tab === 'users'
              ? 'bg-[#214283] text-white border-[#12264d]'
              : 'win-btn text-slate-900'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" /> المستخدمين
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${
            tab === 'audit'
              ? 'bg-[#214283] text-white border-[#12264d]'
              : 'win-btn text-slate-900'
          }`}
        >
          <History className="w-3.5 h-3.5" /> سجل التدقيق والمراجعة
        </button>
      </div>

      {error && <div className="m-3 p-2 text-xs bg-red-100 text-red-800 border border-red-400 font-semibold">{error}</div>}
      {msg && <div className="m-3 p-2 text-xs bg-emerald-100 text-emerald-900 border border-emerald-500 font-semibold">{msg}</div>}

      {/* PERMISSIONS MATRIX (Matching screenshot 90 textured sandstone & red titles) */}
      {tab === 'permissions' && (
        <div className="mina-panel-surface p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
            {/* Right List Box: الأدوار / المستخدمين */}
            <div className="space-y-2">
              <h3 className="text-center font-display font-black text-lg text-[#991b1b]">
                المستخدمين / الأدوار
              </h3>
              <div className="bg-[#eef2db] border-2 border-[#8c8c8c] min-h-[300px] p-1.5 space-y-1">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectRole(r)}
                    className={`w-full text-right px-2.5 py-2 text-xs border transition-colors ${
                      selectedRoleId === r.id
                        ? 'bg-[#214283] text-white border-[#12264d] font-bold'
                        : 'bg-white/70 hover:bg-white border-transparent text-slate-900 font-semibold'
                    }`}
                  >
                    <div>{r.name}</div>
                    <div className={`text-[11px] mt-0.5 ${selectedRoleId === r.id ? 'text-blue-100' : 'text-slate-600'}`}>
                      {r.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Center Matrix: الصلاحيات */}
            <div className="lg:col-span-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-black text-lg text-[#991b1b]">
                  الصلاحيــــــات والتطبيقات
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button type="button" onClick={() => toggleAll(1)} className="win-btn px-3 py-1 font-bold">
                    تحديد الكل
                  </button>
                  <button type="button" onClick={() => toggleAll(0)} className="win-btn px-3 py-1 font-bold">
                    إلغاء تحديد الكل
                  </button>
                  <button type="button" onClick={savePermissions} className="win-btn px-4 py-1 font-bold text-blue-950 flex items-center gap-1">
                    <Save className="w-3.5 h-3.5 text-emerald-800" /> حفظ الصلاحيات
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border-2 border-[#8c8c8c] bg-[#f7f2e7]">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#e3d7bf] border-b-2 border-[#8c8c8c] text-slate-900">
                      <th className="py-2 px-3 text-right border-l border-[#bfa98a] font-bold">التطبيق</th>
                      {permCols.map((c) => (
                        <th key={c.key} className="py-2 px-2 text-center border-l border-[#bfa98a] font-bold whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permDraft.map((row, idx) => {
                      const mod = modules.find((m) => m.key === row.module_key);
                      return (
                        <tr key={row.module_key} className={idx % 2 === 0 ? 'bg-[#fbf7ee] border-b border-[#d9ccb4]' : 'bg-[#f3ead8] border-b border-[#d9ccb4]'}>
                          <td className="py-1.5 px-3 font-bold border-l border-[#d9ccb4] text-slate-900">
                            {mod?.label || row.module_key}
                          </td>
                          {permCols.map((col) => (
                            <td key={col.key} className="py-1.5 px-2 text-center border-l border-[#d9ccb4]">
                              <input
                                type="checkbox"
                                checked={Number(row[col.key]) === 1}
                                onChange={(e) => {
                                  const val = e.target.checked ? 1 : 0;
                                  setPermDraft((prev) =>
                                    prev.map((p, i) => (i === idx ? { ...p, [col.key]: val } : p))
                                  );
                                }}
                                className="w-4 h-4 accent-[#214283] cursor-pointer"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* USERS MANAGEMENT */}
      {tab === 'users' && (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
          <form onSubmit={saveUser} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-2.5">
            <div className="flex items-center justify-between border-b border-[#aca899] pb-1.5">
              <h3 className="font-bold text-sm">
                {editingUserId !== null ? `تعديل بيانات: ${userForm.username}` : 'إضافة مستخدم جديد'}
              </h3>
              {editingUserId !== null && (
                <button
                  type="button"
                  onClick={resetUserForm}
                  className="text-[11px] font-bold text-red-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> إلغاء
                </button>
              )}
            </div>
            <div>
              <label className="block font-bold mb-0.5">اسم الدخول *</label>
              <input
                required
                placeholder="اسم الدخول *"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num"
              />
            </div>
            <div>
              <label className="block font-bold mb-0.5">الاسم الكامل *</label>
              <input
                required
                placeholder="الاسم الكامل *"
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
              />
            </div>
            <div>
              <label className="block font-bold mb-0.5">
                {editingUserId !== null ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور *'}
              </label>
              <input
                required={editingUserId === null}
                type="password"
                placeholder={editingUserId !== null ? 'اتركها فارغة لعدم التغيير' : 'كلمة المرور *'}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num"
              />
            </div>
            <div>
              <label className="block font-bold mb-0.5">الدور الوظيفي</label>
              <select
                value={userForm.role_id}
                onChange={(e) => setUserForm({ ...userForm, role_id: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            {editingUserId !== null && (
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={userForm.is_active}
                  onChange={(e) => setUserForm({ ...userForm, is_active: e.target.checked })}
                />
                الحساب نشط (مسموح بالدخول)
              </label>
            )}
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={userForm.allow_price_change}
                onChange={(e) => setUserForm({ ...userForm, allow_price_change: e.target.checked })}
              />
              السماح بتعديل السعر أثناء البيع
            </label>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                checked={userForm.allow_negative_stock}
                onChange={(e) => setUserForm({ ...userForm, allow_negative_stock: e.target.checked })}
              />
              صلاحية البيع بالسالب (عند تفعيلها بالإعدادات)
            </label>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="win-btn flex-1 py-2 font-bold text-blue-950">
                {editingUserId !== null ? 'حفظ التعديلات' : 'إنشاء المستخدم'}
              </button>
              {editingUserId !== null && (
                <button type="button" onClick={resetUserForm} className="win-btn px-3 py-2 font-bold">
                  إلغاء
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-2 bg-white border border-[#8c8c8c] overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 text-right border-l border-[#375da3]">اسم الدخول</th>
                  <th className="py-2 px-3 text-right border-l border-[#375da3]">الاسم الكامل</th>
                  <th className="py-2 px-3 text-right border-l border-[#375da3]">الدور</th>
                  <th className="py-2 px-3 text-center border-l border-[#375da3]">الحالة</th>
                  <th className="py-2 px-3 text-center border-l border-[#375da3]">تغيير السعر</th>
                  <th className="py-2 px-3 text-center border-l border-[#375da3]">البيع بالسالب</th>
                  <th className="py-2 px-3 text-center">تعديل</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const isEditingThis = editingUserId === Number(u.id);
                  const active = Number(u.is_active ?? 1) === 1;
                  return (
                    <tr
                      key={String(u.id)}
                      className={
                        isEditingThis
                          ? 'bg-amber-50 border-b border-amber-300'
                          : idx % 2 === 0
                          ? 'bg-white border-b border-slate-200'
                          : 'bg-slate-50 border-b border-slate-200'
                      }
                    >
                      <td className="py-2 px-3 font-bold font-mono-num">{String(u.username)}</td>
                      <td className="py-2 px-3">{String(u.full_name)}</td>
                      <td className="py-2 px-3 font-semibold">{String(u.role_name)}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 font-bold ${active ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-800'}`}>
                          {active ? 'نشط' : 'موقوف'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">{Number(u.allow_price_change) ? 'نعم' : 'لا'}</td>
                      <td className="py-2 px-3 text-center">{Number(u.allow_negative_stock) ? 'نعم' : 'لا'}</td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => startEditUser(u)}
                          className="win-btn px-2.5 py-1 font-bold text-blue-950 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" /> تعديل
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AUDIT LOGS */}
      {tab === 'audit' && (
        <div className="p-4">
          <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 text-right border-l border-[#375da3]">التاريخ والوقت</th>
                  <th className="py-2 px-3 text-right border-l border-[#375da3]">المستخدم</th>
                  <th className="py-2 px-3 text-right border-l border-[#375da3]">العملية</th>
                  <th className="py-2 px-3 text-right border-l border-[#375da3]">الكيان</th>
                  <th className="py-2 px-3 text-right border-l border-[#375da3]">المستند</th>
                  <th className="py-2 px-3 text-right">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log, idx) => (
                  <tr key={String(log.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                    <td className="py-1.5 px-3 font-mono-num">{String(log.created_at)}</td>
                    <td className="py-1.5 px-3 font-bold">{String(log.username)}</td>
                    <td className="py-1.5 px-3 font-mono-num">{String(log.action)}</td>
                    <td className="py-1.5 px-3">{String(log.entity_type)}</td>
                    <td className="py-1.5 px-3 font-mono-num">{String(log.doc_number || '-')}</td>
                    <td className="py-1.5 px-3 text-slate-600">{String(log.notes || '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
