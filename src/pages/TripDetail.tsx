import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Trip, Expense, User, Group } from '../types';
import { ArrowLeft, Plus, Receipt, Calculator, Users, ArrowRight, Edit2, Check, X, ChevronDown, ChevronUp, Download, Trash2 } from 'lucide-react';
import { calculateBalances, suggestSettlements, Transaction } from '../utils/settlement';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';

export function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const [trip, setTrip] = useState<Trip | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitAmong, setSplitAmong] = useState<string[]>([]);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editTripName, setEditTripName] = useState('');
  
  const [settlements, setSettlements] = useState<Transaction[]>([]);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const breakdownRef = useRef<HTMLDivElement>(null);

  const memberBreakdowns = useMemo(() => {
    const breakdowns: Record<string, { paid: number; owed: number }> = {};
    
    members.forEach(m => {
      breakdowns[m.uid] = { paid: 0, owed: 0 };
    });

    expenses.forEach(expense => {
      if (breakdowns[expense.paidBy]) {
        breakdowns[expense.paidBy].paid += expense.amount;
      }
      
      const splitAmount = expense.amount / expense.splitAmong.length;
      expense.splitAmong.forEach(uid => {
        if (breakdowns[uid]) {
          breakdowns[uid].owed += splitAmount;
        }
      });
    });

    return members.map(m => {
      const b = breakdowns[m.uid] || { paid: 0, owed: 0 };
      return {
        uid: m.uid,
        name: m.displayName,
        paid: b.paid,
        owed: b.owed,
        balance: b.paid - b.owed
      };
    });
  }, [expenses, members]);

  useEffect(() => {
    if (!tripId || !user) return;

    // Fetch Trip
    const unsubscribeTrip = onSnapshot(doc(db, 'trips', tripId), async (docSnap) => {
      if (docSnap.exists()) {
        const tripData = { id: docSnap.id, ...docSnap.data() } as Trip;
        setTrip(tripData);
        
        // Fetch Group
        const groupSnap = await getDoc(doc(db, 'groups', tripData.groupId));
        if (groupSnap.exists()) {
          const groupData = { id: groupSnap.id, ...groupSnap.data() } as Group;
          setGroup(groupData);
          
          // Fetch Members
          if (groupData.members && groupData.members.length > 0) {
            const registeredUids = groupData.members.filter(uid => !uid.startsWith('guest-'));
            const guests = groupData.members.filter(uid => uid.startsWith('guest-')).map(uid => ({
              uid,
              displayName: groupData.guestNames?.[uid] || t('common.unknown'),
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
              }).catch(err => console.error(err));
            } else {
              setMembers(guests);
            }
          }
        }
      } else {
        navigate('/');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `trips/${tripId}`);
    });

    // Fetch Expenses
    const qExpenses = query(collection(db, 'expenses'), where('tripId', '==', tripId));
    const unsubscribeExpenses = onSnapshot(qExpenses, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Expense[];
      
      expensesData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      
      setExpenses(expensesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    });

    return () => {
      unsubscribeTrip();
      unsubscribeExpenses();
    };
  }, [tripId, user, navigate]);

  useEffect(() => {
    if (group && expenses.length > 0) {
      const balances = calculateBalances(expenses, group.members);
      const suggested = suggestSettlements(balances);
      setSettlements(suggested);
    } else {
      setSettlements([]);
    }
  }, [expenses, group]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount || !paidBy || splitAmong.length === 0 || !tripId) return;

    try {
      await addDoc(collection(db, 'expenses'), {
        tripId,
        description: description.trim(),
        amount: parseFloat(amount),
        paidBy,
        splitAmong,
        createdAt: serverTimestamp()
      });
      
      setDescription('');
      setAmount('');
      setPaidBy('');
      setSplitAmong([]);
      setIsAddingExpense(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    }
  };

  const toggleSplitMember = (uid: string) => {
    setSplitAmong(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const selectAllMembers = () => {
    if (group) setSplitAmong(group.members);
  };

  const getUserName = (uid: string) => {
    return members.find(m => m.uid === uid)?.displayName || t('common.unknown');
  };

  const handleUpdateTripName = async () => {
    if (!editTripName.trim() || !tripId || editTripName.trim() === trip?.name) {
      setIsEditingName(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'trips', tripId), {
        name: editTripName.trim()
      });
      setIsEditingName(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `trips/${tripId}`);
    }
  };

  const handleDeleteTrip = async () => {
    if (!tripId || !window.confirm(t('trip.confirmDelete'))) return;
    try {
      await deleteDoc(doc(db, 'trips', tripId));
      navigate(`/groups/${trip?.groupId}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `trips/${tripId}`);
    }
  };

  const handleDownloadImage = async () => {
    if (!breakdownRef.current) return;
    
    try {
      setIsDownloading(true);
      
      // We temporarily ensure the breakdown is open for the screenshot if it isn't
      const wasClosed = !isBreakdownOpen;
      if (wasClosed) {
        setIsBreakdownOpen(true);
        // Wait a tiny bit for the DOM to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const dataUrl = await toPng(breakdownRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `breakdown-${trip?.name || 'trip'}.png`;
      link.click();
      
      if (wasClosed) {
        setIsBreakdownOpen(false);
      }
    } catch (error) {
      console.error('Error generating image:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const totalExpenseAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  if (!trip || !group) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to={`/groups/${group.id}`} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          {isEditingName ? (
            <div className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                value={editTripName}
                onChange={(e) => setEditTripName(e.target.value)}
                className="flex-1 px-3 py-1.5 text-2xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateTripName();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
              />
              <button
                onClick={handleUpdateTripName}
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
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">{trip.name}</h1>
              <button
                onClick={() => {
                  setEditTripName(trip.name);
                  setIsEditingName(true);
                }}
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title={t('trip.editTrip')}
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleDeleteTrip}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title={t('trip.deleteTrip')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-1">{t('trip.inGroup', { groupName: group.name })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-1 space-y-6">
          {/* Members Card */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-indigo-500" />
              {t('trip.groupMembers', { count: members.length })}
            </h2>
            <div className="flex flex-wrap gap-2">
              {members.map(m => (
                <div key={m.uid} className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-sm text-gray-700 flex items-center gap-2">
                  {m.displayName}
                  {m.isGuest && <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{t('common.guest')}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Add Expense Card */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Receipt className="w-5 h-5 text-emerald-500" />
              {t('trip.addNewExpense')}
            </h2>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('trip.expensePurpose')}</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder={t('trip.descriptionPlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('trip.expenseAmount', { currency: 'VNĐ' })}</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  placeholder={t('trip.amountPlaceholder')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('trip.whoPaid')}</label>
                <select
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-white"
                  required
                >
                  <option value="" disabled>-- {t('trip.selectPaidBy')} --</option>
                  {members.map(m => (
                    <option key={m.uid} value={m.uid}>{m.displayName}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">{t('trip.splitAmongWho')}</label>
                  <button type="button" onClick={selectAllMembers} className="text-xs text-emerald-600 font-medium hover:text-emerald-800">
                    {t('trip.selectAll')}
                  </button>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {members.map(m => (
                    <label key={m.uid} className="flex items-center gap-3 p-1 hover:bg-gray-100 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={splitAmong.includes(m.uid)}
                        onChange={() => toggleSplitMember(m.uid)}
                        className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-gray-700">{m.displayName}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!description.trim() || !amount || !paidBy || splitAmong.length === 0}
                className="w-full py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <span className="font-bold">$</span> {t('trip.recordExpense')}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Optimal Settlement Card */}
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-6">
            <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2 mb-4">
              <ArrowRight className="w-5 h-5 text-blue-600" />
              {t('trip.optimalTransactions')}
            </h2>
            
            {settlements.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-blue-700">{t('trip.noDebt')}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {settlements.map((tx, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-4 bg-white/60 p-3 rounded-lg border border-blue-100/50">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-1 text-right">
                        <span className="text-sm font-medium text-gray-900">{getUserName(tx.from)}</span>
                      </div>
                      <div className="flex flex-col items-center shrink-0 px-2">
                        <span className="text-[10px] text-gray-500 uppercase">{t('trip.owes')}</span>
                        <ArrowRight className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900">{getUserName(tx.to)}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className="text-base font-bold text-blue-700">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Expense History Card */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{t('trip.expenseHistory')}</h2>
              <div className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">
                {t('trip.total', { amount: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalExpenseAmount) })}
              </div>
            </div>
            
            {expenses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-500">{t('trip.noExpenseRecorded')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {expenses.map(expense => (
                  <li key={expense.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">{expense.description}</h4>
                      <p className="text-sm text-gray-500 mt-1">
                        {t('trip.paidByText')} <span className="font-medium text-gray-700">{getUserName(expense.paidBy)}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t('trip.splitAmongText', { count: expense.splitAmong.length })}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-gray-900">
                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(expense.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Detailed Breakdown Section */}
          <div ref={breakdownRef} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="w-full px-6 py-4 flex items-center justify-between bg-white border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{t('trip.detailedBreakdown')}</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadImage}
                  disabled={isDownloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  title={t('trip.downloadImage')}
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('trip.downloadImage')}</span>
                </button>
                <button
                  onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {isBreakdownOpen ? t('trip.collapse') : t('trip.expand')}
                  {isBreakdownOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            {isBreakdownOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('trip.member')}</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">{t('trip.paidAmount')}</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">{t('trip.owedAmount')}</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">{t('trip.balanceStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {memberBreakdowns.map((member) => (
                      <tr key={member.uid} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {member.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 font-medium text-right">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(member.paid)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-500 font-medium text-right">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(member.owed)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                          {member.balance > 0 ? (
                            <span className="text-emerald-600 font-bold">
                              {t('trip.receiveBack', { amount: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(member.balance) })}
                            </span>
                          ) : member.balance < 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-red-600 font-bold">
                                {t('trip.oweAmount', { amount: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.abs(member.balance)) })}
                              </span>
                              {settlements.filter(s => s.from === member.uid).map((s, idx) => (
                                <span key={idx} className="text-xs text-gray-500 mt-0.5">
                                  {t('trip.payTo', { name: getUserName(s.to), amount: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(s.amount) })}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">{t('trip.settled')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
