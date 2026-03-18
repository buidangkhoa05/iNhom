import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Group } from '../types';
import { Plus, Users, ChevronRight } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { useTranslation } from 'react-i18next';

export function Dashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Group[];
      
      // Sort client-side to avoid needing a composite index initially
      groupsData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      
      setGroups(groupsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'groups');
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;

    try {
      await addDoc(collection(db, 'groups'), {
        name: newGroupName.trim(),
        createdBy: user.uid,
        members: [user.uid],
        createdAt: serverTimestamp()
      });
      setNewGroupName('');
      setIsCreating(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'groups');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('dashboard.title')}</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('dashboard.newGroup')}
        </button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <form onSubmit={handleCreateGroup} className="flex gap-4 items-end">
            <div className="flex-1">
              <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 mb-1">{t('dashboard.groupName')}</label>
              <input
                type="text"
                id="groupName"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder={t('dashboard.groupNamePlaceholder')}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!newGroupName.trim()}
              className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.create')}
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-6 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </form>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('dashboard.noGroups')}</h3>
          <p className="text-gray-500 max-w-sm mx-auto">{t('dashboard.noGroupsDesc')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(group => (
            <Link
              key={group.id}
              to={`/groups/${group.id}`}
              className="group bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all flex flex-col h-full"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-1">{group.name}</h3>
              <p className="text-sm text-gray-500 mt-auto">
                {t('dashboard.members_one', { count: group.members.length, defaultValue: '{{count}} members' })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
