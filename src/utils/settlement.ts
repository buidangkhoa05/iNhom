import { Expense } from '../types';

export interface Balance {
  userId: string;
  amount: number; // positive means they are owed money, negative means they owe money
}

export interface Transaction {
  from: string;
  to: string;
  amount: number;
}

export function calculateBalances(expenses: Expense[], members: string[]): Record<string, number> {
  const balances: Record<string, number> = {};
  
  // Initialize balances
  members.forEach(member => {
    balances[member] = 0;
  });

  expenses.forEach(expense => {
    // The person who paid gets a positive balance for the total amount
    if (balances[expense.paidBy] !== undefined) {
      balances[expense.paidBy] += expense.amount;
    }

    // Everyone involved owes an equal share
    const splitCount = expense.splitAmong.length;
    if (splitCount > 0) {
      const share = expense.amount / splitCount;
      expense.splitAmong.forEach(userId => {
        if (balances[userId] !== undefined) {
          balances[userId] -= share;
        }
      });
    }
  });

  return balances;
}

export function suggestSettlements(balances: Record<string, number>): Transaction[] {
  const debtors: { userId: string; amount: number }[] = [];
  const creditors: { userId: string; amount: number }[] = [];

  // Separate into debtors (owe money) and creditors (owed money)
  Object.entries(balances).forEach(([userId, amount]) => {
    // We use a small epsilon to handle floating point inaccuracies
    if (amount < -0.01) {
      debtors.push({ userId, amount: -amount }); // Store positive amount they owe
    } else if (amount > 0.01) {
      creditors.push({ userId, amount });
    }
  });

  // Sort both arrays descending by amount
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions: Transaction[] = [];
  let i = 0; // debtors index
  let j = 0; // creditors index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amountToSettle = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.userId,
      to: creditor.userId,
      amount: Math.round(amountToSettle * 100) / 100, // Round to 2 decimal places
    });

    debtor.amount -= amountToSettle;
    creditor.amount -= amountToSettle;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
}
