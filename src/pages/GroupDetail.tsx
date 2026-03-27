import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Group, Trip, User } from '../types';
import { Plus, ArrowLeft, Map, UserPlus, Users, Edit2, Check, X, Trash2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '../components/ConfirmModal';

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [group, setGroup] = useState<Group | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMode, setAddMode] = useState<'guest' | 'registered'>('guest');
  const [newGuestName, setNewGuestName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [addMemberError, setAddMemberError] = useState('');
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteTripModalOpen, setIsDeleteTripModalOpen] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !user) return;

    // Fetch Group
    const unsubscribeGroup = onSnapshot(doc(db, 'groups', groupId), (docSnap) => {
      if (docSnap.exists()) {
        const groupData = { id: docSnap.id, ...docSnap.data() } as Group;
        setGroup(groupData);
        
        // Fetch Members
        if (groupData.members && groupData.members.length > 0) {
          const registeredUids = groupData.members.filter(uid => !uid.startsWith('guest-'));
          const guests = groupData.members.filter(uid => uid.startsWith('guest-')).map(uid => ({
            uid,
            displayName: groupData.guestNames?.[uid] || 'Unknown Guest',
            isGuest: true,
            email: ''
          } as User));

          if (registeredUids.length > 0) {
            const chunks = [];
            for (let i = 0; i < registeredUids.length; i += 10) {
              chunks.push(registeredUids.slice(i, i + 10));
            }
            
            Promise.all(chunks.map(chunk => 
              getDocs(query(collection(db, 'users'), where('uid', 'in', chunk)))
            )).then(snapshots => {
              const registeredUsers = snapshots.flatMap(snap => snap.docs.map(d => d.data() as User));
              setMembers([...registeredUsers, ...guests]);
            }).catch(err => {
              console.error("Error fetching members", err);
            });
          } else {
            setMembers(guests);
          }
        }
      } else {
        navigate('/');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `groups/${groupId}`);
    });

    // Fetch Trips
    const qTrips = query(collection(db, 'trips'), where('groupId', '==', groupId));
    const unsubscribeTrips = onSnapshot(qTrips, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Trip[];
      
      tripsData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      
      setTrips(tripsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    return () => {
      unsubscribeGroup();
      unsubscribeTrips();
    };
  }, [groupId, user, navigate]);

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripName.trim() || !user || !groupId) return;

    try {
      await addDoc(collection(db, 'trips'), {
        groupId,
        name: newTripName.trim(),
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      setNewTripName('');
      setIsCreatingTrip(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'trips');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddMemberError('');
    if (!groupId) return;

    try {
      if (addMode === 'guest') {
        if (!newGuestName.trim()) return;
        const guestId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await updateDoc(doc(db, 'groups', groupId), {
          members: arrayUnion(guestId),
          [`guestNames.${guestId}`]: newGuestName.trim()
        });
        setNewGuestName('');
        setIsAddingMember(false);
      } else {
        if (!newMemberEmail.trim()) return;
        // Find user by email
        const userQuery = query(collection(db, 'users'), where('email', '==', newMemberEmail.trim().toLowerCase()));
        const userSnap = await getDocs(userQuery);
        
        if (userSnap.empty) {
          setAddMemberError(t('group.userNotFound'));
          return;
        }

        const newMemberUid = userSnap.docs[0].data().uid;
        
        if (group?.members.includes(newMemberUid)) {
          setAddMemberError(t('group.userAlreadyInGroup'));
          return;
        }

        await updateDoc(doc(db, 'groups', groupId), {
          members: arrayUnion(newMemberUid)
        });
        
        setNewMemberEmail('');
        setIsAddingMember(false);
      }
    } catch (error) {
      console.error(error);
      setAddMemberError(t('group.addMemberFailed'));
    }
  };

  const handleUpdateGroupName = async () => {
    if (!editGroupName.trim() || !groupId || editGroupName.trim() === group?.name) {
      setIsEditingName(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'groups', groupId), {
        name: editGroupName.trim()
      });
      setIsEditingName(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
    }
  };

  const handleDeleteGroup = () => {
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteGroup = async () => {
    if (!groupId) return;
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      navigate('/');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}`);
    } finally {
      setIsDeleteModalOpen(false);
    }
  };

  const handleDeleteTrip = (tripId: string) => {
    setTripToDelete(tripId);
    setIsDeleteTripModalOpen(true);
  };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) return;
    try {
      await deleteDoc(doc(db, 'trips', tripToDelete));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `trips/${tripToDelete}`);
    } finally {
      setIsDeleteTripModalOpen(false);
      setTripToDelete(null);
    }
  };

  if (!group) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-8">
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title={t('group.deleteGroup')}
        message={t('group.confirmDelete')}
        confirmText={t('common.delete', { defaultValue: 'Delete' })}
        cancelText={t('common.cancel')}
        onConfirm={confirmDeleteGroup}
        onCancel={() => setIsDeleteModalOpen(false)}
        isDestructive={true}
      />
      <div className="flex items-center gap-4">
        <Link to="/" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        {isEditingName ? (
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="text"
              value={editGroupName}
              onChange={(e) => setEditGroupName(e.target.value)}
              className="flex-1 px-3 py-1.5 text-2xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdateGroupName();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
            />
            <button
              onClick={handleUpdateGroupName}
              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title={t('common.save')}
            >
              <Check className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsEditingName(false)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title={t('common.cancel')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{group.name}</h1>
            <button
              onClick={() => {
                setEditGroupName(group.name);
                setIsEditingName(true);
              }}
              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title={t('group.editGroup')}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleDeleteGroup}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={t('group.deleteGroup')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Map className="w-5 h-5 text-indigo-500" />
              {t('group.trips')}
            </h2>
            <button
              onClick={() => setIsCreatingTrip(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-sm font-medium rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('group.newTrip')}
            </button>
          </div>

          {isCreatingTrip && (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <form onSubmit={handleCreateTrip} className="flex gap-3 items-end">
                <div className="flex-1">
                  <label htmlFor="tripName" className="block text-sm font-medium text-gray-700 mb-1">{t('group.tripName')}</label>
                  <input
                    type="text"
                    id="tripName"
                    value={newTripName}
                    onChange={(e) => setNewTripName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder={t('group.tripNamePlaceholder')}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newTripName.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {t('common.create')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingTrip(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </form>
            </div>
          )}

          {trips.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <Map className="w-6 h-6" />
              </div>
              <h3 className="text-base font-medium text-gray-900 mb-1">{t('group.noTrips')}</h3>
              <p className="text-sm text-gray-500">{t('group.noTripsDesc')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map(trip => (
                <div key={trip.id} className="relative group/trip">
                  <Link
                    to={`/trips/${trip.id}`}
                    className="block bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">{trip.name}</h3>
                      <span className="text-indigo-600 font-medium text-sm">{t('group.viewDetails')} &rarr;</span>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteTrip(trip.id);
                    }}
                    className="absolute top-1/2 -translate-y-1/2 right-32 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover/trip:opacity-100"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              {t('group.members')}
            </h2>
            <button
              onClick={() => setIsAddingMember(true)}
              className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
              title={t('group.addMember')}
            >
              <UserPlus className="w-5 h-5" />
            </button>
          </div>

          {isAddingMember && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <div className="flex gap-4 mb-4 border-b border-gray-100 pb-2">
                <button 
                  type="button" 
                  onClick={() => { setAddMode('guest'); setAddMemberError(''); }} 
                  className={`text-sm font-medium pb-2 -mb-2.5 ${addMode === 'guest' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t('group.addGuest')}
                </button>
                <button 
                  type="button" 
                  onClick={() => { setAddMode('registered'); setAddMemberError(''); }} 
                  className={`text-sm font-medium pb-2 -mb-2.5 ${addMode === 'registered' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t('group.addEmail')}
                </button>
              </div>
              <form onSubmit={handleAddMember} className="space-y-3 mt-4">
                {addMode === 'guest' ? (
                  <div>
                    <label htmlFor="guestName" className="block text-sm font-medium text-gray-700 mb-1">{t('group.guestName')}</label>
                    <input
                      type="text"
                      id="guestName"
                      value={newGuestName}
                      onChange={(e) => setNewGuestName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                      placeholder={t('group.guestNamePlaceholder')}
                      autoFocus
                    />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="memberEmail" className="block text-sm font-medium text-gray-700 mb-1">{t('group.memberEmail')}</label>
                    <input
                      type="email"
                      id="memberEmail"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                      placeholder={t('group.memberEmailPlaceholder')}
                      autoFocus
                    />
                    {addMemberError && <p className="text-red-500 text-xs mt-1">{addMemberError}</p>}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={addMode === 'guest' ? !newGuestName.trim() : !newMemberEmail.trim()}
                    className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {t('common.add')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingMember(false); setAddMemberError(''); }}
                    className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {members.map(member => (
                <li key={member.uid} className="p-4 flex items-center gap-3">
                  {member.photoURL ? (
                    <img src={member.photoURL} alt={member.displayName} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium text-sm">
                      {member.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{member.displayName}</p>
                      {member.isGuest && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded-full uppercase tracking-wider">{t('common.guest')}</span>
                      )}
                    </div>
                    {!member.isGuest && <p className="text-xs text-gray-500">{member.email}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={isDeleteTripModalOpen}
        title={t('trip.deleteTrip')}
        message={t('trip.confirmDelete')}
        confirmText={t('common.delete', { defaultValue: 'Delete' })}
        cancelText={t('common.cancel')}
        onConfirm={confirmDeleteTrip}
        onCancel={() => setIsDeleteTripModalOpen(false)}
        isDestructive={true}
      />
    </div>
  );
}
