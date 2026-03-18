export interface User {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  isGuest?: boolean;
}

export interface Group {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  guestNames?: Record<string, string>;
  createdAt: any;
}

export interface Trip {
  id: string;
  groupId: string;
  name: string;
  createdBy: string;
  createdAt: any;
}

export interface Expense {
  id: string;
  tripId: string;
  description: string;
  amount: number;
  paidBy: string;
  splitAmong: string[];
  createdAt: any;
}
