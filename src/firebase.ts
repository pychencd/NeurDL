import { initializeApp as _initializeApp } from 'firebase/app';
import { 
  getAuth as _getAuth, 
  GoogleAuthProvider as _GoogleAuthProvider, 
  signInWithPopup as _signInWithPopup, 
  signOut as _signOut, 
  onAuthStateChanged as _onAuthStateChanged,
  User as _FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore as _getFirestore, 
  doc as _doc, 
  getDoc as _getDoc, 
  setDoc as _setDoc, 
  updateDoc as _updateDoc, 
  deleteDoc as _deleteDoc, 
  collection as _collection, 
  onSnapshot as _onSnapshot, 
  query as _query, 
  orderBy as _orderBy, 
  getDocFromServer as _getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Export functions
export const initializeApp = _initializeApp;
export const getAuth = _getAuth;
export const GoogleAuthProvider = _GoogleAuthProvider;
export const signInWithPopup = _signInWithPopup;
export const signOut = _signOut;
export const onAuthStateChanged = _onAuthStateChanged;
export const getFirestore = _getFirestore;
export const doc = _doc;
export const getDoc = _getDoc;
export const setDoc = _setDoc;
export const updateDoc = _updateDoc;
export const deleteDoc = _deleteDoc;
export const collection = _collection;
export const onSnapshot = _onSnapshot;
export const query = _query;
export const orderBy = _orderBy;
export const getDocFromServer = _getDocFromServer;

// Initialize Firebase SDK
const app = _initializeApp(firebaseConfig);
export const db = _getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = _getAuth(app);
export const googleProvider = new _GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

export type FirebaseUser = _FirebaseUser;
